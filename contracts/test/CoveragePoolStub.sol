// SPDX-License-Identifier: MIT
pragma solidity 0.8.5;

import "../CoveragePoolConstants.sol";

contract CoveragePoolStub {
    uint256 public covTotalSupply;

    event FundsSeized(address indexed recipient, uint256 portionToSeize);
    event AssetPoolSharesGranted(address indexed recipient, uint256 covAmount);

    function seizeFunds(address recipient, uint256 portionToSeize) external {
        emit FundsSeized(recipient, portionToSeize);
    }

    function grantAssetPoolShares(address recipient, uint256 covAmount)
        external
    {
        emit AssetPoolSharesGranted(recipient, covAmount);
    }
}
