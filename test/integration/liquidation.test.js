const { expect } = require("chai")
const { to1e18 } = require("../helpers/contract-test-helpers")
const { deployMockContract } = require("@ethereum-waffle/mock-contract")
const Auction = require("../../artifacts/contracts/Auction.sol/Auction.json")
const ITBTCDepositToken = require("../../artifacts/contracts/RiskManagerV1.sol/ITBTCDepositToken.json")

describe("Integration -- liquidation", () => {
  const auctionLength = 86400 // 24h
  const lotSize = to1e18(10)
  const bondedAmount = to1e18(150)
  const bondAuctionThreshold = 100
  const notifierReward = to1e18(5)

  let tbtcToken
  let signerBondsSwapStrategy
  let coveragePool
  let riskManagerV1
  let tbtcDeposit1

  let owner
  let bidder
  let thirdParty

  beforeEach(async () => {
    owner = await ethers.getSigner(0)
    bidder = await ethers.getSigner(1)
    thirdParty = await ethers.getSigner(2)

    const TestToken = await ethers.getContractFactory("TestToken")
    tbtcToken = await TestToken.deploy()
    await tbtcToken.deployed()

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

    const Auction = await ethers.getContractFactory("Auction")

    const masterAuction = await Auction.deploy()
    await masterAuction.deployed()

    const CoveragePoolStub = await ethers.getContractFactory("CoveragePoolStub")
    coveragePool = await CoveragePoolStub.deploy()
    await coveragePool.deployed()

    const RiskManagerV1 = await ethers.getContractFactory("RiskManagerV1")
    riskManagerV1 = await RiskManagerV1.deploy(
      tbtcToken.address,
      mockTbtcDepositToken.address,
      coveragePool.address,
      signerBondsSwapStrategy.address,
      masterAuction.address,
      auctionLength,
      bondAuctionThreshold,
      notifierReward
    )
    await riskManagerV1.deployed()

    const DepositStub = await ethers.getContractFactory("DepositStub")
    tbtcDeposit1 = await DepositStub.deploy(tbtcToken.address, lotSize)
    await tbtcDeposit1.deployed()
    await tbtcDeposit1.setAuctionValue(bondedAmount)

    await owner.sendTransaction({
      to: tbtcDeposit1.address,
      value: bondedAmount,
    })

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
      expect(await tbtcDeposit1.currentState()).to.equal(11) // LIQUIDATED
      // Signer bonds should land on risk manager contract
      await expect(tx).to.changeEtherBalance(riskManagerV1, bondedAmount)
    })
  })

  async function prepareAuction() {
    await tbtcDeposit1.notifyUndercollateralizedLiquidation()
    await riskManagerV1.notifyLiquidation(tbtcDeposit1.address)

    const auctionAddress = await riskManagerV1.depositToAuction(
      tbtcDeposit1.address
    )
    const auction = new ethers.Contract(auctionAddress, Auction.abi, bidder)
    await tbtcToken.connect(bidder).approve(auction.address, lotSize)
    return auction
  }
})
