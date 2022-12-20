import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { getNamedAccounts, deployments, helpers } = hre
  const { read } = deployments
  const { deployer, rewardManager } = await getNamedAccounts()

  const T = await deployments.get("T")
  const BatchedPhasedEscrow = await deployments.get("BatchedPhasedEscrow")

  const RewardsPoolAddress = await read("AssetPool", "rewardsPool")

  const CoveragePoolBeneficiary = await deployments.deploy(
    "CoveragePoolBeneficiary",
    {
      contract: "CoveragePoolBeneficiary",
      from: deployer,
      args: [T.address, RewardsPoolAddress],
      log: true,
    }
  )

  if (hre.network.tags.tenderly) {
    await hre.tenderly.verify({
      name: "CoveragePoolBeneficiary",
      address: CoveragePoolBeneficiary.address,
    })
  }

  await helpers.ownable.transferOwnership(
    "CoveragePoolBeneficiary",
    BatchedPhasedEscrow.address,
    deployer
  )

  await helpers.ownable.transferOwnership(
    "RewardsPool",
    CoveragePoolBeneficiary.address,
    rewardManager
  )
}

export default func

func.tags = ["CoveragePoolBeneficiary"]
func.dependencies = ["T", "AssetPool"]
func.skip = async function (hre: HardhatRuntimeEnvironment): Promise<boolean> {
  return hre.network.name !== "mainnet"
}
