// SPDX-License-Identifier: MIT
pragma solidity <0.9.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract CoveragePoolStub {
    event FundsSeized(address indexed recipient, uint256 portionToSeize);

    function seizeFunds(address recipient, uint256 portionToSeize) external {
        emit FundsSeized(recipient, portionToSeize);
    }
}
