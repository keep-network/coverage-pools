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
    function withdrawFunds() external;

    function purchaseSignerBondsAtAuction() external;

    function currentState() external view returns (uint256);

    function lotSizeTbtc() external view returns (uint256);
}

/// @title RiskManagerV1 for tBTCv1
contract RiskManagerV1 is Auctioneer {
    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    uint256 public constant DEPOSIT_LIQUIDATION_IN_PROGRESS_STATE = 10;
    uint256 public constant DEPOSIT_LIQUIDATED_STATE = 11;
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
        uint256 auctionLength = 86400; // in sec, hardcoded 24h

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

    /// @notice Purchase ETH from signer bonds and withdraw funds to this contract.
    /// @dev    This function is invoked when Auctioneer determines that an auction
    ///         is eligible to be closed. It cannot be called on-demand outside
    ///         the Auctioneer contract.
    ///         By the time this function is called, all the TBTC tokens for the
    ///         coverage pool auction should be transferred to this contract in
    ///         order to buy signer bonds.
    /// @param auction Coverage pool auction.
    function onBeforeAuctionClose(Auction auction) internal override {
        IDeposit deposit =
            IDeposit(depositsInLiquidationByAuctions[address(auction)]);

        delete auctionsByDepositsInLiquidation[address(deposit)];
        delete depositsInLiquidationByAuctions[address(auction)];

        uint256 approvedAmount = deposit.lotSizeTbtc();
        tbtcToken.safeApprove(address(deposit), approvedAmount);

        // Purchase signers bonds ETH with TBTC acquired from the auction
        deposit.purchaseSignerBondsAtAuction();

        // TODO: Once ETH is received, funds need to be processed further, so
        //       they won't be locked in this contract.
        deposit.withdrawFunds();
    }
}
