// SPDX-License-Identifier: MIT
pragma solidity <0.9.0;

contract CoveragePoolStub {
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
