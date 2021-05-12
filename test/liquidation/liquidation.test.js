const { expect } = require("chai")
const { to1e18 } = require("../helpers/contract-test-helpers")
const Auction = require("../../artifacts/contracts/Auction.sol/Auction.json")

describe("Integration -- liquidation happy path", () => {
  const auctionLength = 86400 // 24h
  const lotSize = to1e18(10)
  const bondedAmount = to1e18(150)

  let tbtcToken
  let collateralPool
  let riskManagerV1
  let tbtcDeposit

  let bidder

  beforeEach(async () => {
    const TestToken = await ethers.getContractFactory("TestToken")
    tbtcToken = await TestToken.deploy()
    await tbtcToken.deployed()

    const CoveragePoolConstants = await ethers.getContractFactory(
      "CoveragePoolConstants"
    )
    const coveragePoolConstants = await CoveragePoolConstants.deploy()
    await coveragePoolConstants.deployed()

    const Auction = await ethers.getContractFactory("Auction", {
      libraries: {
        CoveragePoolConstants: coveragePoolConstants.address,
      },
    })

    const masterAuction = await Auction.deploy()
    await masterAuction.deployed()

    // TODO: Replace with real CoveragePool contract
    const CollateralPoolStub = await ethers.getContractFactory(
      "CollateralPoolStub"
    )
    collateralPool = await CollateralPoolStub.deploy()
    await collateralPool.deployed()

    const RiskManagerV1 = await ethers.getContractFactory("RiskManagerV1")
    riskManagerV1 = await RiskManagerV1.deploy(
      tbtcToken.address,
      collateralPool.address,
      masterAuction.address,
      auctionLength
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
    await tbtcToken.mint(bidder.address, lotSize)
  })

  describe("when auction has been fully filled", () => {
    let auction
    let tx

    beforeEach(async () => {
      await tbtcDeposit.notifyUndercollateralizedLiquidation()
      await riskManagerV1.notifyLiquidation(tbtcDeposit.address)

      const auctionAddress = await riskManagerV1.depositToAuction(
        tbtcDeposit.address
      )
      auction = new ethers.Contract(auctionAddress, Auction.abi, bidder)
      await tbtcToken.connect(bidder).approve(auction.address, lotSize)
      tx = await auction.takeOffer(lotSize)
    })

    it("should close auction", async () => {
      expect(await auction.isOpen()).to.be.false
    })

    it("should purchase and withdraw signer bonds from deposit", async () => {
      // Risk Manager has all ETH bonds at their disposal
      await expect(tx).to.changeEtherBalance(riskManagerV1, bondedAmount)
      // Auction bidder has spend their TBTC
      expect(await tbtcToken.balanceOf(bidder.address)).to.equal(0)
      // Deposit has been liquidated
      expect(await tbtcDeposit.currentState()).to.equal(11) // LIQUIDATED
    })
  })
})
