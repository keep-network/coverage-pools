const chai = require("chai")

const expect = chai.expect
const { to1e18, ZERO_ADDRESS } = require("./helpers/contract-test-helpers")

const { deployMockContract } = require("@ethereum-waffle/mock-contract")
const IDeposit = require("../artifacts/contracts/RiskManagerV1.sol/IDeposit.json")
const ISignerBondsProcessor = require("../artifacts/contracts/RiskManagerV1.sol/ISignerBondsProcessor.json")
const Auction = require("../artifacts/contracts/Auction.sol/Auction.json")

const depositLiquidationInProgressState = 10
const depositLiquidatedState = 11
const auctionLotSize = to1e18(1)

describe("RiskManagerV1", () => {
  let testToken
  let owner
  let mockISignerBondsProcessor
  let notifier
  let bidder
  let riskManagerV1
  let mockIDeposit

  before(async () => {
    const TestToken = await ethers.getContractFactory("TestToken")
    testToken = await TestToken.deploy()
    await testToken.deployed()

    owner = await ethers.getSigner(0)

    mockISignerBondsProcessor = await deployMockContract(
      owner,
      ISignerBondsProcessor.abi
    )

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
    const CollateralPoolStub = await ethers.getContractFactory(
      "CollateralPoolStub"
    )
    collateralPoolStub = await CollateralPoolStub.deploy()
    await collateralPoolStub.deployed()

    masterAuction = await Auction.deploy()
    await masterAuction.deployed()

    const RiskManagerV1 = await ethers.getContractFactory("RiskManagerV1")
    riskManagerV1 = await RiskManagerV1.deploy(
      testToken.address,
      mockISignerBondsProcessor.address
    )
    await riskManagerV1.initialize(
      collateralPoolStub.address,
      masterAuction.address
    )
    await riskManagerV1.deployed()

    notifier = await ethers.getSigner(1)
    bidder = await ethers.getSigner(2)

    mockIDeposit = await deployMockContract(owner, IDeposit.abi)
  })

  describe("notifyLiquidation", () => {
    context("when deposit is not in liquidation state", () => {
      it("should revert", async () => {
        await mockIDeposit.mock.currentState.returns(4) // Active state

        await expect(
          riskManagerV1.notifyLiquidation(mockIDeposit.address)
        ).to.be.revertedWith("Deposit is not in liquidation state")
      })
    })

    context("when deposit is in liquidation state", () => {
      let notifyLiquidationTx

      beforeEach(async () => {
        notifyLiquidationTx = await notifyLiquidation()
      })

      it("should emit NotifiedLiquidation event", async () => {
        await expect(notifyLiquidationTx)
          .to.emit(riskManagerV1, "NotifiedLiquidation")
          .withArgs(mockIDeposit.address, notifier.address)
      })

      it("should create an auction and populate auction's map", async () => {
        const createdAuctionAddress = await riskManagerV1.auctionsByDepositsInLiquidation(
          mockIDeposit.address
        )

        expect(createdAuctionAddress).to.be.properAddress
        expect(createdAuctionAddress).to.not.equal(ZERO_ADDRESS)
      })
    })
  })

  describe("notifyLiquidated", () => {
    context("when deposit is not in liquidated state", () => {
      it("should revert", async () => {
        await mockIDeposit.mock.currentState.returns(4) // Active state

        await expect(
          riskManagerV1.notifyLiquidated(mockIDeposit.address)
        ).to.be.revertedWith("Deposit is not in liquidated state")
      })
    })

    context("when deposit is in liquidated state", () => {
      beforeEach(async () => {
        await notifyLiquidation()
        await mockIDeposit.mock.currentState.returns(depositLiquidatedState)
      })

      it("should emit notified liquidated event", async () => {
        await expect(
          riskManagerV1.connect(notifier).notifyLiquidated(mockIDeposit.address)
        )
          .to.emit(riskManagerV1, "NotifiedLiquidated")
          .withArgs(mockIDeposit.address, notifier.address)
      })

      it("should early close an auction", async () => {
        const createdAuctionAddress = await riskManagerV1.auctionsByDepositsInLiquidation(
          mockIDeposit.address
        )

        await riskManagerV1
          .connect(notifier)
          .notifyLiquidated(mockIDeposit.address)

        expect(
          await riskManagerV1.auctionsByDepositsInLiquidation(
            createdAuctionAddress
          )
        ).to.equal(ZERO_ADDRESS)
        expect(await riskManagerV1.openAuctions(createdAuctionAddress)).to.be
          .false
      })
    })
  })

  describe("actBeforeAuctionClose", () => {
    let auctionAddress
    let auction

    beforeEach(async () => {
      await testToken.mint(bidder.address, auctionLotSize)
      await mockIDeposit.mock.purchaseSignerBondsAtAuction.returns()
      await mockIDeposit.mock.withdrawFunds.returns()
      await mockIDeposit.mock.withdrawableAmount.returns(to1e18(10))
      await mockISignerBondsProcessor.mock.processSignerBonds.returns()

      await notifyLiquidation(mockIDeposit.address)
      auctionAddress = await riskManagerV1.auctionsByDepositsInLiquidation(
        mockIDeposit.address
      )
      await testToken.connect(bidder).approve(auctionAddress, auctionLotSize)

      auction = new ethers.Contract(auctionAddress, Auction.abi, owner)
    })

    context("when the entire deposit was bought", () => {
      beforeEach(async () => {
        // take entire auction
        await auction.connect(bidder).takeOffer(auctionLotSize)
      })
      it("should delete auction from the auctions map", async () => {
        expect(
          await riskManagerV1.auctionsByDepositsInLiquidation(
            mockIDeposit.address
          )
        ).to.equal(ZERO_ADDRESS)
      })

      it("should delete deposit from the deposits map", async () => {
        expect(
          await riskManagerV1.depositsInLiquidationByAuctions(auctionAddress)
        ).to.equal(ZERO_ADDRESS)
      })
    })

    context("when the deposit was bought partially", () => {
      beforeEach(async () => {
        // take partial auction
        await auction.connect(bidder).takeOffer(auctionLotSize.sub(1))
      })
      it("should keep auction in the auction map", async () => {
        expect(
          await riskManagerV1.auctionsByDepositsInLiquidation(
            mockIDeposit.address
          )
        ).to.equal(auctionAddress)
      })

      it("should keep deposit in the deposits map", async () => {
        expect(
          await riskManagerV1.depositsInLiquidationByAuctions(auctionAddress)
        ).to.equal(mockIDeposit.address)
      })
    })
  })

  async function notifyLiquidation() {
    await mockIDeposit.mock.currentState.returns(
      depositLiquidationInProgressState
    )
    await mockIDeposit.mock.lotSizeTbtc.returns(auctionLotSize)
    const tx = await riskManagerV1
      .connect(notifier)
      .notifyLiquidation(mockIDeposit.address)
    return tx
  }
})
