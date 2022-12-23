// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

// Simple beneficiary that does nothing when notified that it has received
// tokens.
contract TestSimpleBeneficiary {
    function __escrowSentTokens(uint256 amount) external {}
}
