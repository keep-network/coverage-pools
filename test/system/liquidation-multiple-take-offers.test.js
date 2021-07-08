const { expect } = require("chai")
const { BigNumber } = ethers
const hre = require("hardhat")
const {
  to1e18,
  impersonateAccount,
  resetFork,
  ZERO_ADDRESS,
  increaseTime,
} = require("../helpers/contract-test-helpers")
const {
  underwriterAddress,
  bidderAddress1,
  bidderAddress2,
} = require("./constants.js")
const { initContracts } = require("./init-contracts")

const Auction = hre.artifacts.readArtifactSync("Auction")
const describeFn =
  process.env.NODE_ENV === "system-test" ? describe : describe.skip

// This system test scenario checks deposit liquidation with multiple partial
// fills. It is meant to be executed on Hardhat Network with mainnet forking
// enabled. At the start,  the fork is being reset to the specific starting
// block which determines the initial test state. This test uses the real tBTC
// token contract and a deposit
// (https://allthekeeps.com/deposit/0x55d8b1dd88e60d12c81b5479186c15d07555db9d)
// which is ready to be liquidated at the starting block. The auction is
// liquidated by two bidder using partial fills.
describeFn("System -- multiple partial fills", () => {
  const startingBlock = 12368838
  // deposit lot size is 5 BTC
  const lotSize = to1e18(5)
  // signers have bonded 290.81 ETH
  const bondedAmount = BigNumber.from("290810391624000000000")
  // amount of collateral deposited to asset pool is 200k KEEP tokens
  const collateralAmount = to1e18(200000)

  let tbtcToken
  let collateralToken
  let underwriterToken
  let assetPool
  let coveragePool
  let riskManagerV1
  let tbtcDeposit1

  let governance
  let underwriter
  let bidder1
  let bidder2

  before(async () => {
    await resetFork(startingBlock)

    governance = await ethers.getSigner(0)
    const contracts = await initContracts("SignerBondsManualSwap")
    tbtcToken = contracts.tbtcToken
    collateralToken = contracts.collateralToken
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

    underwriter = await impersonateAccount(underwriterAddress)
    bidder1 = await impersonateAccount(bidderAddress1)
    bidder2 = await impersonateAccount(bidderAddress2)
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

  describe("when auction has been fully filled with multiple partial fills", () => {
    let auction
    let tx
    let bidder1InitialBalance
    let bidder2InitialBalance
    let bidder2InitCollateralBalance

    before(async () => {
      await tbtcDeposit1.notifyRedemptionSignatureTimedOut()
      await riskManagerV1.notifyLiquidation(tbtcDeposit1.address)

      const auctionAddress = await riskManagerV1.depositToAuction(
        tbtcDeposit1.address
      )
      auction = new ethers.Contract(auctionAddress, Auction.abi, governance)
      await tbtcToken.connect(bidder1).approve(auction.address, to1e18(2))
      bidder1InitialBalance = await tbtcToken.balanceOf(bidder1.address)
      await tbtcToken.connect(bidder2).approve(auction.address, to1e18(3))
      bidder2InitialBalance = await tbtcToken.balanceOf(bidder2.address)
      bidder2InitCollateralBalance = await collateralToken.balanceOf(
        bidder2.address
      )

      // Deposit collateral tokens in the asset pool
      await collateralToken
        .connect(underwriter)
        .approve(assetPool.address, collateralAmount)
      await assetPool.connect(underwriter).deposit(collateralAmount)

      // Wait until the end of auction and take 40% of the deposit value with
      // bidder1 and 60% with bidder2
      await increaseTime(86400)
      await auction.connect(bidder1).takeOffer(lotSize.mul(40).div(100))
      tx = await auction.connect(bidder2).takeOffer(lotSize.mul(60).div(100))
    })

    it("should close auction", async () => {
      expect(await auction.isOpen()).to.be.false
    })

    it("should decrease the amount of TBTC for bidders", async () => {
      const bidder1CurrentBalance = await tbtcToken.balanceOf(bidder1.address)
      const bidder2CurrentBalance = await tbtcToken.balanceOf(bidder2.address)
      expect(bidder1InitialBalance.sub(bidder1CurrentBalance)).to.be.equal(
        lotSize.mul(40).div(100)
      )
      expect(bidder2InitialBalance.sub(bidder2CurrentBalance)).to.be.equal(
        lotSize.mul(60).div(100)
      )
    })

    it("should liquidate the deposit", async () => {
      expect(await tbtcDeposit1.currentState()).to.equal(11) // LIQUIDATED
    })

    it("should transfer ether from signer bonds to risk manager", async () => {
      await expect(tx).to.changeEtherBalance(riskManagerV1, bondedAmount)
    })

    it("should transfer collateral tokens to bidder1", async () => {
      expect(await collateralToken.balanceOf(bidder1.address)).to.be.equal(
        to1e18(80000) // 40% of the asset pool
      )
    })

    it("should transfer collateral tokens to bidder2", async () => {
      const currentCollateralBalance = await collateralToken.balanceOf(
        bidder2.address
      )
      expect(
        // bidder2 already had KEEP tokens
        currentCollateralBalance.sub(bidder2InitCollateralBalance)
      ).to.be.equal(
        to1e18(120000) // 60% of the asset pool
      )
    })

    it("should remove all collateral tokens from asset pool", async () => {
      expect(await collateralToken.balanceOf(assetPool.address)).to.be.equal(0)
    })

    it("should consume a reasonable amount of gas", async () => {
      expect(parseInt(tx.gasLimit)).to.be.lessThan(370000)

      const txReceipt = await ethers.provider.getTransactionReceipt(tx.hash)
      expect(parseInt(txReceipt.gasUsed)).to.be.lessThan(181000)
    })
  })
})
