// SPDX-License-Identifier: MIT

pragma solidity <0.9.0;

import "./AssetPool.sol";

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title EthAssetPool
/// @notice EthAssetPool extends AssetPool to allow ETH to be used in
///         coverage-pools
contract EthAssetPool is AssetPool {
    IERC20 wethToken;

    constructor(address _weth) AssetPool(IERC20(_weth)) {
        wethToken = IERC20(_weth);
    }

    /// @notice Accepts the given amount of ETH as a deposit, wraps it in WETH
    ///         and mints underwriter tokens representing pool's ownership.
    /// @dev This function is a shortcut for approve + deposit.
    function receiveApproval(
        address from,
        uint256 amount,
        address token,
        bytes calldata
    ) external override {
        // TODO: implement or remove
        require(
            IERC20(token) == collateralToken,
            "Unsupported collateral token (should be Ether)"
        );

        super._deposit(from, amount);
    }

    /// @notice Accepts the given amount of ETH as a deposit, wraps it in WETH
    ///         and mints underwriter tokens representing pool's ownership.
    /// @dev Before calling this function,  needs to have the
    ///      required amount accepted to transfer to the asset pool.
    function deposit(uint256 amount) public override {
        // TODO: implement or remove
        super.deposit(amount);
    }

    /// @notice Withdraws ETH from the asset pool. Accepts the amount of
    ///         underwriter tokens representing the share of the pool that
    ///         should be withdrawn. After withdrawing it returns ETH to the
    ///         caller.
    /// @dev Before calling this function, underwriter token needs to have the
    ///      required amount accepted to transfer to the asset pool.
    function withdraw(uint256 covAmount) public override {
        // TODO: implement or remove
        super.withdraw(covAmount);
        msg.sender.transfer(covAmount);
    }

    /// @notice Allows the coverage pool to demand coverage from the asset hold
    ///         by this pool and send it to the provided recipient address.
    function claim(address recipient, uint256 amount) public override onlyOwner {
        // TODO: implement or remove
        super.claim(recipient, amount);
    }
}
