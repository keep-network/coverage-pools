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
}

/// @title RiskManagerV1 for tBTCv1
contract RiskManagerV1 is Auctioneer {
    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    uint256 public constant DEPOSIT_LIQUIDATION_IN_PROGRESS_STATE = 10;
    uint256 public constant DEPOSIT_LIQUIDATED_STATE = 11;
    uint256 public auctionLength = 86400; // in sec, hardcoded 24h
    IERC20 public tbtcToken;

    // deposit in liquidation => opened coverage pool auction
    mapping(address => address) public auctionsByDepositsInLiquidation;
    // opened coverage pool auction => deposit in liquidation
    mapping(address => address) public depositsInLiquidationByAuctions;

    event NotifiedLiquidated(address indexed deposit, address notifier);
    event NotifiedLiquidation(address indexed deposit, address notifier);

    constructor(IERC20 _token) {
        tbtcToken = _token;
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

        emit NotifiedLiquidation(depositAddress, msg.sender);

        address auctionAddress =
            createAuction(tbtcToken, lotSizeTbtc, auctionLength);
        //slither-disable-next-line reentrancy-benign
        auctionsByDepositsInLiquidation[depositAddress] = auctionAddress;
        depositsInLiquidationByAuctions[auctionAddress] = depositAddress;
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

        // TODO: In case of an auction early close, we might end up having
        //       TBTC hanging in this contract. Need to decide what to do with
        //       these tokens.

        Auction auction =
            Auction(auctionsByDepositsInLiquidation[depositAddress]);
        earlyCloseAuction(auction);
        //slither-disable-next-line reentrancy-no-eth
        delete auctionsByDepositsInLiquidation[depositAddress];
        //slither-disable-next-line reentrancy-no-eth,reentrancy-benign
        delete depositsInLiquidationByAuctions[address(auction)];
    }

    // TODO: we already have PR opened for auctions length update:
    // https://github.com/keep-network/coverage-pools/pull/28
    // The simplified function below is for testing purposes only and the tests that
    // use it will need to be adjusted accordingly after #28 lands in main.
    function updateAuctionLength(uint256 _auctionLength) external {
        auctionLength = _auctionLength;
    }

    /// @notice Purchase ETH from signer bonds and withdraw funds to this contract.
    /// @dev    This function is invoked when Auctioneer determines that an auction
    ///         is eligible to be closed. It cannot be called on-demand outside
    ///         the Auctioneer contract.
    ///         By the time this function is called, all the TBTC tokens for the
    ///         coverage pool auction should be transferred to this contract in
    ///         order to buy signer bonds.
    /// @param auction Coverage pool auction.
    function actBeforeAuctionClose(Auction auction) internal override {
        IDeposit deposit =
            IDeposit(depositsInLiquidationByAuctions[address(auction)]);

        delete auctionsByDepositsInLiquidation[address(deposit)];
        delete depositsInLiquidationByAuctions[address(auction)];

        uint256 approvedAmount = deposit.lotSizeTbtc();
        bool success = tbtcToken.approve(address(deposit), approvedAmount);
        require(success, "TBTC Token approval failed");

        // Purchase signers bonds ETH with TBTC acquired from the auction
        deposit.purchaseSignerBondsAtAuction();

        // TODO: Once ETH is received, funds need to be processed further, so
        //       they won't be locked in this contract.
        deposit.withdrawFunds();
    }
}
