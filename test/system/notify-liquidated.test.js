const { expect } = require("chai")
const {
  to1e18,
  impersonateAccount,
  resetFork,
  increaseTime,
} = require("../helpers/contract-test-helpers")
const Auction = require("../../artifacts/contracts/Auction.sol/Auction.json")

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
  const tbtcTokenAddress = "0x8daebade922df735c38c80c7ebd708af50815faa"
  const depositAddress = "0x55d8b1dd88e60d12c81b5479186c15d07555db9d"
  const bidderAddress = "0xa0216ED2202459068a750bDf74063f677613DA34"
  const bidderAddress1 = "0xf9e11762d522ea29dd78178c9baf83b7b093aacc"
  const keepTokenAddress = "0x85Eee30c52B0b379b046Fb0F85F4f3Dc3009aFEC"
  const tbtcDepositTokenAddress = "0x10b66bd1e3b5a936b7f8dbc5976004311037cdf0"
  const auctionLength = 86400 // 24h
  // Only deposits with at least 75% of bonds offered on bond auction will be
  // accepted by the risk manager.
  const bondAuctionThreshold = 75
  // deposit lot size is 5 BTC
  const lotSize = to1e18(5)

  let tbtcToken
  let underwriterToken
  let assetPool
  let signerBondsSwapStrategy
  let coveragePool
  let riskManagerV1
  let tbtcDeposit

  let governance
  let rewardsManager
  let bidder
  let bidder1

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
      .approveFirstRiskManager(riskManagerV1.address)

    tbtcDeposit = await ethers.getContractAt("IDeposit", depositAddress)

    bidder = await impersonateAccount(bidderAddress)
    bidder1 = await impersonateAccount(bidderAddress1)
  })

  describe("when notified on liquidated auction", () => {
    let auction

    before(async () => {
      await tbtcDeposit.notifyRedemptionSignatureTimedOut()

      // The deposit's auction must offer at least 75% of bonds to be accepted
      // by the risk manager. At starting block, the deposit's auction exposes
      // 66% we need an additional 9% to pass the risk manager threshold. To get
      // this part, we need 22870 seconds to elapse. This is because the auction
      // length is 86400 seconds (24h) and there is 34% of bonds remaining.
      // So, additional 9% will be offered after 9/34 * 86400s.
      await increaseTime(22870)

      await riskManagerV1.notifyLiquidation(tbtcDeposit.address)

      const auctionAddress = await riskManagerV1.depositToAuction(
        tbtcDeposit.address
      )
      auction = new ethers.Contract(auctionAddress, Auction.abi, bidder)
      const bidderTake = lotSize.div(5) // 5 / 5 = 1 TBTC
      await tbtcToken.connect(bidder).approve(auction.address, bidderTake)

      // bidder takes a partial offer on cov pool auction
      tx = await auction.takeOffer(bidderTake)

      await tbtcToken.connect(bidder1).approve(tbtcDeposit.address, lotSize)
      // bidder 1 buys entire deposit outside the coverage pool
      await tbtcDeposit.connect(bidder1).purchaseSignerBondsAtAuction()

      // notifying a risk manager on deposit being purchased outside the cov pool
      await riskManagerV1.notifyLiquidated(tbtcDeposit.address)
    })

    it("should mark a deposit as liquidated", async () => {
      expect(await tbtcDeposit.currentState()).to.equal(11) // LIQUIDATED
    })

    it("should early close cov pool auction", async () => {
      expect(await auction.isOpen()).to.be.false
    })

    it("should collect surplus from the early closed auction", async () => {
      const tbtcSurplus = await tbtcToken.balanceOf(riskManagerV1.address)
      expect(tbtcSurplus).to.be.equal(to1e18(1))
    })

    it("should consume a reasonable amount of gas", async () => {
      await expect(parseInt(tx.gasLimit)).to.be.lessThan(180000)

      const txReceipt = await ethers.provider.getTransactionReceipt(tx.hash)
      await expect(parseInt(txReceipt.gasUsed)).to.be.lessThan(160000)
    })
  })
})
