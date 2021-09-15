import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { getNamedAccounts, helpers } = hre
  const { deployer, keepCommunityMultiSig } = await getNamedAccounts()

  await helpers.ownable.transferOwnership(
    "SignerBondsUniswapV2",
    keepCommunityMultiSig,
    deployer
  )

  await helpers.ownable.transferOwnership(
    "SignerBondsManualSwap",
    keepCommunityMultiSig,
    deployer
  )

  await helpers.ownable.transferOwnership(
    "CoveragePool",
    keepCommunityMultiSig,
    deployer
  )

  await helpers.ownable.transferOwnership(
    "RiskManagerV1",
    keepCommunityMultiSig,
    deployer
  )
}

export default func

func.tags = ["TransferOwnership"]
func.dependencies = [
  "SignerBondsUniswapV2",
  "SignerBondsManualSwap",
  "CoveragePool",
  "RiskManagerV1",
]
func.runAtTheEnd = true
func.skip = async function (hre: HardhatRuntimeEnvironment): Promise<boolean> {
  return hre.network.name !== "mainnet"
}
