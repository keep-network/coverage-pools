// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "../CoveragePoolConstants.sol";

contract CoveragePoolStub {
    uint256 public covTotalSupply;

    event PortionSeized(address indexed recipient, uint256 portionToSeize);
    event AssetPoolSharesGranted(address indexed recipient, uint256 covAmount);

    function seizePortion(address recipient, uint256 portionToSeize) external {
        emit PortionSeized(recipient, portionToSeize);
    }

    function grantAssetPoolShares(address recipient, uint256 covAmount)
        external
    {
        emit AssetPoolSharesGranted(recipient, covAmount);
    }
}
