// SPDX-License-Identifier: MIT

pragma solidity <0.9.0;

library CoveragePoolConstants {
    // This divisor is for precision purposes only. We use this divisor around
    // auction related code to get the precise values without rounding it down
    // when dealing with floating numbers.
    uint256 public constant PORTION_ON_OFFER_DIVISOR = 1000000;

    // Getter for easy access
    function getPortionOnOfferDivisor() external pure returns (uint256) { return PORTION_ON_OFFER_DIVISOR; }
}