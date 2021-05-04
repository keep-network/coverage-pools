// SPDX-License-Identifier: MIT

pragma solidity <0.9.0;

import "./CollateralPool.sol";
import "./Auctioneer.sol";
import "./Auction.sol";
import "./CoveragePoolConstants.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

interface IDeposit {
    function withdrawFunds() external;

    function currentState() external view returns (uint256);

    function lotSizeTbtc() external view returns (uint256);

    function purchaseSignerBondsAtAuction() external view;
}

/// @title RiskManagerV1 for tBTCv1
contract RiskManagerV1 is Ownable {
    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    IERC20 public tbtcToken;
    Auctioneer public auctioneer;

    // TODO: Need to read the market conditions of assets from Uniswap / 1inch
    //       Based on this data the auction length should be adjusted.
    uint256 private auctionLength;
    uint256 private newAuctionLength;
    uint256 private auctionLengthChangeInitiated;

    uint256 public constant GOVERNANCE_TIME_DELAY = 12 hours;
    uint256 public constant DEPOSIT_LIQUIDATION_IN_PROGRESS_STATE = 10;
    uint256 public constant DEPOSIT_LIQUIDATED_STATE = 11;

    // deposit in liquidation address => coverage pool auction address
    mapping(address => address) public auctionsByDepositsInLiquidation;

    event NotifiedLiquidated(address indexed deposit, address notifier);
    event NotifiedLiquidation(address indexed deposit, address notifier);

    event AuctionLengthUpdateStarted(uint256 auctionLength, uint256 timestamp);
    event AuctionLengthUpdated(uint256 auctionLength);

    /// @notice Throws if called before the delay elapses.
    /// @param changeTimestamp Timestamp indicating the beginning of the change.
    /// @param delay Governance delay.
    modifier onlyAfterGovernanceDelay(uint256 changeTimestamp, uint256 delay) {
        require(changeTimestamp > 0, "Change not initiated");
        require(
            /* solhint-disable-next-line not-rely-on-time */
            block.timestamp.sub(changeTimestamp) >= delay,
            "Governance delay has not elapsed"
        );
        _;
    }

    constructor(
        IERC20 _token,
        address _auctioneer,
        uint256 _auctionLength
    ) {
        tbtcToken = _token;
        auctioneer = Auctioneer(_auctioneer);
        auctionLength = _auctionLength;
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

        // TODO: In case of an auction early close, we might end up having
        //       TBTC hanging in this contract. Need to decide what to do with
        //       these tokens.

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

    /// @notice Begins the auction length update process.
    /// @dev Can be called only by the contract owner.
    /// @param _newAuctionLength New auction length in seconds.
    function beginAuctionLengthUpdate(uint256 _newAuctionLength)
        external
        onlyOwner
    {
        newAuctionLength = _newAuctionLength;
        /* solhint-disable-next-line not-rely-on-time */
        auctionLengthChangeInitiated = block.timestamp;
        /* solhint-disable-next-line not-rely-on-time */
        emit AuctionLengthUpdateStarted(_newAuctionLength, block.timestamp);
    }

    /// @notice Finalizes the auction length update process.
    /// @dev Can be called only by the contract owner, after the the
    ///      governance delay elapses.
    function finalizeAuctionLengthUpdate()
        external
        onlyOwner
        onlyAfterGovernanceDelay(
            auctionLengthChangeInitiated,
            GOVERNANCE_TIME_DELAY
        )
    {
        auctionLength = newAuctionLength;
        emit AuctionLengthUpdated(newAuctionLength);
        newAuctionLength = 0;
        auctionLengthChangeInitiated = 0;
    }

    /// @notice Get the current value of the auction length parameter.
    /// @return Auction length in seconds.
    function getAuctionLength() external view returns (uint256) {
        return auctionLength;
    }

    /// @notice Get the time remaining until the auction length parameter
    ///         can be updated.
    /// @return Remaining time in seconds.
    function getRemainingAuctionLengthUpdateTime()
        external
        view
        returns (uint256)
    {
        return
            getRemainingChangeTime(
                auctionLengthChangeInitiated,
                GOVERNANCE_TIME_DELAY
            );
    }

    /// @notice Get the time remaining until the function parameter timer
    ///         value can be updated.
    /// @param changeTimestamp Timestamp indicating the beginning of the change.
    /// @param delay Governance delay.
    /// @return Remaining time in seconds.
    function getRemainingChangeTime(uint256 changeTimestamp, uint256 delay)
        internal
        view
        returns (uint256)
    {
        require(changeTimestamp > 0, "Update not initiated");
        /* solhint-disable-next-line not-rely-on-time */
        uint256 elapsed = block.timestamp.sub(changeTimestamp);
        if (elapsed >= delay) {
            return 0;
        } else {
            return delay.sub(elapsed);
        }
    }
}
