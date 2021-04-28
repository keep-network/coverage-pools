// SPDX-License-Identifier: MIT

pragma solidity <0.9.0;

import "./CollateralPool.sol";
import "./Auctioneer.sol";
import "./Auction.sol";
import "./CoveragePoolConstants.sol";
import {IDeposit, DepositStates} from "./external/Tbtc.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

/// @title RiskManagerV1 for tBTCv1
contract RiskManagerV1 is IRiskManager {
    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    IERC20 public tbtcToken;
    Auctioneer public auctioneer;

    // deposit in liquidation address => coverage pool auction address
    mapping(address => address) public auctionsByDepositsInLiquidation;
    // auctions => deposits
    mapping(address => address) public depositsInLiquidationByAuctions;

    event NotifiedLiquidated(address indexed notifier, address deposit);
    event NotifiedLiquidation(address indexed notifier, address deposit);

    constructor(IERC20 _token, address payable _auctioneer) {
        tbtcToken = _token;
        auctioneer = Auctioneer(_auctioneer);
    }

    /// @notice Receive ETH from tBTC for purchasing & withdrawing signer bonds
    receive() external payable {}

    /// @notice Closes an auction early.
    /// @param  depositAddress tBTC Deposit address
    function notifyLiquidated(address depositAddress) external {
        IDeposit deposit = IDeposit(depositAddress);
        require(
            deposit.currentState() == DepositStates.getDepositLiquidatedState(),
            "Deposit is not in liquidated state"
        );
        emit NotifiedLiquidated(msg.sender, depositAddress);

        Auction auction =
            Auction(auctionsByDepositsInLiquidation[depositAddress]);
        auctioneer.earlyCloseAuction(auction);

        delete auctionsByDepositsInLiquidation[depositAddress];
        delete depositsInLiquidationByAuctions[address(auction)];
    }

    /// @notice Creates an auction for tbtc deposit in liquidation state.
    /// @param  depositAddress tBTC Deposit address
    function notifyLiquidation(address depositAddress) external {
        IDeposit deposit = IDeposit(depositAddress);
        require(
            deposit.currentState() ==
                DepositStates.getDepositLiquidationInProgressState(),
            "Deposit is not in liquidation state"
        );

        // TODO: need to add some % to "lotSizeTbtc" to cover a notifier incentive.
        uint256 lotSizeTbtc = deposit.lotSizeTbtc();

        // TODO: Need to read the market conditions of assets from Uniswap / 1inch
        //       Based on this data the auction length should be adjusted
        uint256 auctionLength = 86400; // in sec, hardcoded 24h

        emit NotifiedLiquidation(msg.sender, depositAddress);

        address auctionAddress =
            auctioneer.createAuction(tbtcToken, lotSizeTbtc, auctionLength);
        auctionsByDepositsInLiquidation[depositAddress] = auctionAddress;
        depositsInLiquidationByAuctions[auctionAddress] = depositAddress;
    }

    /// @dev Call upon Coverage Pool auction end. At this point all the TBTC tokens
    ///      for the coverage pool auction should be transferred to this contract.
    /// @param auction Coverage pool auction.
    function collectCollateral(Auction auction) external override {
        IDeposit deposit =
            IDeposit(depositsInLiquidationByAuctions[address(auction)]);
        // Buy signers bonds ETH with TBTC acquired from the auction (msg.sender)
        deposit.purchaseSignerBondsAtAuction();

        // ETH will be withdrawn to this contract
        deposit.withdrawFunds();
    }
}
