const { expect } = require("chai")
const { BigNumber } = require("ethers")
const {
  to1e18,
  pastEvents,
  increaseTime,
} = require("./helpers/contract-test-helpers")

const AuctionJSON = require("../artifacts/contracts/Auction.sol/Auction.json")

const auctionLength = 86400 // 24h in sec
const auctionAmountDesired = to1e18(1) // ex. 1 TBTC
const testTokensToMint = to1e18(1)
// amount of test tokens that an auction (aka spender) is allowed
// to transfer on behalf of a signer (aka token owner) from signer balance
const defaultAuctionTokenAllowance = to1e18(1)

describe("Auctioneer", function () {
  before(async () => {
    owner = await ethers.getSigner(0)
    signer1 = await ethers.getSigner(1)

    const Auctioneer = await ethers.getContractFactory("Auctioneer")
    const TestToken = await ethers.getContractFactory("TestToken")
    const Auction = await ethers.getContractFactory("Auction")
    const CollateralPool = await ethers.getContractFactory("CollateralPool")

    auctioneer = await Auctioneer.deploy()
    await auctioneer.deployed()

    masterAuction = await Auction.deploy()
    await masterAuction.deployed()

    collateralPool = await CollateralPool.deploy()
    await collateralPool.deployed()

    await auctioneer.initialize(collateralPool.address, masterAuction.address)

    testToken = await TestToken.deploy()
    await testToken.deployed()
  })

  beforeEach(async () => {
    await testToken.mint(owner.address, testTokensToMint)
    await testToken.mint(signer1.address, testTokensToMint)
    await testToken.approve(signer1.address, testTokensToMint)
  })

  describe("initialize", async () => {
    it("should not initialize actioneer a second time", async () => {
      await expect(
        auctioneer.initialize(collateralPool.address, masterAuction.address)
      ).to.be.revertedWith("Auctioneer already initialized")
    })
  })

  describe("create auction", () => {
    before(async () => {
      events = await createAuction()
    })

    it("should create a new auction as an owner", async () => {
      expect(
        await auctioneer.auctions(events[0].args["auctionAddress"])
      ).to.equal(true)
    })

    it("should emit auction created event", async () => {
      expect(events.length).to.equal(1)
      expect(events[0].args["tokenAccepted"]).to.equal(testToken.address)
      expect(events[0].args["amount"]).to.equal(auctionAmountDesired)
      expect(events[0].args["auctionAddress"]).to.be.properAddress
    })

    it("should not create a new auction when not an owner", async () => {
      await expect(
        auctioneer
          .connect(signer1)
          .createAuction(testToken.address, auctionAmountDesired, auctionLength)
      ).to.be.revertedWith("caller is not the owner")
    })

    async function createAuction() {
      const createAuctionTx = await auctioneer.createAuction(
        testToken.address,
        auctionAmountDesired,
        auctionLength
      )

      const receipt = await createAuctionTx.wait()
      return pastEvents(receipt, auctioneer, "AuctionCreated")
    }
  })

  describe("offer taken", () => {
    let auction
    let auctionAddress

    beforeEach(async () => {
      const createAuctionTx = await auctioneer.createAuction(
        testToken.address,
        auctionAmountDesired,
        auctionLength
      )

      const receipt = await createAuctionTx.wait()
      const events = pastEvents(receipt, auctioneer, "AuctionCreated")
      auctionAddress = events[0].args["auctionAddress"]

      auction = new ethers.Contract(auctionAddress, AuctionJSON.abi, owner)

      await testToken
        .connect(signer1)
        .approve(auction.address, defaultAuctionTokenAllowance)
    })

    it("should take an offer but leave the auction opened", async () => {
      // Increase time 1h -> 3,600 sec
      await increaseTime(3600)

      // half of the available pool was paid
      let amountPaidForAuction = to1e18(1).div(BigNumber.from("2")) // 1 * 10^18 / 2
      let takeOfferTx = await auction
        .connect(signer1)
        .takeOffer(amountPaidForAuction)

      // portion available to seize from a pool: 3,600 / 86,400 =~ 0.0416666
      // portionToSeize: 0.0416666 / 2 = 0.0208333
      let portionToSeize = BigNumber.from("20833")
      let receipt = await takeOfferTx.wait()

      let events = pastEvents(receipt, auctioneer, "AuctionOfferTaken")
      expect(events.length).to.equal(1)
      expect(events[0].args["auction"]).to.equal(auctionAddress)
      expect(events[0].args["auctionTaker"]).to.equal(signer1.address)
      expect(events[0].args["tokenAccepted"]).to.equal(testToken.address)
      expect(events[0].args["amount"]).to.equal(amountPaidForAuction)
      expect(events[0].args["portionOfPool"]).to.be.closeTo(portionToSeize, 100)

      // increase time 45min -> 2,700 sec
      // now: 3,600 + 2,700 = 6,300
      await increaseTime(2700)
      // (6,300 - 1,800) * 1.0212 / 86,400 = 0.0531875 +/- 0.0002
      // ~5.31% on offer of a collateral pool after 1h45min

      // Pay 20% of the remaining amount for an auction (0.5 * 10^18) / 5 = 0.1 * 10^18
      amountPaidForAuction = amountPaidForAuction.div(BigNumber.from("5"))
      takeOfferTx = await auction
        .connect(signer1)
        .takeOffer(amountPaidForAuction)

      // portion available to seize from a pool: 0.0531875
      // portionToSeize: 0.0531875 / 5 = 0.0106375
      portionToSeize = BigNumber.from("10637")

      receipt = await takeOfferTx.wait()

      events = pastEvents(receipt, auctioneer, "AuctionOfferTaken")
      expect(events.length).to.equal(1)
      expect(events[0].args["auction"]).to.equal(auctionAddress)
      expect(events[0].args["auctionTaker"]).to.equal(signer1.address)
      expect(events[0].args["tokenAccepted"]).to.equal(testToken.address)
      expect(events[0].args["amount"]).to.equal(amountPaidForAuction)
      expect(events[0].args["portionOfPool"]).to.be.closeTo(portionToSeize, 100)

      // auction desired amount is 1 * 10^18 of test tokens
      // tokens paid: 1 * 10^18 - 0.6 * 10^18
      // remaining tokens to collect is 0.4 * 10^18, hence the auction cannot be closed yet
      await expect(takeOfferTx).to.not.emit(auctioneer, "AuctionClosed")
      expect(await auctioneer.auctions(auctionAddress)).to.equal(true)
    })

    it("should take an offer and close the auction", async () => {
      // Increase time 12h -> 36,000 sec
      await increaseTime(43200)

      const amountPaidForAuction = to1e18(1)
      const takeOfferTx = await auction
        .connect(signer1)
        .takeOffer(amountPaidForAuction)

      // percent to seize from a pool: 43,200 / 86,400 = 0.5
      const portionToSeize = BigNumber.from("500000")
      const receipt = await takeOfferTx.wait()
      const events = pastEvents(receipt, auctioneer, "AuctionOfferTaken")
      expect(events.length).to.equal(1)
      expect(events[0].args["auction"]).to.equal(auctionAddress)
      expect(events[0].args["auctionTaker"]).to.equal(signer1.address)
      expect(events[0].args["tokenAccepted"]).to.equal(testToken.address)
      expect(events[0].args["amount"]).to.equal(amountPaidForAuction)
      expect(events[0].args["portionOfPool"]).to.be.closeTo(portionToSeize, 100)

      // auction was fully paid off and should be closed
      await expect(takeOfferTx)
        .to.emit(auctioneer, "AuctionClosed")
        .withArgs(auctionAddress)

      expect(await auctioneer.auctions(auctionAddress)).to.equal(false)
    })
  })
})
