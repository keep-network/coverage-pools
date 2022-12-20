import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { getNamedAccounts, deployments } = hre
  const { deployer, treasuryGuild } = await getNamedAccounts()

  const { execute, log } = deployments

  log(`approving treasury guild as the first risk manager`, treasuryGuild)

  await execute(
    "CoveragePool",
    { from: deployer, log: true },
    "approveFirstRiskManager",
    treasuryGuild
  )
}

export default func

func.tags = ["ApproveTreasuryGuild"]
func.dependencies = ["CoveragePool"]
func.skip = async function (hre: HardhatRuntimeEnvironment): Promise<boolean> {
  return hre.network.name !== "mainnet"
}
