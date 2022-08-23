import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { getNamedAccounts, deployments } = hre
  const { deployer, keepCommunityMultiSig } = await getNamedAccounts()

  const TBTCToken = await deployments.get("TBTCToken")
  const CoveragePool = await deployments.get("CoveragePool")
  const MasterAuction = await deployments.get("Auction")

  let initialSwapStrategy: string = process.env.INITIAL_SWAP_STRATEGY
  if (!initialSwapStrategy) {
    initialSwapStrategy =
      hre.network.name === "mainnet"
        ? "SignerBondsUniswapV2"
        : "SignerBondsManualSwap"
  }

  const riskManagerV2 = await deployments.deploy("RiskManagerV2", {
    from: deployer,
    args: [
      TBTCToken.address,
      CoveragePool.address,
      MasterAuction.address,
      keepCommunityMultiSig,
    ],
    log: true,
  })

  if (hre.network.tags.tenderly) {
    await hre.tenderly.verify({
      name: "RiskManagerV2",
      address: riskManagerV2.address,
    })
  }
}

export default func

func.tags = ["RiskManagerV2"]
func.dependencies = ["TBTCToken", "CoveragePool", "Auction"]
