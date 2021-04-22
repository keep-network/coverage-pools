// SPDX-License-Identifier: MIT

pragma solidity <0.9.0;

import "./AssetPool.sol";

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title EthAssetPool
/// @notice EthAssetPool wraps AssetPool to allow ETH to be used in
///         coverage-pools
contract EthAssetPool is Ownable {
    IERC20 public wethToken;
    AssetPool public assetPool;

    constructor(address _weth) {
        wethToken = IERC20(_weth);
        assetPool = new AssetPool(wethToken);
    }

    /// @notice Accepts the given amount of ETH as a deposit, wraps it in WETH
    ///         and mints underwriter tokens representing pool's ownership.
    /// @dev Before calling this function,  needs to have the
    ///      required amount accepted to transfer to the asset pool.
    function deposit(uint256 amount) external payable {
        // TODO: implement or remove
        assetPool.deposit(amount);
    }

    /// @notice Withdraws ETH from the asset pool. Accepts the amount of
    ///         underwriter tokens representing the share of the pool that
    ///         should be withdrawn. After withdrawing it returns ETH to the
    ///         caller.
    /// @dev Before calling this function, underwriter token needs to have the
    ///      required amount accepted to transfer to the asset pool.
    function withdraw(uint256 covAmount) external {
        // TODO: implement or remove
        assetPool.withdraw(covAmount);
        msg.sender.transfer(covAmount);
    }
}
