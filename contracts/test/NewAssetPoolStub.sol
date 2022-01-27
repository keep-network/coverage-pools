// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "../interfaces/IAssetPool.sol";
import "../interfaces/IAssetPoolUpgrade.sol";
import "../UnderwriterToken.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract NewAssetPoolStub is IAssetPoolUpgrade {
    using SafeERC20 for IERC20;

    IERC20 public collateralToken;
    UnderwriterToken public newUnderwriterToken;

    constructor(IERC20 _collateralToken, UnderwriterToken _newUnderwriterToken)
    {
        collateralToken = _collateralToken;
        newUnderwriterToken = _newUnderwriterToken;
    }

    function depositFor(address underwriter, uint256 collateralAmount)
        external
        override
    {
        collateralToken.safeTransferFrom(
            msg.sender,
            address(this),
            collateralAmount
        );
        // In a real contract amount of new cov tokens will be calculated based
        // on certain rules.
        // For testing purposes, cov tokens amount = collateral tokens amount
        newUnderwriterToken.mint(underwriter, collateralAmount);
    }
}
