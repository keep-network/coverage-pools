const { expect } = require("chai")
const {
  to1e18,
  impersonateAccount,
  resetFork,
  ZERO_ADDRESS,
  increaseTime,
} = require("../helpers/contract-test-helpers")
const Auction = require("../../artifacts/contracts/Auction.sol/Auction.json")

const describeFn =
  process.env.NODE_ENV === "system-test" ? describe : describe.skip

// This system test scenario checks the behaviour of an auction for a tBTC
// deposit liquidation. It focuses on timing of taking offer for that auction.
// It is meant to be executed on Hardhat Network with mainnet forking enabled.
// At the start, the fork is being reset to the specific starting block which
// determines the initial test state. This test uses the real tBTC token contract
// and a deposit (https://allthekeeps.com/deposit/0x55d8b1dd88e60d12c81b5479186c15d07555db9d)
// which is ready to be liquidated at the starting block.

// The bidder which
// takes the offer is also a real account with actual tBTC balance. At the
// end of the scenario, the risk manager should liquidate the deposit successfully,
// and 75% of the deposit's bonded amount should land on the signer bonds
// swap strategy contract.
describeFn("System -- liquidation after auction length elapsed", () => {
  const startingBlock = 12368838
  const tbtcTokenAddress = "0x8daebade922df735c38c80c7ebd708af50815faa"
  const depositAddress = "0x55d8b1dd88e60d12c81b5479186c15d07555db9d"
  const bidderAddress = "0xa0216ED2202459068a750bDf74063f677613DA34"
  const keepTokenAddress = "0x85Eee30c52B0b379b046Fb0F85F4f3Dc3009aFEC"
  const underwriterAddress = "0x049b687070ccb1c6e68f77b988f461bca6dfe80f"
  const tbtcDepositTokenAddress = "0x10b66bd1e3b5a936b7f8dbc5976004311037cdf0"
  const auctionLength = 24 * 3600 // 24h
  // Only deposits with at least 75% of bonds offered on bond auction will be
  // accepted by the risk manager.
  const bondAuctionThreshold = 75
  // deposit lot size is 5 BTC
  const lotSize = to1e18(5)

  let tbtcToken
  let collateralToken
  let underwriterToken
  let assetPool
  let signerBondsSwapStrategy
  let coveragePool
  let riskManagerV1
  let tbtcDeposit

  let governance
  let rewardsManager
  let bidder
  let underwriter

  before(async () => {
    await resetFork(startingBlock)

    governance = await ethers.getSigner(0)
    rewardsManager = await ethers.getSigner(1)

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
      bondAuctionThreshold
    )
    await riskManagerV1.deployed()

    await coveragePool
      .connect(governance)
      .beginRiskManagerApproval(riskManagerV1.address)
    await increaseTime(30 * 24 * 3600) // +30 days
    await coveragePool
      .connect(governance)
      .finalizeRiskManagerApproval(riskManagerV1.address)

    tbtcDeposit = await ethers.getContractAt("IDeposit", depositAddress)

    bidder = await impersonateAccount(bidderAddress)
    underwriter = await impersonateAccount(underwriterAddress)

    collateralToken = await ethers.getContractAt("IERC20", keepTokenAddress)
  })

  describe("test initial state", () => {
    describe("deposit", () => {
      it("should be in active state", async () => {
        expect(await tbtcDeposit.currentState()).to.equal(5) // Active
      })
    })

    describe("auction", () => {
      it("should not exist", async () => {
        const auctionAddress = await riskManagerV1.depositToAuction(
          tbtcDeposit.address
        )
        expect(auctionAddress).to.be.equal(ZERO_ADDRESS)
      })
    })
  })

  describe("when auction length has elapsed", () => {
    let auction
    let tx
    let bidderInitialBalance

    before(async () => {
      // Prepare auction for a tBTC deposit
      await tbtcDeposit.notifyRedemptionSignatureTimedOut()
      await increaseTime(22870)
      await riskManagerV1.notifyLiquidation(tbtcDeposit.address)
      const auctionAddress = await riskManagerV1.depositToAuction(
        tbtcDeposit.address
      )
      auction = new ethers.Contract(auctionAddress, Auction.abi, bidder)
      await tbtcToken.connect(bidder).approve(auction.address, lotSize)
      bidderInitialBalance = await tbtcToken.balanceOf(bidder.address)

      // Add collateral tokens (KEEP tokens) to the asset pool
      await collateralToken
        .connect(underwriter)
        .approve(assetPool.address, to1e18(300))
      await assetPool.connect(underwriter).deposit(to1e18(300))

      // Wait for the auction to end and take offer
      await increaseTime(auctionLength)
      tx = await auction.connect(bidder).takeOffer(lotSize)
    })

    it("should close auction", async () => {
      expect(await auction.isOpen()).to.be.false
    })

    it("should liquidate the deposit", async () => {
      // Auction bidder has spend their TBTC.
      const bidderCurrentBalance = await tbtcToken.balanceOf(bidder.address)
      expect(bidderInitialBalance.sub(bidderCurrentBalance)).to.equal(lotSize)

      // Deposit has been liquidated.
      expect(await tbtcDeposit.currentState()).to.equal(11) // LIQUIDATED
    })

    it("should transfer all collateral tokens from asset pool to the bidder", async () => {
      expect(await collateralToken.balanceOf(assetPool.address)).to.be.equal(0)
      expect(await collateralToken.balanceOf(bidder.address)).to.be.equal(
        to1e18(300)
      )
    })

    it("should consume a reasonable amount of gas", async () => {
      await expect(parseInt(tx.gasLimit)).to.be.lessThan(485000)

      const txReceipt = await ethers.provider.getTransactionReceipt(tx.hash)
      await expect(parseInt(txReceipt.gasUsed)).to.be.lessThan(240000)
    })
  })
})
