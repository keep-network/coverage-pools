// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "../AssetPool.sol";

contract KeepAssetPool is AssetPool {
    constructor(
        ICollateralToken collateralToken,
        UnderwriterToken underwriterToken,
        address rewardsManager
    ) AssetPool(collateralToken, underwriterToken, rewardsManager) {}

    function initGovernance(ICollateralToken _collateralToken)
        internal
        override
    {
        // KEEP does not support DAO checkpoints
    }
}
