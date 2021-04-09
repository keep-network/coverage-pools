// SPDX-License-Identifier: MIT

pragma solidity <0.9.0;

contract CollateralPoolStub {
    event FundsSeized(uint256 portionToSeize, address indexed recipient);

    function seizeFunds(uint256 portionToSeize, address recipient) external {
        emit FundsSeized(portionToSeize, recipient);
    }
}
