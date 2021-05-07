// SPDX-License-Identifier: MIT

pragma solidity <0.9.0;

import "./CollateralPool.sol";
import "./Auctioneer.sol";
import "./Auction.sol";
import "./CoveragePoolConstants.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

/// @notice This is an interface with just a few function signatures of a main
///         contract for tBTC. For more info and function description
///         please see:
///         https://github.com/keep-network/tbtc/blob/master/solidity/contracts/deposit/Deposit.sol
interface IDeposit {
    /// @notice Withdraw the ETH balance of the deposit allotted to the caller.
    function withdrawFunds() external;

    /// @notice Closes a tBTC deposit auction and purchases the signer bonds by
    ///         transferring the lot size in TBTC.
    function purchaseSignerBondsAtAuction() external;

    /// @notice Get the integer representing the current state of deposit.
    function currentState() external view returns (uint256);

    /// @notice Get this deposit's lot size in TBTC.
    function lotSizeTbtc() external view returns (uint256);

    /// @notice Get this deposit's withdrawable amount in WEIs.
    function withdrawableAmount() external view returns (uint256);
}

/// @title ISignerBondsProcessor
/// @notice Represents a signer bonds processor.
/// @dev This interface is meant to abstract the underlying signer bonds
///      processing strategy and make it interchangeable for the governance.
interface ISignerBondsProcessor {
    /// @notice Processes the signer bonds.
    function processSignerBonds() external payable;
}

/// @title RiskManagerV1 for tBTCv1
contract RiskManagerV1 is Auctioneer {
    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    uint256 public constant DEPOSIT_LIQUIDATION_IN_PROGRESS_STATE = 10;
    uint256 public constant DEPOSIT_LIQUIDATED_STATE = 11;

    IERC20 public tbtcToken;
    // tBTC surplus collected from early closed auctions.
    uint256 public tbtcSurplus;
    // opened coverage pool auction => reserved tBTC surplus amount
    mapping(address => uint256) public tbtcSurplusReservations;

    // TODO: should be possible to change by the governance.
    ISignerBondsProcessor public signerBondsProcessor;

    // deposit in liquidation => opened coverage pool auction
    mapping(address => address) public auctionsByDepositsInLiquidation;
    // opened coverage pool auction => deposit in liquidation
    mapping(address => address) public depositsInLiquidationByAuctions;

    event NotifiedLiquidated(address indexed deposit, address notifier);
    event NotifiedLiquidation(address indexed deposit, address notifier);

    constructor(IERC20 _token, ISignerBondsProcessor _signerBondsProcessor) {
        tbtcToken = _token;
        signerBondsProcessor = _signerBondsProcessor;
    }

    /// @notice Receive ETH from tBTC for purchasing & withdrawing signer bonds
    //
    //slither-disable-next-line locked-ether
    receive() external payable {}

    /// @notice Creates an auction for tbtc deposit in liquidation state.
    /// @param  depositAddress tBTC Deposit address
    function notifyLiquidation(address depositAddress) external {
        IDeposit deposit = IDeposit(depositAddress);
        require(
            deposit.currentState() == DEPOSIT_LIQUIDATION_IN_PROGRESS_STATE,
            "Deposit is not in liquidation state"
        );

        // TODO: check the deposit collateralization
        //       Risk manager will create an auction only for deposits that nobody
        //       else is willing to take.

        // TODO: need to add some % to "lotSizeTbtc" to cover a notifier incentive.
        uint256 lotSizeTbtc = deposit.lotSizeTbtc();

        // TODO: Need to read the market conditions of assets from Uniswap / 1inch
        //       Based on this data the auction length should be adjusted
        uint256 auctionLength = 86400; // in sec, hardcoded 24h

        emit NotifiedLiquidation(depositAddress, msg.sender);

        // TODO: Adjust the auction length according to the used surplus amount
        //       in order to preserve the same profitability delay.
        (, uint256 auctionAmountTbtc) = lotSizeTbtc.trySub(tbtcSurplus);
        uint256 tbtcSurplusReserved = lotSizeTbtc.sub(auctionAmountTbtc);
        tbtcSurplus = tbtcSurplus.sub(tbtcSurplusReserved);

        // If the surplus can cover the deposit liquidation cost, liquidate
        // that deposit directly without the auction process.
        if (auctionAmountTbtc == 0) {
            liquidateDeposit(deposit);
            return;
        }

        address auctionAddress =
            createAuction(tbtcToken, auctionAmountTbtc, auctionLength);
        //slither-disable-next-line reentrancy-benign
        auctionsByDepositsInLiquidation[depositAddress] = auctionAddress;
        depositsInLiquidationByAuctions[auctionAddress] = depositAddress;
        tbtcSurplusReservations[auctionAddress] = tbtcSurplusReserved;
    }

    /// @notice Closes an auction early.
    /// @param  depositAddress tBTC Deposit address
    function notifyLiquidated(address depositAddress) external {
        IDeposit deposit = IDeposit(depositAddress);
        require(
            deposit.currentState() == DEPOSIT_LIQUIDATED_STATE,
            "Deposit is not in liquidated state"
        );
        emit NotifiedLiquidated(depositAddress, msg.sender);

        Auction auction =
            Auction(auctionsByDepositsInLiquidation[depositAddress]);

        // Add auction's transferred amount to the surplus pool and return
        // the surplus reservation taken upon auction initialization.
        tbtcSurplus = tbtcSurplus.add(
            auction.amountTransferred().add(
                tbtcSurplusReservations[address(auction)]
            )
        );

        earlyCloseAuction(auction);
        //slither-disable-next-line reentrancy-no-eth
        delete auctionsByDepositsInLiquidation[depositAddress];
        //slither-disable-next-line reentrancy-no-eth,reentrancy-benign
        delete depositsInLiquidationByAuctions[address(auction)];
        delete tbtcSurplusReservations[address(auction)];
    }

    /// @notice Cleans up auction and deposit data and executes deposit liquidation.
    /// @dev This function is invoked when Auctioneer determines that an auction
    ///      is eligible to be closed. It cannot be called on-demand outside
    ///      the Auctioneer contract. By the time this function is called, all
    ///      the TBTC tokens for the coverage pool auction should be transferred
    ///      to this contract in order to buy signer bonds.
    /// @param auction Coverage pool auction.
    function actBeforeAuctionClose(Auction auction) internal override {
        IDeposit deposit =
            IDeposit(depositsInLiquidationByAuctions[address(auction)]);

        delete auctionsByDepositsInLiquidation[address(deposit)];
        delete depositsInLiquidationByAuctions[address(auction)];
        delete tbtcSurplusReservations[address(auction)];

        liquidateDeposit(deposit);
    }

    /// @notice Purchases ETH from signer bonds and processes obtained funds
    ///         using the underlying signer bonds processing strategy.
    /// @dev By the time this function is called, TBTC token balance for this
    ///      contract should be enough to buy signer bonds.
    /// @param deposit TBTC deposit which should be liquidated.
    function liquidateDeposit(IDeposit deposit) internal {
        require(
            tbtcToken.approve(address(deposit), deposit.lotSizeTbtc()),
            "TBTC Token approval failed"
        );

        // Purchase signers bonds ETH with TBTC acquired from the auction
        deposit.purchaseSignerBondsAtAuction();

        uint256 withdrawableAmount = deposit.withdrawableAmount();
        deposit.withdrawFunds();

        // slither-disable-next-line arbitrary-send
        signerBondsProcessor.processSignerBonds{value: withdrawableAmount}();
    }
}
