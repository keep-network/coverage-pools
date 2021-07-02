const { expect } = require("chai")
const {
  impersonateAccount,
  resetFork,
  ZERO_ADDRESS,
} = require("../helpers/contract-test-helpers")
const { initContracts } = require("./init-contracts")
const { bidderAddress1 } = require("./constants.js")

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

  let underwriterToken
  let assetPool
  let coveragePool
  let riskManagerV1
  let fakeDeposit

  let governance
  let thirdParty

  before(async () => {
    await resetFork(startingBlock)

    governance = (await ethers.getSigners())[0]

    const contracts = await initContracts("SignerBondsManualSwap")
    tbtcToken = contracts.tbtcToken
    underwriterToken = contracts.underwriterToken
    assetPool = contracts.assetPool
    signerBondsSwapStrategy = contracts.signerBondsSwapStrategy
    coveragePool = contracts.coveragePool
    riskManagerV1 = contracts.riskManagerV1
    tbtcDeposit1 = contracts.tbtcDeposit1
    thirdParty = contracts.thirdPartyAccount
    fakeDeposit = contracts.fakeTbtcDeposit

    await underwriterToken.transferOwnership(assetPool.address)
    await assetPool.transferOwnership(coveragePool.address)

    await coveragePool
      .connect(governance)
      .approveFirstRiskManager(riskManagerV1.address)

    bidder = await impersonateAccount(bidderAddress1)
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
