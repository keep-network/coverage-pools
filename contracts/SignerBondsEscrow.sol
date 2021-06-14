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
    /// @notice Receive ETH upon withdrawal of risk manager's signer bonds.
    receive() external payable {}

    /// @notice Notifies the strategy about signer bonds purchase.
    /// @param amount Amount of purchased signer bonds.
    function onSignerBondsPurchased(uint256 amount) external override {}

    /// @notice Withdraws collected bonds to the given target address.
    /// @dev Can be called by the governance only.
    /// @param recipient Arbitrary recipient address chosen by the governance
    ///        that will be responsible for swapping ETH and depositing
    ///        collateral to the coverage pool.
    function withdrawSignerBonds(
        RiskManagerV1 riskManager,
        uint256 amount,
        address payable recipient
    ) external onlyOwner {
        require(amount > 0, "Amount must be greater than 0");
        require(
            amount <= address(riskManager).balance,
            "Amount exceeds risk manager balance"
        );
        require(recipient != address(0), "Invalid recipient address");

        riskManager.withdrawSignerBonds(amount);

        /* solhint-disable avoid-low-level-calls */
        // slither-disable-next-line low-level-calls,arbitrary-send
        (bool success, ) = recipient.call{value: amount}("");
        require(success, "Failed to send Ether");
        /* solhint-enable avoid-low-level-calls */
    }
}
