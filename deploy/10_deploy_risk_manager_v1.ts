import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { getNamedAccounts, deployments } = hre
  const { log } = deployments
  const { deployer } = await getNamedAccounts()

  const TBTCToken = await deployments.get("TBTCToken")
  const TBTCDepositToken = await deployments.get("TBTCDepositToken")
  const CoveragePool = await deployments.get("CoveragePool")
  const SignerBondsManualSwap = await deployments.get("SignerBondsManualSwap")
  const SignerBondsUniswapV2 = await deployments.get("SignerBondsUniswapV2")
  const MasterAuction = await deployments.get("MasterAuction")

  const auctionLength = 86400 // 24h
  const bondAuctionThreshold = 100
  const initialSwapStrategy =
    process.env.INITIAL_SWAP_STRATEGY || "SignerBondsManualSwap"

  log(`using ${initialSwapStrategy} as initial risk manager's swap strategy`)

  const signerBondStrategy = { SignerBondsManualSwap, SignerBondsUniswapV2 }[
    initialSwapStrategy
  ]

  if (!signerBondStrategy) {
    throw new Error(`signer bond strategy not found: ${initialSwapStrategy}`)
  }

  await deployments.deploy("RiskManagerV1", {
    from: deployer,
    args: [
      TBTCToken.address,
      TBTCDepositToken.address,
      CoveragePool.address,
      signerBondStrategy.address,
      MasterAuction.address,
      auctionLength,
      bondAuctionThreshold,
    ],
    log: true,
  })
}

export default func

func.tags = ["RiskManagerV1"]
func.dependencies = [
  "TBTCToken",
  "TBTCDepositToken",
  "CoveragePool",
  "SignerBondsManualSwap",
  "SignerBondsUniswapV2",
  "MasterAuction",
]
