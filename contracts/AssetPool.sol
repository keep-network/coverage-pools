// SPDX-License-Identifier: MIT

pragma solidity <0.9.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "./interfaces/IAssetPool.sol";
import "./interfaces/IAssetPoolUpgrade.sol";
import "./RewardsPool.sol";
import "./UnderwriterToken.sol";

/// @title AssetPool
/// @notice Asset pool is a component of a Coverage Pool. Asset Pool
///         accepts a single ERC20 token as collateral, and returns an
///         underwriter token. For example, an asset pool might accept deposits
///         in KEEP in return for covKEEP underwriter tokens. Underwriter tokens
///         represent an ownership share in the underlying collateral of the
///         Asset Pool.
contract AssetPool is Ownable, IAssetPool {
    using SafeERC20 for IERC20;
    using SafeERC20 for UnderwriterToken;
    using SafeMath for uint256;

    IERC20 public collateralToken;
    UnderwriterToken public underwriterToken;
    UnderwriterToken public newUnderwriterToken;

    RewardsPool public rewardsPool;

    IAssetPoolUpgrade public newAssetPool;

    mapping(address => uint256) public withdrawalInitiatedTimestamp;
    mapping(address => uint256) public pendingWithdrawal;

    // The time it takes for the underwriter to withdraw their collateral
    // and rewards from the pool. This is the time that needs to pass between
    // initiating and completing the withdrawal. During that time, underwriter
    // is still earning rewards and their share of the pool is still a subject
    // of a possible coverage claim.
    uint256 public constant withdrawalDelay = 14 days;
    // The time the underwriter has after the withdrawal delay passed to
    // complete the withdrawal so that part of their tokens is not seized by
    // the pool.
    // After the graceful withdrawal period passes, tokens are slowly getting
    // seized by the pool over time. This is to slash potential free-riders,
    // given that the underwriter is earning rewards all the time it has their
    // collateral in the pool, including the time after the withdrawal has been
    // initiated.
    uint256 public constant gracefulWithdrawalTimeout = 7 days;
    // After the hard withdrawal timeout, 99% of the tokens is seized by the
    // pool and 1% of tokens is sent to the notifier who will complete the
    // withdrawal on behalf of the underwriter. Hard withdrawal timeout starts
    // counting from the moment withdrawal delay has passed.
    uint256 public constant hardWithdrawalTimeout = 70 days;

    event WithdrawalInitiated(
        address indexed underwriter,
        uint256 covAmount,
        uint256 timestamp
    );
    event WithdrawalCompleted(
        address indexed underwriter,
        uint256 amount,
        uint256 timestamp
    );
    event GracefulWithdrawalTimedOut(
        address indexed underwriter,
        uint256 timestamp
    );
    event WithdrawalTimedOut(address indexed underwriter, uint256 timestamp);
    event AssetPoolUpgraded(
        address indexed underwriter,
        uint256 collateralAmount,
        uint256 covAmount,
        uint256 timestamp
    );
    event ApprovedAssetPoolUpgrade(address newAssetPool);

    constructor(
        IERC20 _collateralToken,
        UnderwriterToken _underwriterToken,
        address rewardsManager
    ) {
        collateralToken = _collateralToken;
        underwriterToken = _underwriterToken;

        rewardsPool = new RewardsPool(_collateralToken, this);
        rewardsPool.transferOwnership(rewardsManager);
    }

    /// @notice Accepts the given amount of collateral token as a deposit and
    ///         mints underwriter tokens representing pool's ownership.
    /// @dev This function is a shortcut for approve + deposit.
    function receiveApproval(
        address from,
        uint256 amount,
        address token,
        bytes calldata
    ) external {
        require(
            IERC20(token) == collateralToken,
            "Unsupported collateral token"
        );

        _deposit(from, amount);
    }

    /// @notice Accepts the given amount of collateral token as a deposit and
    ///         mints underwriter tokens representing pool's ownership.
    /// @dev Before calling this function, collateral token needs to have the
    ///      required amount accepted to transfer to the asset pool.
    function deposit(uint256 amount) external override {
        _deposit(msg.sender, amount);
    }

    /// @notice Initiates the withdrawal of collateral and rewards from the pool.
    ///         Accepts the amount of underwriter tokens representing the share
    ///         of the pool that should be withdrawn.
    ///         Can be called multiple times (without any delay between the
    ///         calls) if the withdrawal delay has not elapsed yet.
    ///         Each call increases the share of the pool that will be withdrawn
    ///         by the specified amount of underwriter tokens and each
    ///         time the waiting for the withdrawal delay starts over.
    ///         After the last call to `initiateWithdrawal`, the underwriter
    ///         needs to complete the withdrawal by calling the
    ///         `completeWithdrawal` function after the withdrawal delay passes,
    ///         but before the graceful withdrawal timeout ends to avoid part of
    ///         their share being seized by the pool.
    /// @dev Before calling this function, underwriter token needs to have the
    ///      required amount accepted to transfer to the asset pool.
    function initiateWithdrawal(uint256 covAmount) external override {
        uint256 covBalance = underwriterToken.balanceOf(msg.sender);
        require(
            covAmount <= covBalance,
            "Underwriter token amount exceeds balance"
        );
        require(
            covAmount > 0,
            "Underwriter token amount must be greater than 0"
        );
        // Ensure withdrawal not initiated or withdrawal delay has not elapsed
        //slither-disable-next-line incorrect-equality
        require(
            withdrawalInitiatedTimestamp[msg.sender] == 0 ||
                withdrawalInitiatedTimestamp[msg.sender].add(withdrawalDelay) >=
                /* solhint-disable not-rely-on-time */
                block.timestamp,
            "Cannot initiate withdrawal after withdrawal delay"
        );

        pendingWithdrawal[msg.sender] = covAmount.add(
            pendingWithdrawal[msg.sender]
        );

        // Save the withdrawal initiation timestamp (possibly overwriting
        // previous timestamp)
        /* solhint-disable not-rely-on-time */
        withdrawalInitiatedTimestamp[msg.sender] = block.timestamp;

        emit WithdrawalInitiated(
            msg.sender,
            pendingWithdrawal[msg.sender],
            block.timestamp
        );

        underwriterToken.safeTransferFrom(msg.sender, address(this), covAmount);
        /* solhint-enable not-rely-on-time */
    }

    /// @notice Completes the previously initiated withdrawal for the
    ///         underwriter. Anyone can complete the withdrawal for the
    ///         underwriter who previously initiated it.
    ///         Depending on how long it took to complete the withdrawal since
    ///         the time it has been initiated, part of the collateral and
    ///         rewards can be seized by the pool.
    ///         After the withdrawal delay and below the graceful withdrawal
    ///         timeout, no tokens are seized by the pool. After the graceful
    ///         withdrawal timeout, tokens are slowly getting seized by the pool
    ///         over time. After the hard withdrawal timeout, 99% of tokens is
    ///         seized by the pool and 1% of tokens is sent to the notifier who
    ///         completed the withdrawal on behalf of the underwriter.
    function completeWithdrawal(address underwriter) external override {
        /* solhint-disable not-rely-on-time */
        uint256 initiatedAt = withdrawalInitiatedTimestamp[underwriter];
        require(initiatedAt > 0, "No withdrawal initiated for the underwriter");

        uint256 withdrawalDelayEndTimestamp = initiatedAt.add(withdrawalDelay);
        require(
            withdrawalDelayEndTimestamp < block.timestamp,
            "Withdrawal delay has not elapsed"
        );

        uint256 covAmount = pendingWithdrawal[underwriter];
        uint256 covSupply = underwriterToken.totalSupply();
        delete withdrawalInitiatedTimestamp[underwriter];
        delete pendingWithdrawal[underwriter];

        // slither-disable-next-line reentrancy-events
        rewardsPool.withdraw();

        uint256 collateralBalance = collateralToken.balanceOf(address(this));

        uint256 amountToWithdraw =
            covAmount.mul(collateralBalance).div(covSupply);

        //
        //      withdrawal              graceful withdrawal
        //        delay                 timeout
        //  /--------------\ /----------|
        // x----------------x-----------x-------------------------------x------>
        // ^                 \-----------------------------------------|
        // initiatedAt                                   hard withdrawal
        //                                               timeout
        //

        // When the graceful withdrawal time ends. After this time, part of the
        // collateral and rewards will be seized by the pool.
        uint256 gracefulWithdrawalEndTimestamp =
            withdrawalDelayEndTimestamp.add(gracefulWithdrawalTimeout);
        // When the time for the withdrawal ends. After this time, 99% of
        // rewards and collateral is seized by the pool and 1% of rewards and
        // collateral is sent to the notifier who completed the withdrawal on
        // behalf of the underwriter.
        uint256 hardWithdrawalEndTimestamp =
            withdrawalDelayEndTimestamp.add(hardWithdrawalTimeout);

        if (gracefulWithdrawalEndTimestamp >= block.timestamp) {
            // Before the graceful withdrawal timeout. This is the happy path.
            emit WithdrawalCompleted(
                underwriter,
                amountToWithdraw,
                block.timestamp
            );
            collateralToken.safeTransfer(underwriter, amountToWithdraw);
        } else if (hardWithdrawalEndTimestamp > block.timestamp) {
            // After the graceful withdrawal timeout but before the hard
            // withdrawal timeout. A portion of collateral and tokens is
            // seized by the pool, proportionally to the time passed after
            // the graceful withdrawal timeout.
            uint256 delayRatio =
                hardWithdrawalEndTimestamp.sub(block.timestamp).mul(1e18).div(
                    hardWithdrawalTimeout.sub(gracefulWithdrawalTimeout)
                );
            // slither-disable-next-line divide-before-multiply
            uint256 amountToWithdrawReduced =
                delayRatio.mul(amountToWithdraw).div(1e18);
            emit WithdrawalCompleted(
                underwriter,
                amountToWithdrawReduced,
                block.timestamp
            );
            emit GracefulWithdrawalTimedOut(underwriter, block.timestamp);
            collateralToken.safeTransfer(underwriter, amountToWithdrawReduced);
        } else {
            // After the hard withdrawal timeout passed. 99% of tokens is seized
            // by the pool, 1% of tokens goes go the notifier.
            emit WithdrawalCompleted(underwriter, 0, block.timestamp);
            emit WithdrawalTimedOut(underwriter, block.timestamp);
            collateralToken.safeTransfer(msg.sender, amountToWithdraw.div(100));
        }
        /* solhint-enable not-rely-on-time */
        underwriterToken.burn(covAmount);
    }

    /// @notice Transfers collateral tokens to a new Asset Pool which previously
    ///         was approved by the governance. New underwriter tokens will be
    ///         received to this contract but immediately forwarded to the right
    ///         owner - underwriter. Old underwriter tokens are burned in favor
    ///         of new tokens minted in a new Asset Pool.
    /// @param covAmount Amount of underwriter tokens used to calculate collateral
    ///                  tokens which are transferred to a new asset pool.
    function upgradeToNewAssetPool(uint256 covAmount) external {
        /* solhint-disable not-rely-on-time */
        require(
            covAmount > 0,
            "Underwriter token amount must be greater than 0"
        );

        uint256 covBalance = underwriterToken.balanceOf(msg.sender);
        require(
            covAmount <= covBalance,
            "Underwriter token amount exceeds available balance"
        );

        require(
            address(newAssetPool) != address(0),
            "New asset pool must be assigned"
        );

        uint256 covSupply = underwriterToken.totalSupply();

        // slither-disable-next-line reentrancy-events
        rewardsPool.withdraw();

        uint256 collateralBalance = collateralToken.balanceOf(address(this));

        uint256 collateralToTransfer =
            covAmount.mul(collateralBalance).div(covSupply);

        collateralToken.safeApprove(
            address(newAssetPool),
            collateralToTransfer
        );
        // collateralToTransfer will be sent to a new AssetPool and new
        // underwriter tokens will be mint and transferred back to the underwriter
        newAssetPool.depositFor(msg.sender, collateralToTransfer);

        emit AssetPoolUpgraded(
            msg.sender,
            collateralToTransfer,
            covAmount,
            block.timestamp
        );

        // old underwriter tokens are burned in favor of new minted in a new
        // asset pool
        underwriterToken.burnFrom(msg.sender, covAmount);
    }

    /// @notice Allows governance to set a new asset pool so the underwriters
    ///         can move their collateral tokens to a new asset pool.
    function approveNewAssetPoolUpgrade(IAssetPoolUpgrade _newAssetPool)
        external
        onlyOwner
    {
        require(
            address(_newAssetPool) != address(0),
            "New asset pool can't be zero address"
        );

        newAssetPool = _newAssetPool;

        emit ApprovedAssetPoolUpgrade(address(_newAssetPool));
    }

    /// @notice Allows the coverage pool to demand coverage from the asset hold
    ///         by this pool and send it to the provided recipient address.
    function claim(address recipient, uint256 amount) external onlyOwner {
        rewardsPool.withdraw();
        collateralToken.safeTransfer(recipient, amount);
    }

    function _deposit(address depositor, uint256 amount) internal {
        rewardsPool.withdraw();

        uint256 covSupply = underwriterToken.totalSupply();
        uint256 collateralBalance = collateralToken.balanceOf(address(this));

        uint256 toMint;
        if (covSupply == 0) {
            toMint = amount;
        } else {
            toMint = amount.mul(covSupply).div(collateralBalance);
        }
        underwriterToken.mint(depositor, toMint);
        collateralToken.safeTransferFrom(depositor, address(this), amount);
    }
}
