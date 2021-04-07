// SPDX-License-Identifier: MIT

pragma solidity <0.9.0;

contract CollateralPoolStub{
    event SeizeFunds(uint256 portionOfPool, address indexed recipient);

    function seizeFunds(uint256 portionOfPool, address recipient) external {
        emit SeizeFunds(portionOfPool, recipient);
    }
}
