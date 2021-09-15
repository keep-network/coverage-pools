import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { getNamedAccounts, deployments } = hre
  const { deployer } = await getNamedAccounts()

  // Deploy a master Auction contract that will be used by Auctioneer to create
  // clones instances.
  const Auction = await deployments.deploy("Auction", {
    contract: "Auction",
    from: deployer,
    log: true,
  })

  if (hre.network.tags.etherscan) {
    await hre.ethers.provider.waitForTransaction(Auction.transactionHash, 10, 900000)

    await hre.run("verify:verify", {
      address: Auction.address,
      contract: "contracts/Auction.sol:Auction",
    })
  }
}

export default func

func.tags = ["MasterAuction"]
