// SPDX-License-Identifier: MIT

pragma solidity <0.9.0;

import "./AssetPool.sol";
import "./UnderwriterToken.sol";

import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

interface IWETH is IERC20 {
    event Deposit(address indexed dst, uint256 amount);
    event Withdrawal(address indexed src, uint256 amount);

    function deposit() external payable;

    function withdraw(uint256 amount) external;
}

/// @title EthAssetPool
/// @notice EthAssetPool wraps AssetPool to allow ETH to be used in
///         coverage-pools
contract EthAssetPool is Ownable {
    // TODO: Think about a solution for a scenario when user sends Ether
    // directly to EthAssetPool contract (without calling deposit)
    using SafeERC20 for IERC20;
    using SafeERC20 for UnderwriterToken;
    using SafeMath for uint256;

    IWETH public weth;
    AssetPool public assetPool;

    constructor(IWETH _weth) {
        weth = _weth;
        assetPool = new AssetPool(_weth);
    }

    /// @notice Accepts the amount of ETH sent as a deposit, wraps it in WETH
    ///         and mints underwriter tokens representing pool's ownership.
    function deposit() external payable {
        require(msg.value > 0, "No ether sent to deposit");
        weth.deposit{value: msg.value}();
        weth.approve(address(assetPool), msg.value);
        assetPool.deposit(msg.value);
        //TODO: Check how many underwriter tokens should the user receive
        assetPool.underwriterToken().safeTransfer(msg.sender, msg.value);
    }

    /// @notice Withdraws ETH from the asset pool. Accepts the amount of
    ///         underwriter tokens representing the share of the pool that
    ///         should be withdrawn. After withdrawing it returns ETH to the
    ///         caller.
    /// @dev Before calling this function, underwriter token needs to have the
    ///      required amount accepted to transfer to the eth asset pool.
    function withdraw(uint256 covAmount) external {
        require(
            assetPool.underwriterToken().allowance(msg.sender, address(this)) >=
                covAmount,
            "Not enough Underwriter tokens approved"
        );
        assetPool.underwriterToken().safeTransferFrom(
            msg.sender,
            address(this),
            covAmount
        );
        assetPool.underwriterToken().approve(address(assetPool), covAmount);
        assetPool.withdraw(covAmount);
        weth.withdraw(covAmount);
        //TODO: Using transfer is not recommended, replace with call and guards
        // against reentrancy attack
        msg.sender.transfer(covAmount);
    }
}
