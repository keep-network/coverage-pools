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

    function purchaseSignerBondsAtAuction() external;

    function currentState() external view returns (uint256);

    function lotSizeTbtc() external view returns (uint256);
}

/// @title RiskManagerV1 for tBTCv1
contract RiskManagerV1 is Auctioneer {
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

    uint256 public constant DEPOSIT_LIQUIDATION_IN_PROGRESS_STATE = 10;
    uint256 public constant DEPOSIT_LIQUIDATED_STATE = 11;

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
        auctionsByDepositsInLiquidation[depositAddress] = auctionAddress;
        depositsInLiquidationByAuctions[auctionAddress] = depositAddress;
    }

    /// @dev Call upon Coverage Pool auction end. At this point all the TBTC tokens
    ///      for the coverage pool auction should be transferred to this contract.
    /// @param auction Coverage pool auction.
    function actBeforeAuctionClose(Auction auction) public override {
        IDeposit deposit =
            IDeposit(depositsInLiquidationByAuctions[address(auction)]);
        // revert transaction in case deposit was bought outside this contract
        require(
            deposit.currentState() == DEPOSIT_LIQUIDATION_IN_PROGRESS_STATE,
            "Deposit is not in liquidation state"
        );
        uint256 approvedAmount = deposit.lotSizeTbtc();
        tbtcToken.approve(address(deposit), approvedAmount);

        // Buy signers bonds ETH with TBTC acquired from the auction (msg.sender)
        deposit.purchaseSignerBondsAtAuction();

        // ETH will be withdrawn to this contract
        deposit.withdrawFunds();

        delete auctionsByDepositsInLiquidation[address(deposit)];
        delete depositsInLiquidationByAuctions[address(auction)];
    }
}
