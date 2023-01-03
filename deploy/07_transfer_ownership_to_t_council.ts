import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { getNamedAccounts, deployments, helpers } = hre
  const { deployer, thresholdCouncil } = await getNamedAccounts()
  const { execute } = deployments

  await execute(
    "BatchedPhasedEscrow",
    { from: deployer, log: true },
    "setDrawee",
    thresholdCouncil
  )

  await helpers.ownable.transferOwnership(
    "BatchedPhasedEscrow",
    thresholdCouncil,
    deployer
  )

  await helpers.ownable.transferOwnership(
    "CoveragePool",
    thresholdCouncil,
    deployer
  )
}

export default func

func.tags = ["TransferOwnership"]
func.dependencies = ["BatchedPhasedEscrow", "CoveragePool"]
func.runAtTheEnd = true
func.skip = async function (hre: HardhatRuntimeEnvironment): Promise<boolean> {
  return hre.network.name !== "mainnet"
}
