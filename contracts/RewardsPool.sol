// SPDX-License-Identifier: MIT

pragma solidity <0.9.0;

import "./AssetPool.sol";
import "./UnderwriterToken.sol";
import "./CoveragePoolConstants.sol";

import "@openzeppelin/contracts/access/Ownable.sol";

contract RewardsPool is Ownable {

}

/// @title RewardsPoolStaking
/// @notice Staking pool for the given underwriter token responsible for minting
///         virtual reward tokens based on underwriter's staked tokens balances.
///         RewardsPool contract references multiple RewardsPoolStaking contracts,
///         one per each stakeable underwriter token with non-zero reward weight.
contract RewardsPoolStaking {
    using SafeMath for uint256;
    using SafeERC20 for UnderwriterToken;

    // One virtual reward token minted per second.
    uint256 public constant MINTING_RATE = 1e18;

    // The stakeable underwriter token.
    UnderwriterToken public underwriterToken;

    // Staked underwriter token balances per staker address.
    mapping(address => uint256) public balanceOf;
    // The total amount of staked underwriter tokens.
    uint256 public totalStaked;

    uint256 internal rewardPerTokenAccumulated;
    mapping(address => uint256) internal userRewardPerTokenPaid;
    mapping(address => uint256) internal rewards;
    uint256 internal lastUpdateTime;

    constructor(UnderwriterToken _underwriterToken) {
        underwriterToken = _underwriterToken;
    }

    function stake(uint256 amount) external {
        updateReward(msg.sender);
        totalStaked = totalStaked.add(amount);
        balanceOf[msg.sender] = balanceOf[msg.sender].add(amount);
        underwriterToken.safeTransferFrom(msg.sender, address(this), amount);
        // TODO: emit event
    }

    function unstake(uint256 amount) external {
        updateReward(msg.sender);
        totalStaked = totalStaked.sub(amount);
        balanceOf[msg.sender] = balanceOf[msg.sender].sub(amount);
        underwriterToken.safeTransfer(msg.sender, amount);
        // TODO: emit event
    }

    function earned(address account) public view returns (uint256) {
        return
            balanceOf[account]
                .mul(rewardPerToken().sub(userRewardPerTokenPaid[account]))
                .div(CoveragePoolConstants.getFloatingPointDivisor())
                .add(rewards[account]);
    }
    
    function updateReward(address account) internal {
        rewardPerTokenAccumulated = rewardPerToken();
        /* solhint-disable-next-line not-rely-on-time */
        lastUpdateTime = block.timestamp;
        if (account != address(0)) {
            rewards[account] = earned(account);
            userRewardPerTokenPaid[account] = rewardPerTokenAccumulated;
        }
    }

    function rewardPerToken() internal view returns (uint256) {
        if (totalStaked == 0) {
            return rewardPerTokenAccumulated;
        }

        return
            rewardPerTokenAccumulated.add(
                /* solhint-disable-next-line not-rely-on-time */
                block
                    .timestamp
                    .sub(lastUpdateTime)
                    .mul(MINTING_RATE)
                    .mul(CoveragePoolConstants.getFloatingPointDivisor())
                    .div(totalStaked)
            );
    }
}
