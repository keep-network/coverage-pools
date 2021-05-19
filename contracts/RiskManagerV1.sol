// SPDX-License-Identifier: MIT

pragma solidity <0.9.0;

import "./Auctioneer.sol";
import "./Auction.sol";
import "./CoveragePoolConstants.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @notice tBTC v1 Deposit contract interface.
/// @dev This is an interface with just a few function signatures of a main
///         contract for tBTC. For more info and function description
///         please see:
///         https://github.com/keep-network/tbtc/blob/solidity/v1.1.0/solidity/contracts/deposit/Deposit.sol
interface IDeposit {
    function withdrawFunds() external;

    function purchaseSignerBondsAtAuction() external;

    function currentState() external view returns (uint256);

    function lotSizeTbtc() external view returns (uint256);

    function withdrawableAmount() external view returns (uint256);
}

/// @title ISignerBondsSwapStrategy
/// @notice Represents a signer bonds swap strategy.
/// @dev This interface is meant to abstract the underlying signer bonds
///      swap strategy and make it interchangeable for the governance.
interface ISignerBondsSwapStrategy {
    /// @notice Processes the signer bonds.
    function processSignerBonds() external payable;
}

/// @title RiskManagerV1 for tBTCv1
contract RiskManagerV1 is Auctioneer, Ownable {
    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    uint256 public constant GOVERNANCE_TIME_DELAY = 12 hours;

    uint256 public constant DEPOSIT_LIQUIDATION_IN_PROGRESS_STATE = 10;
    uint256 public constant DEPOSIT_LIQUIDATED_STATE = 11;

    uint256 public auctionLength;
    uint256 public newAuctionLength;
    uint256 public auctionLengthChangeInitiated;

    IERC20 public tbtcToken;

    // TODO: should be possible to change by the governance.
    ISignerBondsSwapStrategy public signerBondsSwapStrategy;

    // deposit in liquidation => opened coverage pool auction
    mapping(address => address) public depositToAuction;
    // opened coverage pool auction => deposit in liquidation
    mapping(address => address) public auctionToDeposit;

    event NotifiedLiquidated(address indexed deposit, address notifier);
    event NotifiedLiquidation(address indexed deposit, address notifier);

    event AuctionLengthUpdateStarted(uint256 auctionLength, uint256 timestamp);
    event AuctionLengthUpdated(uint256 auctionLength);

    /// @notice Reverts if called before the delay elapses.
    /// @param changeInitiatedTimestamp Timestamp indicating the beginning
    ///        of the change.
    modifier onlyAfterGovernanceDelay(uint256 changeInitiatedTimestamp) {
        require(changeInitiatedTimestamp > 0, "Change not initiated");
        require(
            /* solhint-disable-next-line not-rely-on-time */
            block.timestamp.sub(changeInitiatedTimestamp) >=
                GOVERNANCE_TIME_DELAY,
            "Governance delay has not elapsed"
        );
        _;
    }

    constructor(
        IERC20 _tbtcToken,
        ISignerBondsSwapStrategy _signerBondsSwapStrategy,
        CoveragePool _coveragePool,
        address _masterAuction,
        uint256 _auctionLength
    ) Auctioneer(_coveragePool, _masterAuction) {
        tbtcToken = _tbtcToken;
        signerBondsSwapStrategy = _signerBondsSwapStrategy;
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
            createAuction(tbtcToken, lotSizeTbtc, auctionLength);
        depositToAuction[depositAddress] = auctionAddress;
        auctionToDeposit[auctionAddress] = depositAddress;
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

        Auction auction = Auction(depositToAuction[depositAddress]);

        delete depositToAuction[depositAddress];
        delete auctionToDeposit[address(auction)];
        earlyCloseAuction(auction);
    }

    /// @notice Begins the auction length update process.
    /// @dev Can be called only by the contract owner. The auction length should
    ///      be adjusted very carefully. Total value locked of the coverage pool
    ///      and minimum possible auction amount needs to be taken into account.
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
        onlyAfterGovernanceDelay(auctionLengthChangeInitiated)
    {
        auctionLength = newAuctionLength;
        emit AuctionLengthUpdated(newAuctionLength);
        newAuctionLength = 0;
        auctionLengthChangeInitiated = 0;
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

    /// @notice Purchase ETH from signer bonds and withdraw funds to this contract.
    /// @dev    This function is invoked when Auctioneer determines that an auction
    ///         is eligible to be closed. It cannot be called on-demand outside
    ///         the Auctioneer contract.
    ///         By the time this function is called, all the TBTC tokens for the
    ///         coverage pool auction should be transferred to this contract in
    ///         order to buy signer bonds.
    /// @param auction Coverage pool auction.
    function onAuctionFullyFilled(Auction auction) internal override {
        IDeposit deposit = IDeposit(auctionToDeposit[address(auction)]);

        delete depositToAuction[address(deposit)];
        delete auctionToDeposit[address(auction)];

        uint256 approvedAmount = deposit.lotSizeTbtc();
        tbtcToken.safeApprove(address(deposit), approvedAmount);

        // Purchase signers bonds ETH with TBTC acquired from the auction
        deposit.purchaseSignerBondsAtAuction();

        uint256 withdrawableAmount = deposit.withdrawableAmount();
        deposit.withdrawFunds();

        // slither-disable-next-line arbitrary-send
        signerBondsSwapStrategy.processSignerBonds{value: withdrawableAmount}();
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
