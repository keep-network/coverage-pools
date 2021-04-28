// SPDX-License-Identifier: MIT

pragma solidity <0.9.0;

import "./AssetPool.sol";
import "./UnderwriterToken.sol";

import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/* NOTE: Depositing ETH should only be done by calling deposit().
         DO NOT USE PLAIN ETH TRANSFERS */

/// @title IWETH
/// @notice Represents functionality allowing for depositing, withdrawing and
///         managing WETH (Wrapped ETH). WETH tokens conform to the ERC20
///         standard and always exchange with ETH at a 1:1 ratio.
interface IWETH is IERC20 {
    /// @notice Accepts ETH and creates WETH tokens for the caller.
    function deposit() external payable;

    /// @notice Withdraws deposited WETH tokens and sends ETH to the caller.
    function withdraw(uint256 amount) external;
}

/// @title EthAssetPool
/// @notice EthAssetPool wraps AssetPool to allow ETH to be used in
///         coverage-pools.
contract EthAssetPool {
    using SafeERC20 for UnderwriterToken;

    IWETH public weth;
    AssetPool public wethAssetPool;

    constructor(IWETH _weth, AssetPool _wethAssetPool) {
        weth = _weth;
        wethAssetPool = _wethAssetPool;
    }

    /// @notice Accepts plain Ether transfers (i.e. sent using send() or
    ///         transfer())
    /// @dev Needed for accepting Ether sent from the WETH contract when
    ///      withdrawing. Do not use plain Ether transfers to deposit, send
    //       Ether through the deposit function instead.
    receive() external payable {}

    /// @notice Accepts the amount of ETH sent as a deposit, wraps it in WETH
    ///         and mints underwriter tokens representing pool's ownership.
    function deposit() external payable {
        require(msg.value > 0, "No ether sent to deposit");
        weth.deposit{value: msg.value}();
        //slither-disable-next-line unused-return
        weth.approve(address(wethAssetPool), msg.value);
        wethAssetPool.deposit(msg.value);
        uint256 transferAmount =
            wethAssetPool.underwriterToken().balanceOf(address(this));
        wethAssetPool.underwriterToken().safeTransfer(
            msg.sender,
            transferAmount
        );
    }

    /// @notice Withdraws ETH from the asset pool. Accepts the amount of
    ///         underwriter tokens representing the share of the pool that
    ///         should be withdrawn. After withdrawing it returns ETH to the
    ///         caller.
    /// @dev Before calling this function, underwriter token needs to have the
    ///      required amount accepted to transfer to the eth asset pool.
    function withdraw(uint256 covAmount) external {
        require(
            wethAssetPool.underwriterToken().allowance(
                msg.sender,
                address(this)
            ) >= covAmount,
            "Not enough Underwriter tokens approved"
        );
        wethAssetPool.underwriterToken().safeTransferFrom(
            msg.sender,
            address(this),
            covAmount
        );
        //slither-disable-next-line unused-return
        wethAssetPool.underwriterToken().approve(
            address(wethAssetPool),
            covAmount
        );
        wethAssetPool.withdraw(covAmount);
        uint256 withdrawAmount = weth.balanceOf(address(this));
        weth.withdraw(withdrawAmount);
        // TODO: Using transfer is not recommended, replace with call
        //slither-disable-next-line arbitrary-send
        msg.sender.transfer(address(this).balance);
    }
}
