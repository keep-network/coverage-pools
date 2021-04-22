// SPDX-License-Identifier: MIT

pragma solidity <0.9.0;

import "./CollateralPool.sol";
import "./external/IDeposit.sol";
import "./Auctioneer.sol";
import "./Auction.sol";
import "./CoveragePoolConstants.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

/// @title RiskManagerV1 for tBTCv1
contract RiskManagerV1 {
    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    IERC20 public tbtcToken;
    Auctioneer public auctioneer;

    mapping(uint256 => address) auctionsByDepositId;

    constructor(IERC20 _token, address _auctioneer) {
        tbtcToken = _token;
        auctioneer = Auctioneer(_auctioneer);
    }

    /// @notice Receive Ether from tBTC for purchasing & withdrawing signer bonds
    receive() external payable {}

    function getBalance() public view returns (uint256) {
        return address(this).balance;
    }

    // TODO: who calls this function?
    /// @notice Closes an auction early.
    /// @param  tdtId ID of tBTC Deposit Token
    function notifyLiquidated(uint256 tdtId) public {
        IDeposit deposit = IDeposit(address(uint160(tdtId)));
        uint256 currentState = deposit.currentState();

        require(currentState == CoveragePoolConstants.getLiquidationInProgressState(), "Deposit is not in liquidation state");

        Auction auction = Auction(auctionsByDepositId[tdtId]);
        // TODO: can we change an arg from Auction to address?
        auctioneer.earlyCloseAuction(auction);

        // TODO: transfer 0.5% of the lot size to a notifier?
    }

    /// @notice Creates an auction for tbtc deposit in liquidation state.
    /// @param  tdtId ID of tBTC Deposit Token
    function notifyLiquidation(uint256 tdtId) public {
        IDeposit deposit = IDeposit(address(uint160(tdtId)));
        uint256 currentState = deposit.currentState();

        require(currentState == CoveragePoolConstants.getLiquidationInProgressState(), "Deposit is not in liquidation state");

        uint256 lotSizeTbtc = deposit.lotSizeTbtc();
        // TODO: Is it okay to lose precision here, ie 123456 / 1000 => 123?
        uint256 notifierEarnings = lotSizeTbtc.div(1000).mul(5); // 0.5% of the lot size
        uint256 amountDesired = lotSizeTbtc.add(notifierEarnings);

        // TODO: Need to read the market conditions of assets based on Uniswap / 1inch
        //       Based on this data the auction length should be adjusted
        uint256 auctionLength = 86400; // hardcoded 24h

        address auctionAddress = auctioneer.createAuction(tbtcToken, amountDesired, auctionLength);
        auctionsByDepositId[tdtId] = auctionAddress;

        // TODO: transfer 0.5% of the lot size to a notifier.
        //       When should we transfer 0.5% to a notifier? Is it when an auction ends?
    }

    /// TODO: who calls this function? Shouldn't it be called inside Auctioneer.offerTaken()
    ///       upon closing an auction?
    /// @dev Call upon Coverage Pool auction end. At this point all the funds
    ///      for the coverage pool auction should be transferred to auctioneer.
    /// @param  tdtId ID of tBTC Deposit Token
    function collectTbtcSignerBonds(uint256 tdtId) public {
        IDeposit deposit = IDeposit(address(uint160(tdtId)));
        deposit.purchaseSignerBondsAtAuction();
        
        deposit.withdrawFunds();

        // TODO: Convert (all?) available ETH to WETH
        //       Put WETH back to WETH asset pool
        //       "auctioneer" holds the funds for the Coverage Pool auction.
    }
}