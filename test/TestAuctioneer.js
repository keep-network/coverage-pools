const { expect } = require("chai")
const { BigNumber } = require("ethers")
const {
  to1ePrecision,
  to1e18,
  pastEvents,
  increaseTime,
} = require("./helpers/contract-test-helpers")

const AuctionJSON = require("../artifacts/contracts/Auction.sol/Auction.json")

const auctionLength = 86400 // 24h in sec
const auctionAmountDesired = to1e18(1) // ex. 1 TBTC
const testTokensToMint = to1e18(1)

describe("Auctioneer", () => {
  let owner
  let bidder
  let auctioneer
  let masterAuction
  let collateralPoolStub
  let testToken

  before(async () => {
    owner = await ethers.getSigner(0)
    bidder = await ethers.getSigner(1)

    const CoveragePoolConstants = await ethers.getContractFactory(
      "CoveragePoolConstants"
    )
    const coveragePoolConstants = await CoveragePoolConstants.deploy()
    await coveragePoolConstants.deployed()

    const Auctioneer = await ethers.getContractFactory("Auctioneer")
    const TestToken = await ethers.getContractFactory("TestToken")
    const Auction = await ethers.getContractFactory("Auction", {
      libraries: {
        CoveragePoolConstants: coveragePoolConstants.address,
      },
    })
    const CollateralPoolStub = await ethers.getContractFactory(
      "CollateralPoolStub"
    )

    auctioneer = await Auctioneer.deploy()
    await auctioneer.deployed()

    masterAuction = await Auction.deploy()
    await masterAuction.deployed()

    collateralPoolStub = await CollateralPoolStub.deploy()
    await collateralPoolStub.deployed()

    await auctioneer.initialize(
      collateralPoolStub.address,
      masterAuction.address
    )

    testToken = await TestToken.deploy()
    await testToken.deployed()
  })

  beforeEach(async () => {
    await testToken.mint(bidder.address, testTokensToMint)
  })

  describe("initialize", () => {
    context("when the auctioneer has been already initialized", () => {
      it("should not be initialized again", async () => {
        await expect(
          auctioneer.initialize(
            collateralPoolStub.address,
            masterAuction.address
          )
        ).to.be.revertedWith("Auctioneer already initialized")
      })
    })
  })

  describe("createAuction", () => {
    before(async () => {
      const receipt = await createAuction()
      events = pastEvents(receipt, auctioneer, "AuctionCreated")
    })

    context("when caller is the owner", () => {
      it("should create a new auction", async () => {
        expect(
          await auctioneer.openAuctions(events[0].args["auctionAddress"])
        ).to.equal(true)
      })

      it("should emit auction created event", async () => {
        expect(events.length).to.equal(1)
        expect(events[0].args["tokenAccepted"]).to.equal(testToken.address)
        expect(events[0].args["amount"]).to.equal(auctionAmountDesired)
        expect(events[0].args["auctionAddress"]).to.be.properAddress
      })
    })

    context("when caller is not the owner", () => {
      it("should revert", async () => {
        await expect(
          auctioneer
            .connect(bidder)
            .createAuction(
              testToken.address,
              auctionAmountDesired,
              auctionLength
            )
        ).to.be.revertedWith("caller is not the owner")
      })
    })
  })

  describe("offerTaken", () => {
    let auction
    let auctionAddress
    // amount of test tokens that an auction (aka spender) is allowed
    // to transfer on behalf of a signer (aka token owner) from signer balance
    const auctionTokenAllowance = to1e18(1)

    beforeEach(async () => {
      const receipt = await createAuction()
      const events = pastEvents(receipt, auctioneer, "AuctionCreated")
      auctionAddress = events[0].args["auctionAddress"]

      auction = new ethers.Contract(auctionAddress, AuctionJSON.abi, owner)

      await testToken
        .connect(bidder)
        .approve(auction.address, auctionTokenAllowance)
    })

    context(
      "when the auction was partially filled and has not been closed yet",
      () => {
        let amountPaidForAuction1
        let takeOfferTx1
        let portionToSeize1
        let receipt1
        let amountPaidForAuction2
        let takeOfferTx2
        let portionToSeize2
        let receipt2
        let approximation

        beforeEach(async () => {
          // Increase time 1h -> 3,600 sec
          await increaseTime(3600)
          // half of the available pool was paid
          amountPaidForAuction1 = to1e18(1).div(BigNumber.from("2")) // 1 * 10^18 / 2
          takeOfferTx1 = await auction
            .connect(bidder)
            .takeOffer(amountPaidForAuction1)
          // portion available to seize from a pool: 3,600 / 86,400 =~ 0.0416666
          // portionToSeize: 0.0416666 / 2 = 0.0208333
          portionToSeize1 = to1ePrecision(208333, 11)
          // approximation: 0.00002
          approximation = to1ePrecision(2, 13)
          receipt1 = await takeOfferTx1.wait()

          // increase time 45min -> 2,700 sec
          // now: 3,600 + 2,700 = 6,300
          await increaseTime(2700)
          // (6,300 - 1,800) * 1.0212 / 86,400 = 0.0531875 +/- 0.0002
          // ~5.31% on offer of a collateral pool after 1h45min
          // Pay 20% of the remaining amount for an auction (0.5 * 10^18) / 5 = 0.1 * 10^18
          amountPaidForAuction2 = amountPaidForAuction1.div(BigNumber.from("5"))
          takeOfferTx2 = await auction
            .connect(bidder)
            .takeOffer(amountPaidForAuction2)
          // portion available to seize from a pool: 0.0531875
          // portionToSeize: 0.0531875 / 5 = 0.0106375
          portionToSeize2 = to1ePrecision(106375, 11)
          receipt2 = await takeOfferTx2.wait()
        })

        it("should emit AuctionOfferTaken event", async () => {
          let events = pastEvents(receipt1, auctioneer, "AuctionOfferTaken")
          expect(events.length).to.equal(1)
          expect(events[0].args["auction"]).to.equal(auctionAddress)
          expect(events[0].args["auctionTaker"]).to.equal(bidder.address)
          expect(events[0].args["tokenAccepted"]).to.equal(testToken.address)
          expect(events[0].args["amount"]).to.equal(amountPaidForAuction1)
          expect(events[0].args["portionToSeize"]).to.be.closeTo(
            portionToSeize1,
            approximation
          )

          events = pastEvents(receipt2, auctioneer, "AuctionOfferTaken")
          expect(events.length).to.equal(1)
          expect(events[0].args["auction"]).to.equal(auctionAddress)
          expect(events[0].args["auctionTaker"]).to.equal(bidder.address)
          expect(events[0].args["tokenAccepted"]).to.equal(testToken.address)
          expect(events[0].args["amount"]).to.equal(amountPaidForAuction2)
          expect(events[0].args["portionToSeize"]).to.be.closeTo(
            portionToSeize2,
            approximation
          )
        })

        it("should seize funds from collateral pool", async () => {
          // assert SeizeFunds emitted with the right values
          // check whether seizeFunds was executed with the right params
          events = pastEvents(receipt1, collateralPoolStub, "FundsSeized")
          expect(events.length).to.equal(1)
          expect(events[0].args["recipient"]).to.equal(bidder.address)
          expect(events[0].args["portionToSeize"]).to.be.closeTo(
            portionToSeize1,
            approximation
          )
        })

        it("should not emit AuctionClosed event", async () => {
          // auction desired amount is 1 * 10^18 of test tokens
          // tokens paid: 1 * 10^18 - 0.6 * 10^18
          // remaining tokens to collect is 0.4 * 10^18, hence the auction cannot be closed yet
          await expect(takeOfferTx2).to.not.emit(auctioneer, "AuctionClosed")
        })

        it("should not stop tracking the auction", async () => {
          expect(await auctioneer.openAuctions(auctionAddress)).to.equal(true)
        })
      }
    )

    context("when the auction was fully paid off and can be closed", () => {
      let amountPaidForAuction
      let takeOfferTx
      let portionToSeize
      let receipt

      beforeEach(async () => {
        // Increase time 12h -> 43,200 sec
        await increaseTime(43200)

        amountPaidForAuction = to1e18(1)
        takeOfferTx = await auction
          .connect(bidder)
          .takeOffer(amountPaidForAuction)

        // portion to seize from the pool: 43,200 / 86,400 = 0.5
        portionToSeize = to1ePrecision(5, 17)
        // approximation: 0.00004
        approximation = to1ePrecision(4, 13)
        receipt = await takeOfferTx.wait()
      })

      it("should emit AuctionOfferTaken event", async () => {
        const events = pastEvents(receipt, auctioneer, "AuctionOfferTaken")
        expect(events.length).to.equal(1)
        expect(events[0].args["auction"]).to.equal(auctionAddress)
        expect(events[0].args["auctionTaker"]).to.equal(bidder.address)
        expect(events[0].args["tokenAccepted"]).to.equal(testToken.address)
        expect(events[0].args["amount"]).to.equal(amountPaidForAuction)
        expect(events[0].args["portionToSeize"]).to.be.closeTo(
          portionToSeize,
          approximation
        )
      })

      it("should seize funds from collateral pool", async () => {
        // assert SeizeFunds emitted with the right values
        events = pastEvents(receipt, collateralPoolStub, "FundsSeized")
        expect(events.length).to.equal(1)
        expect(events[0].args["recipient"]).to.equal(bidder.address)
        expect(events[0].args["portionToSeize"]).to.be.closeTo(
          portionToSeize,
          approximation
        )
      })

      it("should emit AuctionClosed event", async () => {
        // auction was fully paid off and should be closed
        await expect(takeOfferTx)
          .to.emit(auctioneer, "AuctionClosed")
          .withArgs(auctionAddress)
      })

      it("should stop tracking the auction", async () => {
        expect(await auctioneer.openAuctions(auctionAddress)).to.equal(false)
      })
    })
  })

  async function createAuction() {
    const createAuctionTx = await auctioneer
      .connect(owner)
      .createAuction(testToken.address, auctionAmountDesired, auctionLength)

    return await createAuctionTx.wait()
  }
})
