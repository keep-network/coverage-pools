const {
  tbtcTokenAddress,
  keepTokenAddress,
  tbtcDepositTokenAddress,
  depositAddress,
  thirdPartyAddress,
  uniswapV2RouterAddress,
} = require("./constants.js")

const {
  to1e18,
  impersonateAccount,
} = require("../helpers/contract-test-helpers")

async function initContracts(swapStrategy) {
  const auctionLength = 86400 // 24h
  // Only deposits with at least 75% of bonds offered on bond auction will be
  // accepted by the risk manager.
  const bondAuctionThreshold = 75
  const notifierReward = to1e18(5)

  const rewardsManager = await ethers.getSigner(1)

  const UnderwriterToken = await ethers.getContractFactory("UnderwriterToken")
  const underwriterToken = await UnderwriterToken.deploy(
    "Coverage KEEP",
    "covKEEP"
  )
  await underwriterToken.deployed()

  const tbtcToken = await ethers.getContractAt("IERC20", tbtcTokenAddress)
  const collateralToken = await ethers.getContractAt("IERC20", keepTokenAddress)
  const uniswapV2Router = await ethers.getContractAt(
    "IUniswapV2Router",
    uniswapV2RouterAddress
  )
  const tbtcDeposit = await ethers.getContractAt("IDeposit", depositAddress)

  const AssetPool = await ethers.getContractFactory("AssetPool")
  const assetPool = await AssetPool.deploy(
    keepTokenAddress,
    underwriterToken.address,
    rewardsManager.address
  )
  await assetPool.deployed()

  const CoveragePool = await ethers.getContractFactory("CoveragePool")
  const coveragePool = await CoveragePool.deploy(assetPool.address)
  await coveragePool.deployed()

  let signerBondsSwapStrategy
  if (swapStrategy == "SignerBondsManualSwap") {
    const SignerBondsSwapStrategy = await ethers.getContractFactory(
      "SignerBondsManualSwap"
    )
    signerBondsSwapStrategy = await SignerBondsSwapStrategy.deploy()
  } else if (swapStrategy == "SignerBondsUniswapV2") {
    const SignerBondsUniswapV2 = await ethers.getContractFactory(
      "SignerBondsUniswapV2"
    )
    signerBondsSwapStrategy = await SignerBondsUniswapV2.deploy(
      uniswapV2Router.address,
      coveragePool.address
    )
  }
  await signerBondsSwapStrategy.deployed()

  const Auction = await ethers.getContractFactory("Auction")
  const masterAuction = await Auction.deploy()
  await masterAuction.deployed()

  const RiskManagerV1 = await ethers.getContractFactory("RiskManagerV1")
  const riskManagerV1 = await RiskManagerV1.deploy(
    tbtcToken.address,
    tbtcDepositTokenAddress,
    coveragePool.address,
    signerBondsSwapStrategy.address,
    masterAuction.address,
    auctionLength,
    bondAuctionThreshold,
    notifierReward
  )
  await riskManagerV1.deployed()

  const thirdParty = await impersonateAccount(thirdPartyAddress)
  // Suppose a third party deploys an arbitrary deposit contract.
  // For simplicity, let's say it's just the DepositStub.
  const DepositStub = await ethers.getContractFactory("DepositStub")
  const fakeTbtcDeposit = await DepositStub.connect(thirdParty).deploy(
    tbtcToken.address,
    to1e18(1)
  )
  await fakeTbtcDeposit.deployed()

  return {
    underwriterToken: underwriterToken,
    tbtcToken: tbtcToken,
    assetPool: assetPool,
    signerBondsSwapStrategy: signerBondsSwapStrategy,
    coveragePool: coveragePool,
    riskManagerV1: riskManagerV1,
    tbtcDeposit: tbtcDeposit,
    fakeTbtcDeposit: fakeTbtcDeposit,
    thirdPartyAccount: thirdParty,
    collateralToken: collateralToken,
    uniswapV2Router: uniswapV2Router,
  }
}

module.exports.initContracts = initContracts
