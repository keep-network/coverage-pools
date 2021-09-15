import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { getNamedAccounts, deployments, helpers } = hre
  const { read } = deployments
  const { deployer, rewardManager } = await getNamedAccounts()

  const KeepToken = await deployments.get("KeepToken")
  const BatchedPhasedEscrow = await deployments.get("BatchedPhasedEscrow")

  const RewardsPoolAddress = await read("AssetPool", "rewardsPool")

  const CoveragePoolBeneficiary = await deployments.deploy(
    "CoveragePoolBeneficiary",
    {
      contract: "CoveragePoolBeneficiary",
      from: deployer,
      args: [KeepToken.address, RewardsPoolAddress],
      log: true,
    }
  )

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

  if (hre.network.tags.etherscan) {
    await hre.ethers.provider.waitForTransaction(CoveragePoolBeneficiary.transactionHash, 10, 900000)

    await hre.run("verify:verify", {
      address: CoveragePoolBeneficiary.address,
      constructorArguments: [
        KeepToken.address,
        RewardsPoolAddress,
      ],
      contract: "contracts/CoveragePoolBeneficiary.sol:CoveragePoolBeneficiary",
    })
  }
}

export default func

func.tags = ["CoveragePoolBeneficiary"]
func.dependencies = ["KeepToken", "AssetPool"]
func.skip = async function (hre: HardhatRuntimeEnvironment): Promise<boolean> {
  return hre.network.name !== "mainnet"
}
