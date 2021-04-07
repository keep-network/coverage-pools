// SPDX-License-Identifier: MIT

pragma solidity <0.9.0;

import "./interfaces/ICollateralPool.sol";

contract CollateralPool is ICollateralPool {
    /// @notice Seize funds from the collateral pool.
    /// @dev portionOfPool value was multiplied by PORTION_ON_OFFER_DIVISOR for
    ///      calculation precision purposes. Further calculations in this
    ///      function will need to take this divisor into account.
    /// @param portionOfPool Portion of the pool to seize in the range between
    ///        0.x - 1.0, where 'x' cannot be zero.
    /// @param recipient Address that will receive the pool's seized funds.
    function seizeFunds(uint256 portionOfPool, address recipient)
        external
        override
    {
        // todo: implement
    }
}
