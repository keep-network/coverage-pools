import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { getNamedAccounts, deployments } = hre
  const { deployer } = await getNamedAccounts()

  const CoveragePool = await deployments.get("CoveragePool")

  await deployments.deploy("AuctionBidder", {
    from: deployer,
    args: [CoveragePool.address],
    log: true,
  })
}

export default func

func.tags = ["AuctionBidder"]
func.dependencies = ["CoveragePool"]
