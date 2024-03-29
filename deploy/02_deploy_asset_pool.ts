import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { getNamedAccounts, deployments, helpers } = hre
  const { read, log } = deployments
  const { deployer, rewardManager } = await getNamedAccounts()

  const T = await deployments.get("T")
  const UnderwriterToken = await deployments.get("UnderwriterToken")

  const RewardsPool = await deployments.getArtifact("RewardsPool")

  const AssetPool = await deployments.deploy("AssetPool", {
    from: deployer,
    args: [T.address, UnderwriterToken.address, rewardManager],
    log: true,
    waitConfirmations: 1,
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
      args: [T.address, AssetPool.address, rewardManager],
    },
    RewardsPool
  )

  await deployments.save("RewardsPool", rewardsPoolDeploymentArtifact)

  await helpers.ownable.transferOwnership(
    "UnderwriterToken",
    AssetPool.address,
    deployer
  )

  if (hre.network.tags.etherscan) {
    await helpers.etherscan.verify(
      AssetPool,
      // Provide contract name as a workaround for error returned by hardhat:
      // "More than one contract was found to match the deployed bytecode."
      "contracts/AssetPool.sol:AssetPool"
    )

    await helpers.etherscan.verify(rewardsPoolDeploymentArtifact)
  }

  if (hre.network.tags.tenderly) {
    await hre.tenderly.verify({
      name: "AssetPool",
      address: AssetPool.address,
    })

    await hre.tenderly.verify({
      name: "RewardsPool",
      address: rewardsPoolAddress,
    })
  }
}

export default func

func.tags = ["AssetPool"]
func.dependencies = ["T", "UnderwriterToken"]
