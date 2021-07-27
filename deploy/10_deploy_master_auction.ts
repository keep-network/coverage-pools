import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { getNamedAccounts, deployments } = hre
  const { deployer } = await getNamedAccounts()

  // Deploy a master Auction contract that will be used by Auctioneer to create
  // clones instances.
  await deployments.deploy("Auction", {
    contract: "Auction",
    from: deployer,
    log: true,
  })
}

export default func

func.tags = ["MasterAuction"]
