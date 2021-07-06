const { expect } = require("chai")
const { BigNumber } = ethers
const {
  to1e18,
  impersonateAccount,
  resetFork,
  ZERO_ADDRESS,
  increaseTime,
} = require("../helpers/contract-test-helpers")
const { underwriterAddress, bidderAddress1 } = require("./constants.js")
const { initContracts, setBondAuctionThreshold } = require("./init-contracts")

const Auction = require("../../artifacts/contracts/Auction.sol/Auction.json")
const describeFn =
  process.env.NODE_ENV === "system-test" ? describe : describe.skip

// This system test scenario checks the liquidation happy path. It is meant
// to be executed on Hardhat Network with mainnet forking enabled. At the start,
// the fork is being reset to the specific starting block which determines the
// initial test state. This test uses the real tBTC token contract and a
// deposit (https://allthekeeps.com/deposit/0x55d8b1dd88e60d12c81b5479186c15d07555db9d)
// which is ready to be liquidated at the starting block. The bidder which
// takes the offer is also a real account with actual tBTC balance. At the
// end of the scenario, the risk manager should liquidate the deposit successfully,
// and 75% of the deposit's bonded amount should land on the signer bonds
// swap strategy contract.
describeFn("System -- liquidation", () => {
  const startingBlock = 12368838
  // deposit lot size is 5 BTC
  const lotSize = to1e18(5)
  // signers have bonded 290.81 ETH
  const bondedAmount = BigNumber.from("290810391624000000000")
  // deposit's auction must offer 75% of bonds to be accepted by risk manager
  const bondedAmountPercentage = BigNumber.from("75")
  // amount of collateral deposited to asset pool is 200k KEEP tokens
  const collateralAmount = to1e18(200000)
  const minCovToMint = collateralAmount

  let tbtcToken
  let collateralToken
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

    setBondAuctionThreshold(bondedAmountPercentage)
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

  describe("when auction has been fully filled", () => {
    let auction
    let tx
    let bidderInitialBalance

    before(async () => {
      await tbtcDeposit1.notifyRedemptionSignatureTimedOut()

      // The deposit's auction must offer at least 75% of bonds to be accepted
      // by the risk manager. At starting block, the deposit's auction exposes
      // 66% so an immediate `notifyLiquidation` must revert.
      await expect(
        riskManagerV1.notifyLiquidation(tbtcDeposit1.address)
      ).to.revertedWith(
        "Deposit bond auction percentage is below the threshold level"
      )

      // We need additional 9% to pass the risk manager threshold. To get this
      // part, we need 22870 seconds to elapse. This is because the auction
      // length is 86400 seconds (24h) and there is 34% of bonds remaining.
      // So, additional 9% will be offered after 9/34 * 86400s.
      await increaseTime(22870)

      await riskManagerV1.notifyLiquidation(tbtcDeposit1.address)

      const auctionAddress = await riskManagerV1.depositToAuction(
        tbtcDeposit1.address
      )
      auction = new ethers.Contract(auctionAddress, Auction.abi, bidder)
      await tbtcToken.connect(bidder).approve(auction.address, lotSize)
      bidderInitialBalance = await tbtcToken.balanceOf(bidder.address)

      // Deposit collateral tokens in the asset pool
      await collateralToken
        .connect(underwriter)
        .approve(assetPool.address, collateralAmount)
      await assetPool
        .connect(underwriter)
        .deposit(collateralAmount, minCovToMint)

      // Wait 30% of the auction length and take offer
      await increaseTime(25920)
      tx = await auction.takeOffer(lotSize)
    })

    it("should close auction", async () => {
      expect(await auction.isOpen()).to.be.false
    })

    it("should liquidate the deposit", async () => {
      // Auction bidder has spend their TBTC.
      const bidderCurrentBalance = await tbtcToken.balanceOf(bidder.address)
      expect(bidderInitialBalance.sub(bidderCurrentBalance)).to.equal(lotSize)

      // Deposit has been liquidated.
      expect(await tbtcDeposit1.currentState()).to.equal(11) // LIQUIDATED

      // The percentage of signer bonds that should be sent to the risk manager
      // contract consists of the initial 66% and a portion of the remaining 34%
      // that depends on the time passed before take offer. The percentage
      // (rounded to the whole number) is therefore equal to:
      // (66 + 34 * ((25920 + 22870)/86400)) = 85
      await expect(tx).to.changeEtherBalance(
        riskManagerV1,
        bondedAmount.mul(85).div(100)
      )
    })

    it("should transfer collateral tokens to the bidder", async () => {
      expect(await collateralToken.balanceOf(bidder.address)).to.be.closeTo(
        to1e18(60000), // 30% of the initial asset pool
        to1e18(100) // 100 KEEP tokens precision
      )
    })

    it("should adjust asset pool's collateral tokens after the claim", async () => {
      expect(await collateralToken.balanceOf(assetPool.address)).to.be.closeTo(
        to1e18(140000), // 70% of the initial asset pool
        to1e18(100) // 100 KEEP tokens precision
      )
    })

    it("should consume a reasonable amount of gas", async () => {
      await expect(parseInt(tx.gasLimit)).to.be.lessThan(518000)

      const txReceipt = await ethers.provider.getTransactionReceipt(tx.hash)
      await expect(parseInt(txReceipt.gasUsed)).to.be.lessThan(255000)
    })
  })
})
