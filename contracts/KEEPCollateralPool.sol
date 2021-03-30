// SPDX-License-Identifier: MIT

pragma solidity <0.9.0;

import "./interfaces/ICollateralPool.sol";

contract KEEPCollateralPool is ICollateralPool {
    function seizeFunds(uint256 portionOfPool, address recipient)
        external
        override
    {
        // todo: implement
    }
}
