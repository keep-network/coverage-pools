// SPDX-License-Identifier: MIT

pragma solidity <0.9.0;

library DepositStates {
    uint256 public constant DEPOSIT_LIQUIDATION_IN_PROGRESS_STATE = 10;
    uint256 public constant DEPOSIT_LIQUIDATED_STATE = 11;

    function getDepositLiquidationInProgressState()
        external
        pure
        returns (uint256)
    {
        return DEPOSIT_LIQUIDATION_IN_PROGRESS_STATE;
    }

    function getDepositLiquidatedState() external pure returns (uint256) {
        return DEPOSIT_LIQUIDATED_STATE;
    }
}

interface IDeposit {
    function withdrawFunds() external;

    function currentState() external view returns (uint256);

    function lotSizeTbtc() external view returns (uint256);

    function purchaseSignerBondsAtAuction() external;
}
