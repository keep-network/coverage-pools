import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { getNamedAccounts, deployments } = hre
  const { deployer } = await getNamedAccounts()

  const UniswapV2Router = await deployments.get("UniswapV2Router")
  const CoveragePool = await deployments.get("CoveragePool")

  await deployments.deploy("SignerBondsUniswapV2", {
    from: deployer,
    args: [UniswapV2Router.address, CoveragePool.address],
    log: true,
  })
}

export default func

func.tags = ["SignerBondsUniswapV2"]
func.dependencies = ["UniswapV2Router", "CoveragePool"]
