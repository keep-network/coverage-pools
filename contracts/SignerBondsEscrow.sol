// SPDX-License-Identifier: MIT

pragma solidity <0.9.0;

import "./RiskManagerV1.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title SignerBondsEscrow
/// @notice Process incoming signer bonds by putting them into escrow the
///         governance can withdraw from.
contract SignerBondsEscrow is ISignerBondsSwapStrategy, Ownable {
    /// @notice Swaps signer bonds.
    /// @dev Adds incoming bonds to the overall contract balance.
    function swapSignerBonds() external payable override {}

    /// @notice Withdraws collected bonds to the given target address.
    /// @dev Can be called by the governance only.
    /// @param target Arbitrary target address chosen by the governance.
    function withdraw(address payable target) external onlyOwner {
        require(target != address(0), "Invalid target address");
        /* solhint-disable avoid-low-level-calls */
        // slither-disable-next-line low-level-calls,arbitrary-send
        (bool success, ) = target.call{value: address(this).balance}("");
        require(success, "Failed to send Ether");
    }
}
