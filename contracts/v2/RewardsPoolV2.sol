// ▓▓▌ ▓▓ ▐▓▓ ▓▓▓▓▓▓▓▓▓▓▌▐▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▄
// ▓▓▓▓▓▓▓▓▓▓ ▓▓▓▓▓▓▓▓▓▓▌▐▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓
//   ▓▓▓▓▓▓    ▓▓▓▓▓▓▓▀    ▐▓▓▓▓▓▓    ▐▓▓▓▓▓   ▓▓▓▓▓▓     ▓▓▓▓▓   ▐▓▓▓▓▓▌   ▐▓▓▓▓▓▓
//   ▓▓▓▓▓▓▄▄▓▓▓▓▓▓▓▀      ▐▓▓▓▓▓▓▄▄▄▄         ▓▓▓▓▓▓▄▄▄▄         ▐▓▓▓▓▓▌   ▐▓▓▓▓▓▓
//   ▓▓▓▓▓▓▓▓▓▓▓▓▓▀        ▐▓▓▓▓▓▓▓▓▓▓         ▓▓▓▓▓▓▓▓▓▓         ▐▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓
//   ▓▓▓▓▓▓▀▀▓▓▓▓▓▓▄       ▐▓▓▓▓▓▓▀▀▀▀         ▓▓▓▓▓▓▀▀▀▀         ▐▓▓▓▓▓▓▓▓▓▓▓▓▓▓▀
//   ▓▓▓▓▓▓   ▀▓▓▓▓▓▓▄     ▐▓▓▓▓▓▓     ▓▓▓▓▓   ▓▓▓▓▓▓     ▓▓▓▓▓   ▐▓▓▓▓▓▌
// ▓▓▓▓▓▓▓▓▓▓ █▓▓▓▓▓▓▓▓▓ ▐▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  ▓▓▓▓▓▓▓▓▓▓
// ▓▓▓▓▓▓▓▓▓▓ ▓▓▓▓▓▓▓▓▓▓ ▐▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  ▓▓▓▓▓▓▓▓▓▓
//
//                           Trust math, not hardware.

// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import "@openzeppelin/contracts/access/Ownable.sol";

/// @title RewardTokenMinting
/// @notice Implements minting of reward tokens for registered Asset Pools with
///         a reward rate assigned individually for each Asset Pool.
///         Each Asset Pool is assigned a relative rate establishing a way for
///         Governance to incentivize different assets to target a particular
///         Collateral Pool composition.
/// @dev Contract is not meant to be deployed directly. It implements
///      a specific part of the functionality of the RewardPool and should be
///      used only as a RewardPool parent contract.
abstract contract RewardTokenMinting {
    // Reward rate per Asset Pool address.
    // Reward rate is 1e18 precision number.
    mapping(address => uint256) public rewardRates;

    // The last time minting rates were updated.
    uint256 public lastUpdateTime;

    uint256 internal tokenPerRateUnitAccumulated;
    mapping(address => uint256) internal poolTokenPerRateUnitPaid;
    mapping(address => uint256) internal poolTokens;

    // TODO: should be internal and used by governance function with a delay
    function setRewardRate(address assetPool, uint256 rewardRate) external {
        updateReward(assetPool);
        rewardRates[assetPool] = rewardRate;
    }

    function earned(address assetPool) public view returns (uint256) {
        return
            rewardRates[assetPool] *
            (tokenPerRateUnit() - poolTokenPerRateUnitPaid[assetPool]) +
            poolTokens[assetPool];
    }

    function updateReward(address assetPool) internal {
        tokenPerRateUnitAccumulated = tokenPerRateUnit();
        /* solhint-disable-next-line not-rely-on-time */
        lastUpdateTime = block.timestamp;
        poolTokens[assetPool] = earned(assetPool);
        poolTokenPerRateUnitPaid[assetPool] = tokenPerRateUnitAccumulated;
    }

    function tokenPerRateUnit() internal view returns (uint256) {
        return
            tokenPerRateUnitAccumulated +
            (/* solhint-disable-next-line not-rely-on-time */
            block.timestamp - lastUpdateTime);
    }
}

/// @title RewardsPool
/// @notice Rewards Pool is a contract that accepts arbitrary assets and mints
///         a single reward token. Recipients of the reward token can at any
///         time turn it in for a portion of the rewards in the pool.
///         A rewards pool maintains a governable list of recipients and
///         relative reward rates. For example, a rewards pool might have two
///         recipients — a WETH Asset Pool, and a WBTC asset pool, with
///         respective reward rates of 1 and 2. Rewards tokens are minted
///         constantly over time and distributed according to the relative
///         reward rates. Reward rates allows establishing a way for Governance
///         to incentivize different assets to target a particular Collateral
///         Pool composition.
contract RewardPoolV2 is RewardTokenMinting {
    // TODO: Add function to update reward rate with a governance delay.
    // TODO: Allow to withdraw rewards based on the amount of reward tokens.
}
