const { expect } = require("chai")
const { to1e18, increaseTime } = require("../helpers/contract-test-helpers")
const hre = require("hardhat")
const { deployMockContract } = require("@ethereum-waffle/mock-contract")

const ITBTCDepositToken = hre.artifacts.readArtifactSync("ITBTCDepositToken")

const describeFn =
  process.env.NODE_ENV === "system-test" ? describe : describe.skip

// This system test checks the notifier rewards mechanism. It uses mocks for
// tBTC contracts and doesn't leverage the Hardhat mainnet forking feature.
describeFn("System -- notifier rewards", () => {
  const auctionLength = 86400 // 24h
  const lotSize = to1e18(10)
  const bondedAmount = to1e18(150)
  const bondAuctionThreshold = 100
  const covTotalSupply = to1e18(1000)
  const liquidationNotifierReward = to1e18(2)
  const liquidatedNotifierReward = to1e18(3)

  let tbtcToken
  let underwriterToken
  let assetPool
  let signerBondsSwapStrategy
  let coveragePool
  let riskManagerV1
  let depositStub

  let governance
  let notifier
  let otherNotifier
  let rewardsManager

  beforeEach(async () => {
    governance = await ethers.getSigner(0)
    notifier = await ethers.getSigner(1)
    otherNotifier = await ethers.getSigner(2)
    rewardsManager = await ethers.getSigner(3)
    councilMultisig = await ethers.getSigner(4)

    const TestToken = await ethers.getContractFactory("TestToken")
    tbtcToken = await TestToken.deploy()
    await tbtcToken.deployed()

    const UnderwriterToken = await ethers.getContractFactory("UnderwriterToken")
    underwriterToken = await UnderwriterToken.deploy("Coverage KEEP", "covKEEP")
    await underwriterToken.deployed()
    await underwriterToken.mint(governance.address, covTotalSupply)

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
      governance,
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
      councilMultisig.address
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
    })

    context("when reward amount is zero", () => {
      beforeEach(async () => {
        await riskManagerV1
          .connect(notifier)
          .notifyLiquidation(depositStub.address)
      })

      it("should not be rewarded with asset pool shares", async () => {
        expect(await underwriterToken.balanceOf(notifier.address)).to.be.equal(
          0
        )
      })
    })

    context("when reward amount is set", () => {
      beforeEach(async () => {
        await riskManagerV1.beginLiquidationNotifierRewardUpdate(
          liquidationNotifierReward
        )
        await increaseTime(43200)
        await riskManagerV1.finalizeLiquidationNotifierRewardUpdate()

        await riskManagerV1
          .connect(notifier)
          .notifyLiquidation(depositStub.address)
      })

      it("should be rewarded with fixed amount of asset pool shares", async () => {
        expect(await underwriterToken.balanceOf(notifier.address)).to.be.equal(
          liquidationNotifierReward
        )
      })
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
    })

    context("when reward amount is zero", () => {
      beforeEach(async () => {
        await riskManagerV1
          .connect(notifier)
          .notifyLiquidated(depositStub.address)
      })

      it("should not be rewarded with asset pool shares", async () => {
        expect(await underwriterToken.balanceOf(notifier.address)).to.be.equal(
          0
        )
      })
    })

    context("when reward amount is set", () => {
      beforeEach(async () => {
        await riskManagerV1.beginLiquidatedNotifierRewardUpdate(
          liquidatedNotifierReward
        )
        await increaseTime(43200)
        await riskManagerV1.finalizeLiquidatedNotifierRewardUpdate()

        await riskManagerV1
          .connect(notifier)
          .notifyLiquidated(depositStub.address)
      })

      it("should be rewarded with fixed amount of asset pool shares", async () => {
        expect(await underwriterToken.balanceOf(notifier.address)).to.be.equal(
          liquidatedNotifierReward
        )
      })
    })
  })
})
