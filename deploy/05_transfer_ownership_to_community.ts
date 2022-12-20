import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { getNamedAccounts, helpers } = hre
  const { deployer, tCommunityMultiSig } = await getNamedAccounts()

  await helpers.ownable.transferOwnership(
    "CoveragePool",
    tCommunityMultiSig,
    deployer
  )
}

export default func

func.tags = ["TransferOwnership"]
func.dependencies = ["CoveragePool"]
func.runAtTheEnd = true
func.skip = async function (hre: HardhatRuntimeEnvironment): Promise<boolean> {
  return hre.network.name !== "mainnet"
}
