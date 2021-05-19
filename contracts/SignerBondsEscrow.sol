// SPDX-License-Identifier: MIT

pragma solidity <0.9.0;

import "./RiskManagerV1.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title SignerBondsEscrow
/// @notice ETH purchased by the risk manager from tBTC signer bonds needs to be
///         swapped and deposited back to the coverage pool as collateral.
///         In the case it can not be done automatically, the governance has
///         the power to ask the risk manager to deposit ETH from purchased
///         signer bonds into an escrow the governance can later withdraw from
///         and do the swap manually. SignerBondsEscrow is a simple escrow
///         implementation allowing the risk manager to store purchased ETH
///         signer bonds so that governance can later swap them manually and
///         deposit as coverage pool collateral.
contract SignerBondsEscrow is ISignerBondsSwapStrategy, Ownable {
    /// @notice Swaps signer bonds.
    /// @dev Adds incoming bonds to the overall contract balance.
    function swapSignerBonds() external payable override {}

    /// @notice Withdraws collected bonds to the given target address.
    /// @dev Can be called by the governance only.
    /// @param target Arbitrary target address chosen by the governance that
    ///        will be responsible for swapping ETH and depositing collateral
    ///        to the coverage pool.
    function withdraw(address payable target) external onlyOwner {
        require(target != address(0), "Invalid target address");
        /* solhint-disable avoid-low-level-calls */
        // slither-disable-next-line low-level-calls,arbitrary-send
        (bool success, ) = target.call{value: address(this).balance}("");
        require(success, "Failed to send Ether");
        /* solhint-enable avoid-low-level-calls */
    }
}
