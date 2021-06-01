const { expect } = require("chai")
const { to1e18 } = require("../helpers/contract-test-helpers")
const Auction = require("../../artifacts/contracts/Auction.sol/Auction.json")

describe("Integration", () => {
  const auctionLength = 86400 // 24h
  const lotSize = to1e18(10)
  const bondedAmount = to1e18(150)
  const collateralizationThreshold = 101

  let tbtcToken
  let signerBondsSwapStrategy
  let coveragePool
  let riskManagerV1
  let tbtcDeposit

  let bidder
  let thirdParty

  beforeEach(async () => {
    const TestToken = await ethers.getContractFactory("TestToken")
    tbtcToken = await TestToken.deploy()
    await tbtcToken.deployed()

    const SignerBondsSwapStrategy = await ethers.getContractFactory(
      "SignerBondsEscrow"
    )
    signerBondsSwapStrategy = await SignerBondsSwapStrategy.deploy()
    await signerBondsSwapStrategy.deployed()

    const Auction = await ethers.getContractFactory("Auction")

    const masterAuction = await Auction.deploy()
    await masterAuction.deployed()

    const CoveragePoolStub = await ethers.getContractFactory("CoveragePoolStub")
    coveragePool = await CoveragePoolStub.deploy()
    await coveragePool.deployed()

    const RiskManagerV1 = await ethers.getContractFactory("RiskManagerV1")
    riskManagerV1 = await RiskManagerV1.deploy(
      tbtcToken.address,
      coveragePool.address,
      signerBondsSwapStrategy.address,
      masterAuction.address,
      auctionLength,
      collateralizationThreshold
    )
    await riskManagerV1.deployed()

    const DepositStub = await ethers.getContractFactory("DepositStub")
    tbtcDeposit = await DepositStub.deploy(tbtcToken.address, lotSize)
    await tbtcDeposit.deployed()

    await ethers.getSigner(0).then((s) =>
      s.sendTransaction({
        to: tbtcDeposit.address,
        value: bondedAmount,
      })
    )

    bidder = await ethers.getSigner(1)
    thirdParty = await ethers.getSigner(2)

    await tbtcToken.mint(bidder.address, lotSize)
    await tbtcToken.mint(thirdParty.address, lotSize)
  })

  describe("when auction has been fully filled", () => {
    let auction
    let tx

    beforeEach(async () => {
      auction = await prepareAuction()
      tx = await auction.takeOffer(lotSize)
    })

    it("should close auction", async () => {
      expect(await auction.isOpen()).to.be.false
    })

    it("should liquidate the deposit", async () => {
      // Auction bidder has spend their TBTC
      expect(await tbtcToken.balanceOf(bidder.address)).to.equal(0)
      // Deposit has been liquidated
      expect(await tbtcDeposit.currentState()).to.equal(11) // LIQUIDATED
    })

    it("should swap signer bonds", async () => {
      await expect(tx).to.changeEtherBalance(riskManagerV1, 0)
      await expect(tx).to.changeEtherBalance(
        signerBondsSwapStrategy,
        bondedAmount
      )
    })
  })

  describe("when deposit has been liquidated by someone else", () => {
    let auction
    beforeEach(async () => {
      auction = await prepareAuction()
      // simulate deposit state change outside Coverage Pools
      await tbtcToken.connect(thirdParty).approve(tbtcDeposit.address, lotSize)
      await tbtcDeposit.connect(thirdParty).purchaseSignerBondsAtAuction()
    })

    it("should revert", async () => {
      await expect(auction.takeOffer(lotSize.div(2))).to.be.revertedWith(
        "Deposit liquidation is not in progress"
      )
    })
  })

  async function prepareAuction() {
    await tbtcDeposit.notifyUndercollateralizedLiquidation()
    await riskManagerV1.notifyLiquidation(tbtcDeposit.address)

    const auctionAddress = await riskManagerV1.depositToAuction(
      tbtcDeposit.address
    )
    const auction = new ethers.Contract(auctionAddress, Auction.abi, bidder)
    await tbtcToken.connect(bidder).approve(auction.address, lotSize)
    return auction
  }
})
