pragma solidity <0.9.0;

import "./ICollateralPool.sol";

contract KEEPCollateralPool is ICollateralPool {
    function seizeFunds(uint256 portionOfPool, address recipient)
        external
        override
    {
        // todo: implement
    }
}
