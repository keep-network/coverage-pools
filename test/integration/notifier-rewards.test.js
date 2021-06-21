const { expect } = require("chai")
const { to1e18 } = require("../helpers/contract-test-helpers")
const { deployMockContract } = require("@ethereum-waffle/mock-contract")
const ITBTCDepositToken = require("../../artifacts/contracts/RiskManagerV1.sol/ITBTCDepositToken.json")

describe("Integration -- notifier rewards", () => {
  const auctionLength = 86400 // 24h
  const lotSize = to1e18(10)
  const bondedAmount = to1e18(150)
  const bondAuctionThreshold = 100
  const notifierReward = to1e18(5)

  let tbtcToken
  let underwriterToken
  let assetPool
  let signerBondsSwapStrategy
  let coveragePool
  let riskManagerV1
  let depositStub

  let owner
  let notifier
  let otherNotifier
  let rewardsManager

  beforeEach(async () => {
    owner = await ethers.getSigner(0)
    notifier = await ethers.getSigner(1)
    otherNotifier = await ethers.getSigner(2)
    rewardsManager = await ethers.getSigner(3)

    const TestToken = await ethers.getContractFactory("TestToken")
    tbtcToken = await TestToken.deploy()
    await tbtcToken.deployed()

    const UnderwriterToken = await ethers.getContractFactory("UnderwriterToken")
    underwriterToken = await UnderwriterToken.deploy("Coverage KEEP", "covKEEP")
    await underwriterToken.deployed()

    const AssetPool = await ethers.getContractFactory("AssetPool")
    assetPool = await AssetPool.deploy(
      tbtcToken.address,
      underwriterToken.address,
      rewardsManager.address
    )

    await underwriterToken.transferOwnership(assetPool.address)

    // For brevity, use a mock tBTC deposit token contract and simulate
    // all deposits are legit.
    const mockTbtcDepositToken = await deployMockContract(
      owner,
      ITBTCDepositToken.abi
    )
    await mockTbtcDepositToken.mock.exists.returns(true)

    const SignerBondsSwapStrategy = await ethers.getContractFactory(
      "SignerBondsManualSwap"
    )
    signerBondsSwapStrategy = await SignerBondsSwapStrategy.deploy()
    await signerBondsSwapStrategy.deployed()

    const Auction = await ethers.getContractFactory("Auction")
    const masterAuction = await Auction.deploy()
    await masterAuction.deployed()

    const CoveragePool = await ethers.getContractFactory("CoveragePool")
    coveragePool = await CoveragePool.deploy(assetPool.address)
    await coveragePool.deployed()

    await assetPool.transferOwnership(coveragePool.address)

    const RiskManagerV1 = await ethers.getContractFactory("RiskManagerV1")
    riskManagerV1 = await RiskManagerV1.deploy(
      tbtcToken.address,
      mockTbtcDepositToken.address,
      coveragePool.address,
      signerBondsSwapStrategy.address,
      masterAuction.address,
      auctionLength,
      bondAuctionThreshold,
      notifierReward
    )
    await riskManagerV1.deployed()

    await coveragePool.approveFirstRiskManager(riskManagerV1.address)

    const DepositStub = await ethers.getContractFactory("DepositStub")
    depositStub = await DepositStub.deploy(tbtcToken.address, lotSize)
    await depositStub.deployed()
    await depositStub.setAuctionValue(bondedAmount)
  })

  describe("when notifier notifies about deposit liquidation", () => {
    beforeEach(async () => {
      await depositStub.notifyUndercollateralizedLiquidation()

      await riskManagerV1
        .connect(notifier)
        .notifyLiquidation(depositStub.address)
    })

    it("should be rewarded with asset pool shares", async () => {
      expect(await underwriterToken.balanceOf(notifier.address)).to.be.equal(
        notifierReward
      )
    })
  })

  describe("when notifier notifies about deposit liquidated", () => {
    beforeEach(async () => {
      await depositStub.notifyUndercollateralizedLiquidation()

      await riskManagerV1
        .connect(otherNotifier)
        .notifyLiquidation(depositStub.address)

      await tbtcToken.mint(otherNotifier.address, lotSize)
      await tbtcToken
        .connect(otherNotifier)
        .approve(depositStub.address, lotSize)

      await depositStub.connect(otherNotifier).purchaseSignerBondsAtAuction()

      await riskManagerV1
        .connect(notifier)
        .notifyLiquidated(depositStub.address)
    })

    it("should be rewarded with asset pool shares", async () => {
      expect(await underwriterToken.balanceOf(notifier.address)).to.be.equal(
        notifierReward
      )
    })
  })
})
