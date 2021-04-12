// SPDX-License-Identifier: MIT

pragma solidity <0.9.0;

contract CollateralPool {

    address public riskManager;

    constructor(address _riskManager) {
        riskManager = _riskManager;
    }

    /// @notice Seize funds from the collateral pool.
    /// @dev portionToSeize value was multiplied by PORTION_ON_OFFER_DIVISOR for
    ///      calculation precision purposes. Further calculations in this
    ///      function will need to take this divisor into account.
    /// @param portionToSeize Portion of the pool to seize in the range between
    ///        0.x - 1.0, where 'x' cannot be zero.
    /// @param recipient Address that will receive the pool's seized funds.
    function seizeFunds(uint256 portionToSeize, address recipient) external {
        // todo: implement
    }

    /// @notice Can liquidate part of the pool.
    function liquidate(uint256 portionToLiquidate) external onlyRiskManager {
        // todo: implement
    }

    modifier onlyRiskManager() {
        require(msg.sender == riskManager, "Caller is not the risk manager");
        _;
    }
}
