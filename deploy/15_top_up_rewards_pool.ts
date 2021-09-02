import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { getNamedAccounts, deployments } = hre
  const { execute } = deployments
  const { deployer, rewardManager } = await getNamedAccounts()

  const RewardsPool = await deployments.get("RewardsPool")

  const rewardsPoolAddress = RewardsPool.address
  const reward = "1000000000000000000000000" // 1 000 000

  await execute(
    "KeepToken",
    { from: deployer },
    "approve",
    rewardManager,
    reward
  )

  await execute(
    "KeepToken",
    { from: deployer },
    "transfer",
    rewardManager,
    reward
  )

  await execute(
    "KeepToken",
    { from: rewardManager },
    "approve",
    rewardsPoolAddress,
    reward
  )

  await execute("RewardsPool", { from: rewardManager }, "topUpReward", reward)
}

export default func

func.tags = ["TopUpRewardsPool"]
func.skip = async function (hre: HardhatRuntimeEnvironment): Promise<boolean> {
  return hre.network.name === "hardhat"
}
