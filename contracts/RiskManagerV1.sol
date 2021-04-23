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

    event NotifiedLiquidated(address indexed notifier, address deposit);
    event NotifiedLiquidation(address indexed notifier, address deposit);

    constructor(IERC20 _token, address _auctioneer) {
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
            deposit.currentState() == DEPOSIT_LIQUIDATED_STATE,
            "Deposit is not in liquidated"
        );
        emit NotifiedLiquidated(msg.sender, depositAddress);

        Auction auction = Auction(auctionsByDepositAddress[depositAddress]);
        auctioneer.earlyCloseAuction(auction);
    }

    /// @notice Creates an auction for tbtc deposit in liquidation state.
    /// @param  depositAddress tBTC Deposit address
    function notifyLiquidation(address depositAddress) external {
        IDeposit deposit = IDeposit(depositAddress);
        require(
            deposit.currentState() == DEPOSIT_LIQUIDATION_IN_PROGRESS_STATE,
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
        auctionsByDepositAddress[depositAddress] = auctionAddress;
    }

    /// @dev Call upon Coverage Pool auction end. At this point all the TBTC tokens
    ///      for the coverage pool auction should be transferred to auctioneer.
    /// @param  deposit tBTC Deposit
    function collectTbtcSignerBonds(IDeposit deposit) external {
        // TODO: "auctioneer" holds TBTC for the Coverage Pool auction.
        //       - if we purchase signer bonds from this RiskManager, then we need to allow
        //       RiskManger to use TBTC on behalf of "auctioneer"
        //       - otherwise, auctionner needs to buy signer bonds (ex. at the end of an
        //       auction - last takeOffer() call)
        deposit.purchaseSignerBondsAtAuction();

        deposit.withdrawFunds();
    }
}
