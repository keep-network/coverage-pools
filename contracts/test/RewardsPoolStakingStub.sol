// SPDX-License-Identifier: MIT

pragma solidity <0.9.0;

import "../RewardsPool.sol";

contract RewardsPoolStakingStub is RewardsPoolStaking {
    function getRewardPerTokenAccumulated() external view returns (uint256) {
        return rewardPerTokenAccumulated;
    }

    function getLastUpdateTime() external view returns (uint256) {
        return lastUpdateTime;
    }
}
