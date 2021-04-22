// SPDX-License-Identifier: MIT

pragma solidity <0.9.0;

contract CollateralPool {
    address public riskManager;

    constructor(address _riskManager) {
        riskManager = _riskManager;
    }

    /// @notice Seize funds from the collateral pool and put them aside for the
    ///         recipient to withdraw.
    /// @dev portionToSeize value was multiplied by FLOATING_POINT_DIVISOR for
    ///      calculation precision purposes. Further calculations in this
    ///      function will need to take this divisor into account.
    /// @param portionToSeize Portion of the pool to seize in the range (0, 1]
    ///        multiplied by FLOATING_POINT_DIVISOR
    /// @param recipient Address that will receive the pool's seized funds.
    /* solhint-disable-next-line no-empty-blocks */
    function seizeFunds(uint256 portionToSeize, address recipient) external {
        // todo: implement (and remove the solhint disabling comment above)
    }
}
