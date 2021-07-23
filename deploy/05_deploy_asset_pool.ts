import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { getNamedAccounts, deployments, helpers } = hre
  const { read, log } = deployments
  const { deployer, rewardManager } = await getNamedAccounts()

  const KeepToken = await deployments.get("KeepToken")
  const UnderwriterToken = await deployments.get("UnderwriterToken")

  const RewardsPool = await deployments.getArtifact("RewardsPool")

  const AssetPool = await deployments.deploy("AssetPool", {
    from: deployer,
    args: [KeepToken.address, UnderwriterToken.address, rewardManager],
    log: true,
  })

  const rewardsPoolAddress = helpers.address.validate(
    await read("AssetPool", "rewardsPool")
  )

  log(
    `RewardsPool was deployed at ${rewardsPoolAddress} in the same transaction as AssetPool`
  )

  // The`RewardsPool` contract is created in the `AssetPool` constructor so
  // we create an artifact for it.
  const receipt = AssetPool.receipt

  const rewardsPoolDeploymentArtifact = Object.assign(
    {
      address: rewardsPoolAddress,
      receipt,
      transactionHash: AssetPool.transactionHash,
    },
    RewardsPool
  )

  await deployments.save("RewardsPool", rewardsPoolDeploymentArtifact)

  await helpers.ownable.transferOwnership(
    "UnderwriterToken",
    AssetPool.address,
    deployer
  )
}

export default func

func.tags = ["AssetPool"]
func.dependencies = ["KeepToken", "UnderwriterToken"]
