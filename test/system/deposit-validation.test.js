const { expect } = require("chai")
const {
  to1e18,
  impersonateAccount,
  resetFork,
  ZERO_ADDRESS,
} = require("../helpers/contract-test-helpers")

const describeFn =
  process.env.NODE_ENV === "system-test" ? describe : describe.skip

// This system test scenario checks the deposit validation mechanism.
// It is meant to be executed on Hardhat Network with mainnet forking enabled.
// At the start, the fork is being reset to the specific starting block which
// determines the initial test state. This test uses real mainnet contracts.
// The case presented here simulates that a third party deploys an arbitrary,
// possibly malicious deposit contract. Then, it tries to open an auction
// for that deposit to perform potentially harmful actions on the coverage pool.
// However, deposit validation mechanism should prevent to open an auction
// due to lack of the tBTC deposit token for the fake deposit. In general,
// the risk manager should open an auction only when being notified about
// liquidation of a real deposit, represented by an existing tBTC deposit token.
describeFn("System -- deposit validation", () => {
  const startingBlock = 12368838
  const tbtcTokenAddress = "0x8daebade922df735c38c80c7ebd708af50815faa"
  const thirdPartyAddress = "0xa0216ED2202459068a750bDf74063f677613DA34"
  const keepTokenAddress = "0x85Eee30c52B0b379b046Fb0F85F4f3Dc3009aFEC"
  const tbtcDepositTokenAddress = "0x10b66bd1e3b5a936b7f8dbc5976004311037cdf0"
  const auctionLength = 86400 // 24h
  const collateralizationThreshold = 300

  let tbtcToken
  let underwriterToken
  let assetPool
  let signerBondsSwapStrategy
  let coveragePool
  let riskManagerV1
  let fakeDeposit

  let governance
  let rewardsManager
  let thirdParty

  before(async () => {
    await resetFork(startingBlock)

    governance = await ethers.getSigner(0)
    rewardsManager = await ethers.getSigner(1)
    thirdParty = await impersonateAccount(thirdPartyAddress)

    tbtcToken = await ethers.getContractAt("IERC20", tbtcTokenAddress)

    const UnderwriterToken = await ethers.getContractFactory("UnderwriterToken")
    underwriterToken = await UnderwriterToken.deploy("Coverage KEEP", "covKEEP")
    await underwriterToken.deployed()

    const AssetPool = await ethers.getContractFactory("AssetPool")
    assetPool = await AssetPool.deploy(
      keepTokenAddress,
      underwriterToken.address,
      rewardsManager.address
    )
    await assetPool.deployed()
    await underwriterToken.transferOwnership(assetPool.address)

    const SignerBondsSwapStrategy = await ethers.getContractFactory(
      "SignerBondsEscrow"
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
      tbtcDepositTokenAddress,
      coveragePool.address,
      signerBondsSwapStrategy.address,
      masterAuction.address,
      auctionLength,
      collateralizationThreshold
    )
    await riskManagerV1.deployed()

    await coveragePool
      .connect(governance)
      .beginRiskManagerApproval(riskManagerV1.address)
    await coveragePool
      .connect(governance)
      .finalizeRiskManagerApproval(riskManagerV1.address)

    // Suppose a third party deploys an arbitrary deposit contract.
    // For simplicity, let's say it's just the DepositStub.
    const DepositStub = await ethers.getContractFactory("DepositStub")
    fakeDeposit = await DepositStub.connect(thirdParty).deploy(
      tbtcToken.address,
      to1e18(1)
    )
    await fakeDeposit.deployed()
  })

  describe("test initial state", () => {
    describe("fake deposit's auction", () => {
      it("should not exist", async () => {
        const auctionAddress = await riskManagerV1.depositToAuction(
          fakeDeposit.address
        )
        expect(auctionAddress).to.be.equal(ZERO_ADDRESS)
      })
    })
  })

  describe("when trying to open an auction for a fake deposit", () => {
    it("should revert the notify liquidation transaction", async () => {
      // The third party tries to open an auction for the fake deposit.
      await expect(
        riskManagerV1.connect(thirdParty).notifyLiquidation(fakeDeposit.address)
      ).to.be.revertedWith("Address is not a deposit contract")

      expect(
        await riskManagerV1.depositToAuction(fakeDeposit.address)
      ).to.be.equal(ZERO_ADDRESS)
    })
  })
})
