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
  const MasterAuction = await deployments.get("Auction")

  const auctionLength: number = 604800 // 7 days in seconds
  const bondAuctionThreshold: number = 100 // percentage

  let initialSwapStrategy: string = process.env.INITIAL_SWAP_STRATEGY
  if (!initialSwapStrategy) {
    initialSwapStrategy =
      hre.network.name === "mainnet"
        ? "SignerBondsUniswapV2"
        : "SignerBondsManualSwap"
  }

  const signerBondStrategy = { SignerBondsManualSwap, SignerBondsUniswapV2 }[
    initialSwapStrategy
  ]

  if (!signerBondStrategy) {
    throw new Error(`signer bond strategy not found: ${initialSwapStrategy}`)
  }

  log(
    `using ${initialSwapStrategy} (${signerBondStrategy.address}) ` +
      `as initial risk manager's swap strategy`
  )

  const RiskManagerV1 = await deployments.deploy("RiskManagerV1", {
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

  if (hre.network.tags.etherscan) {
    await hre.ethers.provider.waitForTransaction(RiskManagerV1.transactionHash, 10, 900000)

    await hre.run("verify:verify", {
      address: RiskManagerV1.address,
      constructorArguments: [
        TBTCToken.address,
        TBTCDepositToken.address,
        CoveragePool.address,
        signerBondStrategy.address,
        MasterAuction.address,
        auctionLength,
        bondAuctionThreshold,
      ],
      contract: "contracts/RiskManagerV1.sol:RiskManagerV1",
    })
  }
}

export default func

func.tags = ["RiskManagerV1"]
func.dependencies = [
  "TBTCToken",
  "TBTCDepositToken",
  "CoveragePool",
  "SignerBondsManualSwap",
  "SignerBondsUniswapV2",
  "Auction",
]
