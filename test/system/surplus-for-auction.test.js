const { expect } = require("chai")
const {
  to1e18,
  impersonateAccount,
  resetFork,
  to1ePrecision,
  ZERO_ADDRESS,
} = require("../helpers/contract-test-helpers")
const Auction = require("../../artifacts/contracts/Auction.sol/Auction.json")

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
// deposit 0x849.. outside the coverage pool. Next step is notifying the risk manager
// about liquidated deposit 0x849.. so it can early close the opened auction. The
// second deposit 0xfc9.. is bought with surplus TBTC from the auction that put
// on offer deposit 0x849.. A new auction for deposit 0xfc9.. will not be opened.
// At the end of the scenario, the risk manager should keep the surplus of TBTC
// for potential next deposit buy outs.

describeFn("System -- buying a deposit with surplus", () => {
  const startingBlock = 11536431
  const tbtcTokenAddress = "0x8daebade922df735c38c80c7ebd708af50815faa"
  const depositAddress = "0x8495732aecd7f132eaab61f64858ccc73475973f"
  const depositAddress1 = "0xfc9c50fd44879bd7085edd311bc8e2b7d3e41595"
  const bidderAddress = "0xa0216ED2202459068a750bDf74063f677613DA34" // 12.36 TBTC
  const bidderAddress1 = "0xf9e11762d522ea29dd78178c9baf83b7b093aacc" // 10.29 TBTC
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
  let tbtcDeposit1

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
    tbtcDeposit1 = await ethers.getContractAt("IDeposit", depositAddress1)

    bidder = await impersonateAccount(bidderAddress)
    bidder1 = await impersonateAccount(bidderAddress1)
  })

  describe("when bying auction with surplus TBTC funds", () => {
    let surplusTx

    before(async () => {
      await riskManagerV1.notifyLiquidation(tbtcDeposit.address)

      const auctionAddress = await riskManagerV1.depositToAuction(
        tbtcDeposit.address
      )

      const auction = new ethers.Contract(auctionAddress, Auction.abi, bidder)
      const bidderTake = lotSize.div(2) // 5 / 2 = 2.5 TBTC
      await tbtcToken.connect(bidder).approve(auction.address, bidderTake)

      // bidder takes a partial offer on a cov pool auction
      await auction.takeOffer(bidderTake)
    })

    it("should have TBTC funds for partially selling an auction for deposit 0x849..", async () => {
      const tbtcSurplus = await tbtcToken.balanceOf(riskManagerV1.address)
      expect(tbtcSurplus).to.be.equal(lotSize.div(2))
    })

    it("should buy deposit 0x849.. outside the coverage pool", async () => {
      await tbtcToken.connect(bidder1).approve(tbtcDeposit.address, lotSize)
      // buying 0x849.. deposit outside the coverage pool
      await tbtcDeposit.connect(bidder1).purchaseSignerBondsAtAuction()

      await riskManagerV1.notifyLiquidated(tbtcDeposit.address)

      expect(await tbtcDeposit.currentState()).to.equal(11) // LIQUIDATED
    })

    it("should buy deposit 0xfc9.. with surplus TBTC without opening an auction", async () => {
      expect(await tbtcDeposit1.currentState()).to.equal(10) // IN LIQUIDATION

      // Deposit 0x849.. was bought outside the cov pool but after it took a
      // partial offer in cov pool. 2.5 TBTC left on Risk Manager and this auction
      // is on offer for 1 TBTC so it should be sufficient to buy it out.
      surplusTx = await riskManagerV1.notifyLiquidation(tbtcDeposit1.address, {
        gasLimit: 350000,
      })

      // Risk Manager should not open a new auction for tbtcDeposit1.
      const auctionAddress = await riskManagerV1.depositToAuction(
        tbtcDeposit1.address
      )
      expect(auctionAddress).to.equal(ZERO_ADDRESS)

      // 1.5 TBTC should be left on Risk Manager after puchasing 0xfc9..
      // deposit with surplus funds
      const tbtcSurplus = await tbtcToken.balanceOf(riskManagerV1.address)
      expect(tbtcSurplus).to.be.equal(to1ePrecision(15, 17))
    })

    it("should consume a reasonable amount of gas", async () => {
      await expect(parseInt(surplusTx.gasLimit)).to.be.equal(350000)

      const txReceipt = await ethers.provider.getTransactionReceipt(
        surplusTx.hash
      )
      await expect(parseInt(txReceipt.gasUsed)).to.be.lessThan(290000)
    })
  })
})
