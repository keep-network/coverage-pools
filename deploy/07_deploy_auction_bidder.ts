import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { getNamedAccounts, deployments } = hre
  const { deployer } = await getNamedAccounts()

  const CoveragePool = await deployments.get("CoveragePool")

  const AuctionBidder = await deployments.deploy("AuctionBidder", {
    from: deployer,
    args: [CoveragePool.address],
    log: true,
  })

  if (hre.network.tags.etherscan) {
    await hre.ethers.provider.waitForTransaction(AuctionBidder.transactionHash, 10, 900000)

    await hre.run("verify:verify", {
      address: AuctionBidder.address,
      constructorArguments: [
        CoveragePool.address,
      ],
      contract: "contracts/AuctionBidder.sol:AuctionBidder",
    })
  }
}

export default func

func.tags = ["AuctionBidder"]
func.dependencies = ["CoveragePool"]
