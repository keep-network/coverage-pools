import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { getNamedAccounts, deployments, ethers } = hre

  const { deploy, getArtifact, read, log, save } = deployments
  const { deployer, rewardManager } = await getNamedAccounts()

  const KeepToken = await deployments.get("KeepToken")
  const UnderwriterToken = await deployments.get("UnderwriterToken")

  const RewardsPool = await getArtifact("RewardsPool")

  const AssetPool = await deploy("AssetPool", {
    from: deployer,
    args: [KeepToken.address, UnderwriterToken.address, rewardManager],
    log: true,
  })

  const rewardsPoolAddress = await read("AssetPool", "rewardsPool")

  if (
    ethers.utils.getAddress(rewardsPoolAddress) === ethers.constants.AddressZero
  ) {
    throw new Error(`RewardsPool address is a zero address`)
  }

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

  log(
    `RewardsPool was deployed at ${rewardsPoolAddress} in the same transaction as AssetPool`
  )

  await save("RewardsPool", rewardsPoolDeploymentArtifact)
}

export default func

func.tags = ["AssetPool"]
func.dependencies = ["KeepToken", "UnderwriterToken"]
