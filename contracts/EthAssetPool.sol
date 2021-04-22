// SPDX-License-Identifier: MIT

pragma solidity <0.9.0;

import "./AssetPool.sol";

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title EthAssetPool
/// @notice EthAssetPool wraps AssetPool to allow ETH to be used in
///         coverage-pools
contract EthAssetPool is Ownable {
    address public wethContract;
    AssetPool public assetPool;

    constructor(address _wethContract) {
        // TODO: check if you can cast weth contract to IERC20 if the contract
        // does not explicitly inherits from the IERC20 (but implements the
        // necessary functions), like this contract:
        // https://github.com/gnosis/canonical-weth/blob/master/contracts/WETH9.sol
        wethContract = _wethContract;
        assetPool = new AssetPool(IERC20(_wethContract));
    }

    /// @notice Accepts the given amount of ETH as a deposit, wraps it in WETH
    ///         and mints underwriter tokens representing pool's ownership.
    /// @dev Before calling this function,  needs to have the
    ///      required amount accepted to transfer to the asset pool.
    function deposit(uint256 amount) external payable {
        // TODO: check if this function is correct,
        // add protection agains reentrancy attack
        (bool success, ) = wethContract.call{value: msg.value}("");
        require(success, "Failed to send Ether");
        assetPool.deposit(amount);
    }

    /// @notice Withdraws ETH from the asset pool. Accepts the amount of
    ///         underwriter tokens representing the share of the pool that
    ///         should be withdrawn. After withdrawing it returns ETH to the
    ///         caller.
    /// @dev Before calling this function, underwriter token needs to have the
    ///      required amount accepted to transfer to the asset pool.
    function withdraw(uint256 covAmount) external {
        // TODO: check if this function is correct,
        // add protection agains reentrancy attack
        assetPool.withdraw(covAmount);
        (bool success, ) = msg.sender.call{value: covAmount}("");
        require(success, "Failed to send Ether");
    }
}
