import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { getNamedAccounts, deployments } = hre
  const { deployer } = await getNamedAccounts()

  const CoveragePool = await deployments.get("CoveragePool")

  const auctionBidder = await deployments.deploy("AuctionBidder", {
    from: deployer,
    args: [CoveragePool.address],
    log: true,
  })

  if (hre.network.name == "ropsten") {
    await hre.tenderly.persistArtifacts({
      name: "AuctionBidder",
      address: auctionBidder.address,
    })

    await hre.tenderly.verify({
      name: "AuctionBidder",
      address: auctionBidder.address,
    })
  }
}

export default func

func.tags = ["AuctionBidder"]
func.dependencies = ["CoveragePool"]
