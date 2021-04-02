// SPDX-License-Identifier: MIT

pragma solidity <0.9.0;

import "../interfaces/ICollateralPool.sol";

contract CollateralPoolStub is ICollateralPool {
    event SeizeFunds(uint256 portionOfPool, address indexed recipient);

    function seizeFunds(uint256 portionOfPool, address recipient)
        external
        override
    {
        emit SeizeFunds(portionOfPool, recipient);
    }
}
