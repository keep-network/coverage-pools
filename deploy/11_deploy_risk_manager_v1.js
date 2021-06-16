module.exports = async ({ getNamedAccounts, deployments }) => {
  const { deploy, log } = deployments
  const { deployer } = await getNamedAccounts()
  const TBTCToken = await deployments.get("TBTCToken")
  const TBTCDepositToken = await deployments.get("TBTCDepositToken")
  const CoveragePool = await deployments.get("CoveragePool")
  const SignerBondsEscrow = await deployments.get("SignerBondsEscrow")
  const SignerBondsUniswapV2 = await deployments.get("SignerBondsUniswapV2")
  const MasterAuction = await deployments.get("MasterAuction")

  const auctionLength = 86400 // 24h
  const bondAuctionThreshold = 100
  const initialSwapStrategy =
    process.env.INITIAL_SWAP_STRATEGY || "SignerBondsEscrow"

  log(`using ${initialSwapStrategy} as initial risk manager's swap strategy`)

  await deploy("RiskManagerV1", {
    from: deployer,
    args: [
      TBTCToken.address,
      TBTCDepositToken.address,
      CoveragePool.address,
      { SignerBondsEscrow, SignerBondsUniswapV2 }[initialSwapStrategy].address,
      MasterAuction.address,
      auctionLength,
      bondAuctionThreshold,
    ],
    log: true,
  })
}

module.exports.tags = ["RiskManagerV1"]
module.exports.dependencies = [
  "TBTCToken",
  "TBTCDepositToken",
  "CoveragePool",
  "SignerBondsEscrow",
  "SignerBondsUniswapV2",
  "MasterAuction",
]
