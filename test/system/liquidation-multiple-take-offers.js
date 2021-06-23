const { expect } = require("chai")
const { to1e18, increaseTime } = require("../helpers/contract-test-helpers")
const { deployMockContract } = require("@ethereum-waffle/mock-contract")
const Auction = require("../../artifacts/contracts/Auction.sol/Auction.json")
const ITBTCDepositToken = require("../../artifacts/contracts/RiskManagerV1.sol/ITBTCDepositToken.json")

describe("System -- multiple partial fills", () => {
  const auctionLength = 86400 // 24h
  const lotSize = to1e18(10)
  const bondedAmount = to1e18(150)
  const bondAuctionThreshold = 100

  let tbtcToken
  let collateralToken
  let underwriterToken
  let signerBondsSwapStrategy
  let assetPool
  let coveragePool
  let riskManagerV1
  let tbtcDeposit

  let owner
  let bidder
  let otherBidder
  let rewardsManager

  beforeEach(async () => {
    owner = await ethers.getSigner(0)
    bidder = await ethers.getSigner(1)
    otherBidder = await ethers.getSigner(2)
    rewardsManager = await ethers.getSigner(4)

    const TestToken = await ethers.getContractFactory("TestToken")
    tbtcToken = await TestToken.deploy()
    await tbtcToken.deployed()

    collateralToken = await TestToken.deploy()
    await collateralToken.deployed()

    // For brevity, use a mock tBTC deposit token contract and simulate
    // all deposits are legit.
    const mockTbtcDepositToken = await deployMockContract(
      owner,
      ITBTCDepositToken.abi
    )
    await mockTbtcDepositToken.mock.exists.returns(true)

    const SignerBondsSwapStrategy = await ethers.getContractFactory(
      "SignerBondsManualSwap"
    )
    signerBondsSwapStrategy = await SignerBondsSwapStrategy.deploy()
    await signerBondsSwapStrategy.deployed()

    const UnderwriterToken = await ethers.getContractFactory("UnderwriterToken")
    underwriterToken = await UnderwriterToken.deploy("Coverage KEEP", "covKEEP")
    await underwriterToken.deployed()

    const AssetPool = await ethers.getContractFactory("AssetPool")
    assetPool = await AssetPool.deploy(
      collateralToken.address,
      underwriterToken.address,
      rewardsManager.address
    )
    await assetPool.deployed()

    const CoveragePool = await ethers.getContractFactory("CoveragePool")
    coveragePool = await CoveragePool.deploy(assetPool.address)
    await coveragePool.deployed()
    await assetPool.transferOwnership(coveragePool.address)

    const Auction = await ethers.getContractFactory("Auction")

    const masterAuction = await Auction.deploy()
    await masterAuction.deployed()

    const RiskManagerV1 = await ethers.getContractFactory("RiskManagerV1")
    riskManagerV1 = await RiskManagerV1.deploy(
      tbtcToken.address,
      mockTbtcDepositToken.address,
      coveragePool.address,
      signerBondsSwapStrategy.address,
      masterAuction.address,
      auctionLength,
      bondAuctionThreshold
    )
    await riskManagerV1.deployed()
    await coveragePool.approveFirstRiskManager(riskManagerV1.address)

    const DepositStub = await ethers.getContractFactory("DepositStub")
    tbtcDeposit = await DepositStub.deploy(tbtcToken.address, lotSize)
    await tbtcDeposit.deployed()
    await tbtcDeposit.setAuctionValue(bondedAmount)

    await owner.sendTransaction({
      to: tbtcDeposit.address,
      value: bondedAmount,
    })

    await tbtcToken.mint(bidder.address, lotSize)
    await tbtcToken.mint(otherBidder.address, lotSize)
    await collateralToken.mint(assetPool.address, to1e18(100))
  })

  describe("when auction fully filled with multiple take offers", () => {
    let auction
    let tx

    beforeEach(async () => {
      auction = await prepareAuction()
      increaseTime(auctionLength)
      await auction.connect(bidder).takeOffer(lotSize.mul(40).div(100))
      tx = await auction
        .connect(otherBidder)
        .takeOffer(lotSize.mul(60).div(100))
    })

    it("should transfer collateral tokens to bidders", async () => {
      expect(await collateralToken.balanceOf(bidder.address)).to.be.equal(
        to1e18(40)
      )
      expect(await collateralToken.balanceOf(otherBidder.address)).to.be.equal(
        to1e18(60)
      )
      expect(await collateralToken.balanceOf(assetPool.address)).to.be.equal(0)
    })

    it("should close auction", async () => {
      expect(await auction.isOpen()).to.be.false
    })

    it("should liquidate the deposit", async () => {
      // Auction bidder has spend 40% of their tBTC, so 60% remains
      expect(await tbtcToken.balanceOf(bidder.address)).to.equal(
        lotSize.mul(60).div(100)
      )

      // Other auction bidder has spend 60% of their tBTC, so 40% remains
      expect(await tbtcToken.balanceOf(otherBidder.address)).to.equal(
        lotSize.mul(40).div(100)
      )

      // Deposit has been liquidated
      expect(await tbtcDeposit.currentState()).to.equal(11) // LIQUIDATED
    })

    it("should swap signer bonds", async () => {
      await expect(tx).to.changeEtherBalance(signerBondsSwapStrategy, 0)
      await expect(tx).to.changeEtherBalance(riskManagerV1, bondedAmount)
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
    await tbtcToken.connect(otherBidder).approve(auction.address, lotSize)
    return auction
  }
})
