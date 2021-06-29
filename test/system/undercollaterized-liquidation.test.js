const { expect } = require("chai")
const {
  to1e18,
  impersonateAccount,
  resetFork,
  ZERO_ADDRESS,
  increaseTime,
} = require("../helpers/contract-test-helpers")
const { underwriterAddress, bidderAddress1 } = require("./constants.js")
const { initContracts } = require("./init-contracts")

const Auction = require("../../artifacts/contracts/Auction.sol/Auction.json")
const { BigNumber } = ethers
const describeFn =
  process.env.NODE_ENV === "system-test" ? describe : describe.skip

// This system test scenario checks whether an undercollateralized deposit can
// be liquidated via cov pools. It is meant to be executed on Hardhat Network
// with mainnet forking enabled. At the start, the fork is being reset to the
// specific starting block which determines the initial test state.
// This test uses the real tBTC token contract and a deposit
// (https://allthekeeps.com/deposit/0xfc9c50fd44879bd7085edd311bc8e2b7d3e41595)
// which is ready to be liquidated at the starting block (11534259 is the first
// block the deposit has status LIQUIDATION_IN_PROGRESS). The deposit's
// liquidation began due to courtesy call expiration.
// The bidder which takes the offer is also a real account with actual tBTC
// balance. At the end of the scenario, the risk manager should liquidate the
// deposit successfully, and 76% of the deposit's bonded amount should land on
// the signer bonds swap strategy contract.
describeFn("System -- liquidation of undercollaterized deposit", () => {
  // The first block tbtcDeposit3 changed status to LIQUIDATION_IN_PROGRESS
  const startingBlock = 11534259
  // deposit lot size is 1 BTC
  const lotSize = to1e18(1)
  // signers have bonded 52.11 ETH
  const bondedAmount = BigNumber.from("52106853788100000000")
  // amount of collateral deposited to asset pool is 200k KEEP tokens
  const collateralAmount = to1e18(200000)

  let tbtcToken
  let collateralToken
  let underwriterToken
  let assetPool
  let coveragePool
  let riskManagerV1
  let tbtcDeposit3

  let governance
  let bidder

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
    tbtcDeposit3 = contracts.tbtcDeposit3

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
        expect(await tbtcDeposit3.currentState()).to.equal(10) // LIQUIDATION_IN_PROGRESS
      })
    })

    describe("auction", () => {
      it("should not exist", async () => {
        const auctionAddress = await riskManagerV1.depositToAuction(
          tbtcDeposit3.address
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
      // Liquidation is in progress
      await riskManagerV1.notifyLiquidation(tbtcDeposit3.address)

      const auctionAddress = await riskManagerV1.depositToAuction(
        tbtcDeposit3.address
      )
      auction = new ethers.Contract(auctionAddress, Auction.abi, bidder)
      await tbtcToken.connect(bidder).approve(auction.address, lotSize)
      bidderInitialBalance = await tbtcToken.balanceOf(bidder.address)

      // Deposit collateral tokens in the asset pool
      await collateralToken
        .connect(underwriter)
        .approve(assetPool.address, collateralAmount)
      await assetPool.connect(underwriter).deposit(collateralAmount)

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
      expect(await tbtcDeposit3.currentState()).to.equal(11) // LIQUIDATED

      // The percentage of signer bonds that should be sent to the risk manager
      // contract consists of the initial 66% and a portion of the remaining 34%
      // that depends on the time passed before take offer. The percentage
      // (rounded to the whole number) is therefore equal to:
      // (66 + 34 * (25920/86400)) = 76
      await expect(tx).to.changeEtherBalance(
        riskManagerV1,
        bondedAmount.mul(76).div(100)
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
      expect(parseInt(tx.gasLimit)).to.be.lessThan(518000)

      const txReceipt = await ethers.provider.getTransactionReceipt(tx.hash)
      expect(parseInt(txReceipt.gasUsed)).to.be.lessThan(255000)
    })
  })
})
