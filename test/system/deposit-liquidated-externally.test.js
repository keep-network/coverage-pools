const { expect } = require("chai")
const {
  to1e18,
  impersonateAccount,
  resetFork,
  ZERO_ADDRESS,
} = require("../helpers/contract-test-helpers")
const Auction = require("../../artifacts/contracts/Auction.sol/Auction.json")
const { initContracts, setBondAuctionThreshold } = require("./init-contracts")
const { bidderAddress1 } = require("./constants.js")

const describeFn =
  process.env.NODE_ENV === "system-test" ? describe : describe.skip

// This system test scenario checks the behaviour of Coverage Pools when the
// deposit on auction has been liquidated outside Coverage Pools. It is meant
// to be executed on Hardhat Network with mainnet forking enabled.
// At the start, the fork is being reset to the specific starting block which
// determines the initial test state. This test uses real mainnet contracts.
// There are two test cases: one for the auction partially filled and one for
// the auction fully filled. In both cases there is an attempt to take offer on
// an auction with an invalid state deposit, because the deposit has been
// liquidated between auction creating and taking offer. In both cases the
// transaction should be reverted
describeFn("System -- deposit liquidated outside Coverage Pools", () => {
  const startingBlock = 12368838
  // deposit lot size is 5 BTC
  const lotSize = to1e18(5)
  // Set to 66% as TBTC will offer 66,6667% of signer bonds after auction opening
  const bondAuctionThreshold = 66

  let tbtcToken
  let underwriterToken
  let assetPool
  let coveragePool
  let riskManagerV1
  let tbtcDeposit1

  let governance
  let bidder

  before(async () => {
    await resetFork(startingBlock)

    governance = await ethers.getSigner(0)

    setBondAuctionThreshold(bondAuctionThreshold)
    const contracts = await initContracts("SignerBondsManualSwap")
    tbtcToken = contracts.tbtcToken
    underwriterToken = contracts.underwriterToken
    assetPool = contracts.assetPool
    signerBondsSwapStrategy = contracts.signerBondsSwapStrategy
    coveragePool = contracts.coveragePool
    riskManagerV1 = contracts.riskManagerV1
    tbtcDeposit1 = contracts.tbtcDeposit1

    rewardsManager = await ethers.getSigner(1)

    await underwriterToken.transferOwnership(assetPool.address)
    await assetPool.transferOwnership(coveragePool.address)

    await coveragePool
      .connect(governance)
      .approveFirstRiskManager(riskManagerV1.address)

    bidder = await impersonateAccount(bidderAddress1)
  })

  describe("test initial state", () => {
    describe("deposit", () => {
      it("should be in active state", async () => {
        expect(await tbtcDeposit1.currentState()).to.equal(5) // Active
      })
    })

    describe("auction", () => {
      it("should not exist", async () => {
        const auctionAddress = await riskManagerV1.depositToAuction(
          tbtcDeposit1.address
        )
        expect(auctionAddress).to.be.equal(ZERO_ADDRESS)
      })
    })
  })

  describe("when deposit has been liquidated outside Coverage Pools", () => {
    let auction

    before(async () => {
      await tbtcDeposit1.notifyRedemptionSignatureTimedOut()
      await riskManagerV1.notifyLiquidation(tbtcDeposit1.address)

      const auctionAddress = await riskManagerV1.depositToAuction(
        tbtcDeposit1.address
      )
      auction = new ethers.Contract(auctionAddress, Auction.abi, bidder)
      await tbtcToken.connect(bidder).approve(auction.address, lotSize)

      // Simulate purchase of signer bonds outside Coverage Pools
      await tbtcToken.connect(bidder).approve(tbtcDeposit1.address, lotSize)
      await tbtcDeposit1.connect(bidder).purchaseSignerBondsAtAuction()
    })

    it("should revert on auction partially filled", async () => {
      await expect(auction.takeOffer(lotSize.div(2))).to.be.revertedWith(
        "Deposit liquidation is not in progress"
      )
    })

    it("should revert on auction fully filled", async () => {
      await expect(auction.takeOffer(lotSize)).to.be.revertedWith(
        "Deposit liquidation is not in progress"
      )
    })
  })
})
