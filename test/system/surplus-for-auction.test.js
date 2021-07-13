const { expect } = require("chai")
const hre = require("hardhat")
const {
  to1e18,
  impersonateAccount,
  resetFork,
  to1ePrecision,
  ZERO_ADDRESS,
} = require("../helpers/contract-test-helpers")
const Auction = hre.artifacts.readArtifactSync("Auction")
const { initContracts } = require("./init-contracts")
const { bidderAddress1, bidderAddress2 } = require("./constants.js")

const describeFn =
  process.env.NODE_ENV === "system-test" ? describe : describe.skip

// All the tests below are executed on Hardhat Network with mainnet forking enabled.
// At the start, the fork is being reset to the specific starting block which
// determines the initial test state. These tests use the real tBTC token contract
// and two deposits:
// https://allthekeeps.com/deposit/0x8495732aecd7f132eaab61f64858ccc73475973f 5 TBTC
// https://allthekeeps.com/deposit/0xfc9c50fd44879bd7085edd311bc8e2b7d3e41595 1 TBTC
// which are ready to be liquidated at the starting block. All the bidders are also
// real accounts with actual TBTC balance.
//
// These system tests check a scenario where we create a cov pool auction for the
// deposits being under liquidation. There are two bidders come into the picture,
// where the first one partially takes an offer and the second one buys the same
// deposit2 outside the coverage pool. Next step is notifying the risk manager
// about liquidated deposit2 so it can early close the opened auction. The
// second deposit3 is bought with surplus TBTC from the auction that put
// on offer deposit2. A new auction for deposit3 will not be opened.
// At the end of the scenario, the risk manager should keep the surplus of TBTC
// for potential next deposit buy outs.

describeFn("System -- buying a deposit with surplus", () => {
  const startingBlock = 11536431
  // deposit lot size is 5 BTC
  const lotSize = to1e18(5)

  let tbtcToken
  let underwriterToken
  let assetPool
  let coveragePool
  let riskManagerV1
  let tbtcDeposit2
  let tbtcDeposit3

  let governance
  let bidder1
  let bidder2

  before(async () => {
    await resetFork(startingBlock)
    governance = await ethers.getSigner(0)
    rewardsManager = await ethers.getSigner(1)

    const contracts = await initContracts("SignerBondsManualSwap")
    tbtcToken = contracts.tbtcToken
    underwriterToken = contracts.underwriterToken
    assetPool = contracts.assetPool
    signerBondsSwapStrategy = contracts.signerBondsSwapStrategy
    coveragePool = contracts.coveragePool
    riskManagerV1 = contracts.riskManagerV1
    tbtcDeposit2 = contracts.tbtcDeposit2
    tbtcDeposit3 = contracts.tbtcDeposit3

    await underwriterToken.transferOwnership(assetPool.address)
    await assetPool.transferOwnership(coveragePool.address)

    await coveragePool
      .connect(governance)
      .approveFirstRiskManager(riskManagerV1.address)

    bidder1 = await impersonateAccount(bidderAddress1)
    bidder2 = await impersonateAccount(bidderAddress2)
  })

  describe("test initial state", () => {
    describe("deposits", () => {
      it("should be in liquidation states", async () => {
        expect(await tbtcDeposit2.currentState()).to.equal(10) // IN LIQUIDATION
        expect(await tbtcDeposit3.currentState()).to.equal(10) // IN LIQUIDATION
      })
    })

    describe("auctions", () => {
      it("should not exist", async () => {
        const auctionAddress2 = await riskManagerV1.depositToAuction(
          tbtcDeposit2.address
        )
        const auctionAddress3 = await riskManagerV1.depositToAuction(
          tbtcDeposit3.address
        )
        expect(auctionAddress2).to.be.equal(ZERO_ADDRESS)
        expect(auctionAddress3).to.be.equal(ZERO_ADDRESS)
      })
    })
  })

  describe("when buying auction with surplus TBTC funds", () => {
    let surplusTx
    let auction

    before(async () => {
      // create auction for deposit2
      await riskManagerV1.notifyLiquidation(tbtcDeposit2.address)

      const auctionAddress = await riskManagerV1.depositToAuction(
        tbtcDeposit2.address
      )
      // auction for deposit2
      auction = new ethers.Contract(auctionAddress, Auction.abi, governance)

      const bidder1Take = lotSize.div(2) // 5 / 2 = 2.5 TBTC
      await tbtcToken.connect(bidder1).approve(auction.address, bidder1Take)
      // bidder1 takes partial offer on a cov pool auction
      await auction.connect(bidder1).takeOffer(bidder1Take)

      await tbtcToken.connect(bidder2).approve(tbtcDeposit2.address, lotSize)
      // bidder2 buys deposit2 outside the coverage pool
      await tbtcDeposit2.connect(bidder2).purchaseSignerBondsAtAuction()
    })

    it("should set deposit2 status as liquidated", async () => {
      expect(await tbtcDeposit2.currentState()).to.equal(11) // LIQUIDATED
    })

    it("should revert on liquidated auction with partial offer", async () => {
      const bidder1Take = lotSize.div(5) // 5 / 5 = 1 TBTC
      await tbtcToken.connect(bidder1).approve(auction.address, bidder1Take)
      await expect(
        auction.connect(bidder1).takeOffer(bidder1Take)
      ).to.be.revertedWith("Deposit liquidation is not in progress")
    })

    it("should revert on liquidated auction with full offer", async () => {
      await tbtcToken.connect(bidder1).approve(auction.address, lotSize)
      await expect(
        auction.connect(bidder1).takeOffer(lotSize)
      ).to.be.revertedWith("Deposit liquidation is not in progress")
    })

    it("should have TBTC funds on RiskManagerV1 for partially selling an auction for deposit2", async () => {
      const tbtcSurplus = await tbtcToken.balanceOf(riskManagerV1.address)
      expect(tbtcSurplus).to.be.equal(lotSize.div(2))
    })

    it("should not release surplus without notifying on liquidated deposit2", async () => {
      const tbtcSurplusTracking = await riskManagerV1.tbtcSurplus()
      expect(tbtcSurplusTracking).to.be.equal(0) // notifyLiquidated() was not called yet
    })

    it("should notify on liquidated deposit2 and release surplus", async () => {
      await riskManagerV1.notifyLiquidated(tbtcDeposit2.address)

      const tbtcSurplusTracking = await riskManagerV1.tbtcSurplus()
      expect(tbtcSurplusTracking).to.be.equal(lotSize.div(2)) // notifyLiquidated() was called
    })

    it("should early close cov pool auction for deposit2", async () => {
      expect(await auction.isOpen()).to.be.false
    })

    it("should buy deposit3 with surplus TBTC without opening an auction", async () => {
      // Deposit2 was bought outside the cov pool but after it took a
      // partial offer in cov pool. 2.5 TBTC left on Risk Manager and this auction
      // is on offer for 1 TBTC so it should be sufficient to buy it out.
      surplusTx = await riskManagerV1.notifyLiquidation(tbtcDeposit3.address, {
        gasLimit: 360000,
      })

      // Risk Manager should not open a new auction for tbtcDeposit3.
      const auctionAddress = await riskManagerV1.depositToAuction(
        tbtcDeposit3.address
      )
      expect(auctionAddress).to.equal(ZERO_ADDRESS)

      // 1.5 TBTC should be left on Risk Manager after purchasing
      // deposit3 with surplus funds
      const tbtcSurplus = await tbtcToken.balanceOf(riskManagerV1.address)
      expect(tbtcSurplus).to.be.equal(to1ePrecision(15, 17))

      const tbtcSurplusTracking = await riskManagerV1.tbtcSurplus()
      expect(tbtcSurplusTracking).to.be.equal(to1ePrecision(15, 17))
    })

    it("should set deposit3 status as liquidated", async () => {
      expect(await tbtcDeposit3.currentState()).to.equal(11) // LIQUIDATED
    })

    it("should consume a reasonable amount of gas", async () => {
      await expect(parseInt(surplusTx.gasLimit)).to.be.equal(360000)

      const txReceipt = await ethers.provider.getTransactionReceipt(
        surplusTx.hash
      )
      await expect(parseInt(txReceipt.gasUsed)).to.be.lessThan(302000)
    })
  })
})
