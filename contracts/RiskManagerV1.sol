// ▓▓▌ ▓▓ ▐▓▓ ▓▓▓▓▓▓▓▓▓▓▌▐▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▄
// ▓▓▓▓▓▓▓▓▓▓ ▓▓▓▓▓▓▓▓▓▓▌▐▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓
//   ▓▓▓▓▓▓    ▓▓▓▓▓▓▓▀    ▐▓▓▓▓▓▓    ▐▓▓▓▓▓   ▓▓▓▓▓▓     ▓▓▓▓▓   ▐▓▓▓▓▓▌   ▐▓▓▓▓▓▓
//   ▓▓▓▓▓▓▄▄▓▓▓▓▓▓▓▀      ▐▓▓▓▓▓▓▄▄▄▄         ▓▓▓▓▓▓▄▄▄▄         ▐▓▓▓▓▓▌   ▐▓▓▓▓▓▓
//   ▓▓▓▓▓▓▓▓▓▓▓▓▓▀        ▐▓▓▓▓▓▓▓▓▓▓         ▓▓▓▓▓▓▓▓▓▓         ▐▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓
//   ▓▓▓▓▓▓▀▀▓▓▓▓▓▓▄       ▐▓▓▓▓▓▓▀▀▀▀         ▓▓▓▓▓▓▀▀▀▀         ▐▓▓▓▓▓▓▓▓▓▓▓▓▓▓▀
//   ▓▓▓▓▓▓   ▀▓▓▓▓▓▓▄     ▐▓▓▓▓▓▓     ▓▓▓▓▓   ▓▓▓▓▓▓     ▓▓▓▓▓   ▐▓▓▓▓▓▌
// ▓▓▓▓▓▓▓▓▓▓ █▓▓▓▓▓▓▓▓▓ ▐▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  ▓▓▓▓▓▓▓▓▓▓
// ▓▓▓▓▓▓▓▓▓▓ ▓▓▓▓▓▓▓▓▓▓ ▐▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  ▓▓▓▓▓▓▓▓▓▓
//
//                           Trust math, not hardware.

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

    function notifyRedemptionSignatureTimedOut() external;

    function currentState() external view returns (uint256);

    function lotSizeTbtc() external view returns (uint256);

    function withdrawableAmount() external view returns (uint256);

    function auctionValue() external view returns (uint256);
}

/// @title ISignerBondsSwapStrategy
/// @notice Represents a signer bonds swap strategy.
/// @dev This interface is meant to abstract the underlying signer bonds
///      swap strategy and make it interchangeable for the governance.
interface ISignerBondsSwapStrategy {
    /// @notice Swaps signer bonds.
    function swapSignerBonds() external payable;
}

/// @title RiskManagerV1 for tBTCv1
contract RiskManagerV1 is Auctioneer, Ownable {
    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    uint256 public constant GOVERNANCE_TIME_DELAY = 12 hours;

    uint256 public constant DEPOSIT_LIQUIDATION_IN_PROGRESS_STATE = 10;
    uint256 public constant DEPOSIT_LIQUIDATED_STATE = 11;
    // Coverage pool auction will not be opened if the deposit's bond auction
    // offers a bond percentage lower than this threshold.
    // Risk manager should open a coverage pool auction for only those deposits
    // that nobody else is willing to purchase. The default value can be updated
    // by the governance in two steps. First step is to begin the update process
    // with the new value and the second step is to finalize it after
    // GOVERNANCE_TIME_DELAY has passed.
    uint256 public bondAuctionThreshold; // percent
    uint256 public newBondAuctionThreshold;
    uint256 public bondAuctionThresholdChangeInitiated;

    uint256 public auctionLength;
    uint256 public newAuctionLength;
    uint256 public auctionLengthChangeInitiated;

    IERC20 public tbtcToken;
    // tBTC surplus collected from early closed auctions.
    uint256 public tbtcSurplus;

    ISignerBondsSwapStrategy public signerBondsSwapStrategy;
    ISignerBondsSwapStrategy public newSignerBondsSwapStrategy;
    uint256 public signerBondsSwapStrategyInitiated;

    // deposit in liquidation => opened coverage pool auction
    mapping(address => address) public depositToAuction;
    // opened coverage pool auction => deposit in liquidation
    mapping(address => address) public auctionToDeposit;

    event NotifiedLiquidated(address indexed deposit, address notifier);
    event NotifiedLiquidation(address indexed deposit, address notifier);

    event AuctionLengthUpdateStarted(uint256 auctionLength, uint256 timestamp);
    event AuctionLengthUpdated(uint256 auctionLength);

    event BondAuctionThresholdUpdateStarted(
        uint256 bondAuctionThreshold,
        uint256 timestamp
    );
    event BondAuctionThresholdUpdated(uint256 bondAuctionThreshold);

    event SignerBondsSwapStrategyUpdateStarted(
        address indexed signerBondsSwapStrategy,
        uint256 timestamp
    );
    event SignerBondsSwapStrategyUpdated(
        address indexed signerBondsSwapStrategy
    );

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
        CoveragePool _coveragePool,
        ISignerBondsSwapStrategy _signerBondsSwapStrategy,
        address _masterAuction,
        uint256 _auctionLength,
        uint256 _bondAuctionThreshold
    ) Auctioneer(_coveragePool, _masterAuction) {
        tbtcToken = _tbtcToken;
        signerBondsSwapStrategy = _signerBondsSwapStrategy;
        auctionLength = _auctionLength;
        bondAuctionThreshold = _bondAuctionThreshold;
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

        // TODO: check bondAuctionThreshold

        // TODO: need to add some % to "lotSizeTbtc" to cover a notifier incentive.
        uint256 lotSizeTbtc = deposit.lotSizeTbtc();

        emit NotifiedLiquidation(depositAddress, msg.sender);

        // If the surplus can cover the deposit liquidation cost, liquidate
        // that deposit directly without the auction process.
        if (tbtcSurplus >= lotSizeTbtc) {
            tbtcSurplus = tbtcSurplus.sub(lotSizeTbtc);
            liquidateDeposit(deposit);
            return;
        }

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

        Auction auction = Auction(depositToAuction[depositAddress]);

        delete depositToAuction[depositAddress];
        delete auctionToDeposit[address(auction)];
        uint256 amountTransferred = earlyCloseAuction(auction);

        // Add auction's transferred amount to the surplus pool.
        // slither-disable-next-line reentrancy-benign
        tbtcSurplus = tbtcSurplus.add(amountTransferred);
    }

    /// @notice Begins the bond auction threshold update process.
    /// @dev Can be called only by the contract owner.
    /// @param _newBondAuctionThreshold New bond auction threshold in percent.
    function beginBondAuctionThresholdUpdate(uint256 _newBondAuctionThreshold)
        external
        onlyOwner
    {
        newBondAuctionThreshold = _newBondAuctionThreshold;
        /* solhint-disable-next-line not-rely-on-time */
        bondAuctionThresholdChangeInitiated = block.timestamp;
        /* solhint-disable not-rely-on-time */
        emit BondAuctionThresholdUpdateStarted(
            _newBondAuctionThreshold,
            block.timestamp
        );
    }

    /// @notice Finalizes the bond auction threshold update process.
    /// @dev Can be called only by the contract owner, after the the
    ///      governance delay elapses.
    function finalizeBondAuctionThresholdUpdate()
        external
        onlyOwner
        onlyAfterGovernanceDelay(bondAuctionThresholdChangeInitiated)
    {
        bondAuctionThreshold = newBondAuctionThreshold;
        emit BondAuctionThresholdUpdated(bondAuctionThreshold);
        bondAuctionThresholdChangeInitiated = 0;
        newBondAuctionThreshold = 0;
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
    /// @dev Can be called only by the contract owner, after the governance
    ///      delay elapses.
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

    /// @notice Begins the signer bonds swap strategy update process.
    /// @dev Must be followed by a finalizeSignerBondsSwapStrategyUpdate after
    ///      the governance delay elapses.
    /// @param _newSignerBondsSwapStrategy The new signer bonds swap strategy.
    function beginSignerBondsSwapStrategyUpdate(
        ISignerBondsSwapStrategy _newSignerBondsSwapStrategy
    ) external onlyOwner {
        require(
            address(_newSignerBondsSwapStrategy) != address(0),
            "Invalid signer bonds swap strategy address"
        );
        newSignerBondsSwapStrategy = _newSignerBondsSwapStrategy;
        /* solhint-disable-next-line not-rely-on-time */
        signerBondsSwapStrategyInitiated = block.timestamp;
        emit SignerBondsSwapStrategyUpdateStarted(
            address(_newSignerBondsSwapStrategy),
            /* solhint-disable-next-line not-rely-on-time */
            block.timestamp
        );
    }

    /// @notice Finalizes the signer bonds swap strategy update.
    /// @dev Can be called only by the contract owner, after the governance
    ///      delay elapses.
    function finalizeSignerBondsSwapStrategyUpdate()
        external
        onlyOwner
        onlyAfterGovernanceDelay(signerBondsSwapStrategyInitiated)
    {
        signerBondsSwapStrategy = newSignerBondsSwapStrategy;
        emit SignerBondsSwapStrategyUpdated(
            address(newSignerBondsSwapStrategy)
        );
        delete newSignerBondsSwapStrategy;
        signerBondsSwapStrategyInitiated = 0;
    }

    /// @notice Get the time remaining until the bond auction threshold
    ///         can be updated.
    /// @return Remaining time in seconds.
    function getRemainingBondAuctionThresholdUpdateTime()
        external
        view
        returns (uint256)
    {
        return
            getRemainingChangeTime(
                bondAuctionThresholdChangeInitiated,
                GOVERNANCE_TIME_DELAY
            );
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

    /// @notice Get the time remaining until the signer bonds swap strategy
    ///         can be changed.
    /// @return Remaining time in seconds.
    function getRemainingSignerBondsSwapStrategyChangeTime()
        external
        view
        returns (uint256)
    {
        return
            getRemainingChangeTime(
                signerBondsSwapStrategyInitiated,
                GOVERNANCE_TIME_DELAY
            );
    }

    /// @notice Cleans up auction and deposit data and executes deposit liquidation.
    /// @dev This function is invoked when Auctioneer determines that an auction
    ///      is eligible to be closed. It cannot be called on-demand outside
    ///      the Auctioneer contract. By the time this function is called, all
    ///      the TBTC tokens for the coverage pool auction should be transferred
    ///      to this contract in order to buy signer bonds.
    ///      Note: There are checks of the deposit's state performed when
    ///      the signer bonds are purchased. There is no risk this function
    ///      succeeds for a deposit liquidated outside of Coverage Pool.
    /// @param auction Coverage pool auction.
    function onAuctionFullyFilled(Auction auction) internal override {
        IDeposit deposit = IDeposit(auctionToDeposit[address(auction)]);

        delete depositToAuction[address(deposit)];
        delete auctionToDeposit[address(auction)];

        liquidateDeposit(deposit);
    }

    /// @notice Purchases ETH from signer bonds and swaps obtained funds
    ///         using the underlying signer bonds swap strategy.
    /// @dev By the time this function is called, TBTC token balance for this
    ///      contract should be enough to buy signer bonds.
    /// @param deposit TBTC deposit which should be liquidated.
    function liquidateDeposit(IDeposit deposit) internal {
        uint256 approvedAmount = deposit.lotSizeTbtc();
        tbtcToken.safeApprove(address(deposit), approvedAmount);

        // Purchase signers bonds ETH with TBTC acquired from the auction or
        // taken from the surplus pool.
        deposit.purchaseSignerBondsAtAuction();

        uint256 withdrawableAmount = deposit.withdrawableAmount();
        deposit.withdrawFunds();

        // slither-disable-next-line arbitrary-send
        signerBondsSwapStrategy.swapSignerBonds{value: withdrawableAmount}();
    }

    /// @notice Reverts if the deposit for which the auction was created is no
    ///         longer in the liquidation state. This could happen if signer
    ///         bonds were purchased from tBTC deposit directly, outside of
    ///         coverage pool auction.
    /// @dev This function is invoked when the auctioneer is informed about the
    ///      results of an auction and the auction was partially filled.
    /// @param auction Address of an auction whose deposit needs to be checked.
    function onAuctionPartiallyFilled(Auction auction) internal view override {
        IDeposit deposit = IDeposit(auctionToDeposit[address(auction)]);
        // Make sure the deposit was not liquidated outside of Coverage Pool
        require(
            deposit.currentState() == DEPOSIT_LIQUIDATION_IN_PROGRESS_STATE,
            "Deposit liquidation is not in progress"
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
