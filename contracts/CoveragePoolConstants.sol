// SPDX-License-Identifier: MIT

pragma solidity <0.9.0;

library CoveragePoolConstants {
    // This divisor is for precision purposes only. We use this divisor around
    // auction related code to get the precise values without rounding it down
    // when dealing with floating numbers.
    uint256 public constant FLOATING_POINT_DIVISOR = 1e18;

    uint256 public constant LIQUIDATION_IN_PROGRESS_STATE = 10;

    // Getter for easy access
    function getFloatingPointDivisor() external pure returns (uint256) {
        return FLOATING_POINT_DIVISOR;
    }

    function getLiquidationInProgressState() external pure returns (uint256) {
        return LIQUIDATION_IN_PROGRESS_STATE;
    }
}
