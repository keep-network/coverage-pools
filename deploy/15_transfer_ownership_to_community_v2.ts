import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { getNamedAccounts, helpers } = hre
  const { deployer, keepCommunityMultiSig } = await getNamedAccounts()

  await helpers.ownable.transferOwnership(
    "RiskManagerV2",
    keepCommunityMultiSig,
    deployer
  )
}

export default func

func.tags = ["TransferOwnership"]
func.dependencies = ["RiskManagerV2"]
func.runAtTheEnd = true
func.skip = async function (hre: HardhatRuntimeEnvironment): Promise<boolean> {
  return hre.network.name !== "mainnet"
}
