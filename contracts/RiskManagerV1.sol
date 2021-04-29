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

    // deposit in liquidation address => coverage pool auction address
    mapping(address => address) public auctionsByDepositsInLiquidation;

    event NotifiedLiquidated(address indexed deposit, address notifier);
    event NotifiedLiquidation(address indexed deposit, address notifier);

    constructor(IERC20 _token, address _auctioneer) {
        tbtcToken = _token;
        auctioneer = Auctioneer(_auctioneer);
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
            auctioneer.createAuction(tbtcToken, lotSizeTbtc, auctionLength);
        //slither-disable-next-line reentrancy-benign
        auctionsByDepositsInLiquidation[depositAddress] = auctionAddress;
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
        auctioneer.earlyCloseAuction(auction);
        //slither-disable-next-line reentrancy-no-eth
        delete auctionsByDepositsInLiquidation[depositAddress];
    }

    /// @dev Call upon Coverage Pool auction end. At this point all the TBTC tokens
    ///      for the coverage pool auction should be transferred to auctioneer.
    /// @param  deposit tBTC Deposit
    function collectTbtcSignerBonds(IDeposit deposit) external {
        deposit.purchaseSignerBondsAtAuction();

        // TODO: Once receiving ETH, funds need to be processes further, so
        //       they won't be locked in this contract.
        deposit.withdrawFunds();
    }
}
