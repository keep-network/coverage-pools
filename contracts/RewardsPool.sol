// SPDX-License-Identifier: MIT

pragma solidity <0.9.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract RewardsPool {
    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    IERC20 public rewardToken;

    uint256 public constant DURATION = 7 days;

    uint256 public periodFinish = 0;
    uint256 public rewardRate = 0;
    uint256 public lastUpdateTime = 0;

    event RewardToppedUp(uint256 reward);

    constructor(IERC20 _rewardToken) {
        rewardToken = _rewardToken;
    }

    function topUpReward(uint256 reward) external {
        /* solhint-disable not-rely-on-time */
        if (block.timestamp >= periodFinish) {
            // see https://github.com/crytic/slither/issues/844
            // slither-disable-next-line divide-before-multiply
            rewardRate = reward.div(DURATION);
        } else {
            uint256 remaining = periodFinish.sub(block.timestamp);
            uint256 leftover = remaining.mul(rewardRate);
            rewardRate = reward.add(leftover).div(DURATION);
        }
        lastUpdateTime = block.timestamp;
        periodFinish = block.timestamp.add(DURATION);
        /* solhint-enable avoid-low-level-calls */

        emit RewardToppedUp(reward);
        rewardToken.safeTransferFrom(msg.sender, address(this), reward);
    }
}
