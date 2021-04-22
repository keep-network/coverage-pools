// SPDX-License-Identifier: MIT

pragma solidity <0.9.0;

import "./CollateralPool.sol";
import "./Auctioneer.sol";
import "./Auction.sol";
import "./CoveragePoolConstants.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

interface IDeposit {
    function withdrawFunds() external;

    function currentState() external view returns (uint256);

    function lotSizeTbtc() external view returns (uint256);

    function purchaseSignerBondsAtAuction() external view;
}

/// @title RiskManagerV1 for tBTCv1
contract RiskManagerV1 {
    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    IERC20 public tbtcToken;
    Auctioneer public auctioneer;

    uint256 public constant DEPOSIT_LIQUIDATION_IN_PROGRESS_STATE = 10;
    uint256 public constant DEPOSIT_LIQUIDATED_STATE = 11;

    mapping(address => address) public auctionsByDepositAddress;

    event NotifiedLiquidated(IDeposit deposit);
    event NotifiedLiquidation(IDeposit deposit);

    constructor(IERC20 _token, address _auctioneer) {
        tbtcToken = _token;
        auctioneer = Auctioneer(_auctioneer);
    }

    /// @notice Receive ETH from tBTC for purchasing & withdrawing signer bonds
    receive() external payable {}

    // TODO: What contract can withdraw ETH from here? Need to add a modifier that
    //       restricts who can withdraw ETH.
    //       Should it have a partial withdrawal option? Or is it all-or-nothing withdrawal?
    /// @notice Withdraw ETH from this contract.
    function withdrawFunds() external {
        require(address(this).balance > 0, "Nothing to withdraw");

        /* solhint-disable-next-line */
        (bool success, ) = msg.sender.call{value: address(this).balance}("");
        require(success, "Failed to withdraw ETH");
    }

    /// @notice Closes an auction early.
    /// @param  deposit tBTC Deposit
    function notifyLiquidated(IDeposit deposit) public {
        require(
            deposit.currentState() == DEPOSIT_LIQUIDATED_STATE,
            "Deposit is not in liquidated"
        );

        Auction auction = Auction(auctionsByDepositAddress[address(deposit)]);
        auctioneer.earlyCloseAuction(auction);

        emit NotifiedLiquidated(deposit);

        // TODO: transfer 0.5% of the lot size to a notifier?
        //       When should we transfer 0.5% to a notifier?
    }

    /// @notice Creates an auction for tbtc deposit in liquidation state.
    /// @param  deposit tBTC Deposit
    function notifyLiquidation(IDeposit deposit) public {
        require(
            deposit.currentState() == DEPOSIT_LIQUIDATION_IN_PROGRESS_STATE,
            "Deposit is not in liquidation state"
        );

        uint256 lotSizeTbtc = deposit.lotSizeTbtc();
        uint256 notifierEarnings = lotSizeTbtc.mul(5).div(1000); // 0.5% of the lot size
        uint256 amountDesired = lotSizeTbtc.add(notifierEarnings);

        // TODO: Need to read the market conditions of assets based on Uniswap / 1inch
        //       Based on this data the auction length should be adjusted
        uint256 auctionLength = 86400; // in sec, hardcoded 24h

        address auctionAddress =
            auctioneer.createAuction(tbtcToken, amountDesired, auctionLength);
        auctionsByDepositAddress[address(deposit)] = auctionAddress;

        emit NotifiedLiquidation(deposit);

        // TODO: transfer 0.5% of the lot size to a notifier?
        //       When should we transfer 0.5% to a notifier?
    }

    /// @dev Call upon Coverage Pool auction end. At this point all the TBTC tokens
    ///      for the coverage pool auction should be transferred to auctioneer.
    /// @param  deposit tBTC Deposit
    function collectTbtcSignerBonds(IDeposit deposit) public {
        // TODO: "auctioneer" holds TBTC for the Coverage Pool auction.
        //       - if we purchase signer bonds from a RiskManager, then we need to allow
        //       RiskManger to use TBTC on behalf of "auctioneer"
        //       - otherwise, auctionner needs to buy signer bonds (ex. at the end of an
        //       auction?)
        deposit.purchaseSignerBondsAtAuction();

        deposit.withdrawFunds();
    }
}
