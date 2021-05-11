// SPDX-License-Identifier: MIT

pragma solidity <0.9.0;

import "./AssetPool.sol";
import "./CoveragePoolConstants.sol";

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

contract CoveragePool is Ownable {
    using SafeMath for uint256;

    AssetPool public assetPool;
    IERC20 public collateralToken;

    /// @notice Throws if called by a Risk Manager that has not been approved
    modifier onlyApprovedManager() {
        //TODO: implement check for approved Risk Managers
        _;
    }

    constructor(AssetPool _assetPool) {
        assetPool = _assetPool;
        collateralToken = _assetPool.collateralToken();
    }

    function approveRiskManager() external onlyOwner {
        //TODO: implement
    }

    /// @notice Seize funds from the coverage pool and put them aside for the
    ///         recipient to withdraw.
    /// @dev portionToSeize value was multiplied by FLOATING_POINT_DIVISOR for
    ///      calculation precision purposes. Further calculations in this
    ///      function will need to take this divisor into account.
    /// @param recipient Address that will receive the pool's seized funds.
    /// @param portionToSeize Portion of the pool to seize in the range (0, 1]
    ///        multiplied by FLOATING_POINT_DIVISOR
    function seizeFunds(address recipient, uint256 portionToSeize)
        external
        onlyApprovedManager
    {
        uint256 FLOATING_POINT_DIVISOR =
            CoveragePoolConstants.getFloatingPointDivisor();

        uint256 amountToSeize =
            collateralToken
                .balanceOf(address(assetPool))
                .mul(portionToSeize)
                .div(FLOATING_POINT_DIVISOR);

        assetPool.claim(recipient, amountToSeize);
    }
}
