// SPDX-License-Identifier: MIT

pragma solidity <0.9.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "./RewardsPool.sol";
import "./UnderwriterToken.sol";

/// @title AssetPool
/// @notice Asset pool is a component of a Coverage Pool. Asset Pool
///         accepts a single ERC20 token as collateral, and returns an
///         underwriter token. For example, an asset pool might accept deposits
///         in KEEP in return for covKEEP underwriter tokens. Underwriter tokens
///         represent an ownership share in the underlying collateral of the
///         Asset Pool.
contract AssetPool is Ownable {
    using SafeERC20 for IERC20;
    using SafeERC20 for UnderwriterToken;
    using SafeMath for uint256;

    IERC20 public collateralToken;
    UnderwriterToken public underwriterToken;

    RewardsPool public rewardsPool;

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
    function deposit(uint256 amount) external {
        _deposit(msg.sender, amount);
    }

    /// @notice Withdraws collateral from the asset pool. Accepts the amount of
    ///         underwriter tokens representing the share of the pool that
    ///         should be withdrawn.
    /// @dev Before calling this function, underwriter token needs to have the
    ///      required amount accepted to transfer to the asset pool.
    function withdraw(uint256 covAmount) external {
        uint256 covBalance = underwriterToken.balanceOf(msg.sender);
        require(
            covAmount <= covBalance,
            "Underwriter token amount exceeds balance"
        );
        require(
            covAmount > 0,
            "Underwriter token amount must be greater than 0"
        );

        rewardsPool.withdraw();

        uint256 covSupply = underwriterToken.totalSupply();
        uint256 collateralBalance = collateralToken.balanceOf(address(this));

        uint256 amountToWithdraw =
            covAmount.mul(collateralBalance).div(covSupply);

        underwriterToken.safeTransferFrom(msg.sender, address(this), covAmount);
        underwriterToken.burn(covAmount);
        collateralToken.safeTransfer(msg.sender, amountToWithdraw);
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
