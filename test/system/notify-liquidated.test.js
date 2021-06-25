const { expect } = require("chai")
const {
  to1e18,
  impersonateAccount,
  resetFork,
} = require("../helpers/contract-test-helpers")
const Auction = require("../../artifacts/contracts/Auction.sol/Auction.json")
const { initContracts } = require("./init-contracts")
const { bidderAddress1, bidderAddress2 } = require("./constants.js")

const describeFn =
  process.env.NODE_ENV === "system-test" ? describe : describe.skip

// This system test checks the scenario where we create a cov pool auction for a
// deposit being under liquidation. There are two bidders come into the picture,
// where the first one partially takes an offer and the second one buys the same
// deposit outside the coverage pool. Next step is notifying the risk manager
// about liquidated deposit so it can early close the auction.
// All the tests below are executed on Hardhat Network with mainnet forking enabled.
// At the start, the fork is being reset to the specific starting block which
// determines the initial test state. This test uses the real tBTC token contract
// and a deposit (https://allthekeeps.com/deposit/0x55d8b1dd88e60d12c81b5479186c15d07555db9d)
// which is ready to be liquidated at the starting block. All the bidders are also
// real accounts with actual TBTC balance. At the end of the scenario, the risk
// manager should early close the cov pool auction and keep the surplus of TBTC.
describeFn("System -- notify liquidated", () => {
  const startingBlock = 12368838
  // deposit lot size is 5 BTC
  const lotSize = to1e18(5)

  let tbtcToken
  let underwriterToken
  let assetPool
  let coveragePool
  let riskManagerV1
  let tbtcDeposit1

  let governance
  let bidder1
  let bidder2

  before(async () => {
    await resetFork(startingBlock)

    governance = await ethers.getSigner(0)

    const contracts = await initContracts("SignerBondsManualSwap")
    tbtcToken = contracts.tbtcToken
    underwriterToken = contracts.underwriterToken
    assetPool = contracts.assetPool
    signerBondsSwapStrategy = contracts.signerBondsSwapStrategy
    coveragePool = contracts.coveragePool
    riskManagerV1 = contracts.riskManagerV1
    tbtcDeposit1 = contracts.tbtcDeposit1

    await underwriterToken.transferOwnership(assetPool.address)
    await assetPool.transferOwnership(coveragePool.address)

    await coveragePool
      .connect(governance)
      .approveFirstRiskManager(riskManagerV1.address)

    bidder1 = await impersonateAccount(bidderAddress1)
    bidder2 = await impersonateAccount(bidderAddress2)
  })

  describe("when notified on liquidated auction", () => {
    let auction

    before(async () => {
      await tbtcDeposit1.notifyRedemptionSignatureTimedOut()

      await riskManagerV1.notifyLiquidation(tbtcDeposit1.address)

      const auctionAddress = await riskManagerV1.depositToAuction(
        tbtcDeposit1.address
      )
      auction = new ethers.Contract(auctionAddress, Auction.abi, bidder1)
      const bidderTake = lotSize.div(5) // 5 / 5 = 1 TBTC
      await tbtcToken.connect(bidder1).approve(auction.address, bidderTake)

      // bidder1 takes a partial offer on cov pool auction
      tx = await auction.takeOffer(bidderTake)

      await tbtcToken.connect(bidder2).approve(tbtcDeposit1.address, lotSize)
      // bidder1 buys entire deposit outside the coverage pool
      await tbtcDeposit1.connect(bidder2).purchaseSignerBondsAtAuction()

      // notifying a risk manager on deposit being purchased outside the cov pool
      await riskManagerV1.notifyLiquidated(tbtcDeposit1.address)
    })

    it("should mark a deposit as liquidated", async () => {
      expect(await tbtcDeposit1.currentState()).to.equal(11) // LIQUIDATED
    })

    it("should early close cov pool auction", async () => {
      expect(await auction.isOpen()).to.be.false
    })

    it("should collect surplus from the early closed auction", async () => {
      const tbtcSurplus = await tbtcToken.balanceOf(riskManagerV1.address)
      expect(tbtcSurplus).to.be.equal(to1e18(1))

      const tbtcSurplusTracking = await riskManagerV1.tbtcSurplus()
      expect(tbtcSurplusTracking).to.be.equal(to1e18(1))
    })

    it("should consume a reasonable amount of gas", async () => {
      await expect(parseInt(tx.gasLimit)).to.be.lessThan(180500)

      const txReceipt = await ethers.provider.getTransactionReceipt(tx.hash)
      await expect(parseInt(txReceipt.gasUsed)).to.be.lessThan(162000)
    })
  })
})
