// SPDX-License-Identifier: MIT

pragma solidity <0.9.0;

import "./AssetPool.sol";
import "./CloneFactory.sol";
import "./CoveragePoolConstants.sol";
import "./UnderwriterToken.sol";

import "@openzeppelin/contracts/access/Ownable.sol";

contract RewardsPool is CloneFactory, Ownable {
    // Holds the address of the RewardsPoolStaking contract which will be used
    // as a master contract for cloning.
    address public masterRewardsPoolStaking;

    // Maps AssetPool address to RewardsPoolStaking address created for this
    // AssetPool.
    mapping(address => address) public stakingPools;

    constructor(address _masterRewardsPoolStaking) {
        masterRewardsPoolStaking = _masterRewardsPoolStaking;
    }

    function setRewardRate(AssetPool assetPool, uint256 rate) external onlyOwner {
        address assetPoolAddress = address(assetPool);
        if (stakingPools[assetPoolAddress] == address(0)) {
            address cloneAddress = createClone(masterRewardsPoolStaking);
            stakingPools[assetPoolAddress] = cloneAddress;
            RewardsPoolStaking(cloneAddress).initialize(
                this,
                assetPool.underwriterToken()
            );
        }

        RewardsPoolStaking(stakingPools[assetPoolAddress]).setRewardRate(rate);
    }
}

/// @title RewardsPoolStaking
/// @notice Staking pool for the given underwriter token responsible for minting
///         virtual reward tokens based on underwriter's staked tokens balances.
///         RewardsPool contract references multiple RewardsPoolStaking contracts,
///         one per each stakeable underwriter token with non-zero reward weight.
/// @dev    Contract is not meant to be deloyed directly and is instead cloned
///         by RewardsPool.
contract RewardsPoolStaking {
    using SafeMath for uint256;
    using SafeERC20 for UnderwriterToken;

    // One virtual reward token minted per second.
    uint256 public constant MINTING_RATE = 1e18;

    RewardsPool public rewardsPool;

    // The stakeable underwriter token.
    UnderwriterToken public underwriterToken;

    // Reward rate for the Asset Pool this staking pool was created for.
    // Each asset pool in the collateral pool is assigned a relative rate
    // in the rewards pool, establishing a way for governance to incentivize
    // different assets to target a particular collateral pool composition.
    uint256 public rewardRate;

    // Staked underwriter token balances per staker address.
    mapping(address => uint256) public balanceOf;
    // The total amount of staked underwriter tokens.
    uint256 public totalStaked;

    uint256 internal rewardPerTokenAccumulated;
    mapping(address => uint256) internal userRewardPerTokenPaid;
    mapping(address => uint256) internal rewards;
    uint256 internal lastUpdateTime;

    event Staked(address indexed account, uint256 amount);
    event Unstaked(address indexed account, uint256 amount);

    modifier onlyRewardsPool() {
        require(
            msg.sender == address(rewardsPool),
            "Caller is not the RewardsPool"
        );
        _;
    }

    function initialize(
        RewardsPool _rewardsPool,
        UnderwriterToken _underwriterToken
    ) external {
        require(
            address(underwriterToken) == address(0),
            "RewardsPoolStaking already initialized"
        );

        rewardsPool = _rewardsPool;
        underwriterToken = _underwriterToken;
    }

    function setRewardRate(uint256 _rewardRate) external onlyRewardsPool {
        rewardRate = _rewardRate;
    }

    function stake(uint256 amount) external {
        updateReward(msg.sender);
        totalStaked = totalStaked.add(amount);
        balanceOf[msg.sender] = balanceOf[msg.sender].add(amount);
        emit Staked(msg.sender, amount);
        underwriterToken.safeTransferFrom(msg.sender, address(this), amount);
    }

    function unstake(uint256 amount) external {
        updateReward(msg.sender);
        totalStaked = totalStaked.sub(amount);
        balanceOf[msg.sender] = balanceOf[msg.sender].sub(amount);
        emit Unstaked(msg.sender, amount);
        underwriterToken.safeTransfer(msg.sender, amount);
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
