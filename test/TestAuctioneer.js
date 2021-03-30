const { expect } = require("chai")
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

describe("Auctioneer", () => {
  beforeEach(async () => {
    const Auctioneer = await ethers.getContractFactory("Auctioneer")
    const TestToken = await ethers.getContractFactory("TestToken")
    const Auction = await ethers.getContractFactory("Auction")
    const CollateralPool = await ethers.getContractFactory("CollateralPool")

    owner = await ethers.getSigner(0)
    signer1 = await ethers.getSigner(1)

    auctioneer = await Auctioneer.deploy()
    await auctioneer.deployed()

    contractAsSigner1 = await auctioneer.connect(signer1)

    masterAuction = await Auction.deploy()
    await masterAuction.deployed()

    collateralPool = await CollateralPool.deploy()
    await collateralPool.deployed()

    await auctioneer.initialize(collateralPool.address, masterAuction.address)

    testToken = await TestToken.deploy()
    await testToken.deployed()

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

  describe("create auction", async () => {
    it("should create a new auction as an owner", async () => {
      const createAuctionTx = await auctioneer.createAuction(
        testToken.address,
        auctionAmountDesired,
        auctionLength
      )

      const receipt = await createAuctionTx.wait()
      const events = pastEvents(receipt, auctioneer, "AuctionCreated")

      expect(events.length).to.equal(1)
      expect(events[0].args["tokenAccepted"]).to.equal(testToken.address)
      expect(events[0].args["amount"]).to.equal(auctionAmountDesired)
      expect(events[0].args["auctionAddress"]).to.be.properAddress

      expect(
        await auctioneer.auctions(events[0].args["auctionAddress"])
      ).to.equal(true)
    })

    it("should not create a new auction when not an owner", async () => {
      await expect(
        contractAsSigner1.createAuction(
          testToken.address,
          auctionAmountDesired,
          auctionLength
        )
      ).to.be.revertedWith("caller is not the owner")
    })
  })

  describe("offer taken", async () => {
    let auction
    let auctionAddress
    let testTokenAsSigner1
    let auctionAsSigner1

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

      testTokenAsSigner1 = await testToken.connect(signer1)

      await testTokenAsSigner1.approve(
        auction.address,
        defaultAuctionTokenAllowance
      )

      // we need to connect signer1 to auction so that signer1 can initiate a call
      auctionAsSigner1 = await auction.connect(signer1)
    })

    it("should take an offer but leave the auction opened", async () => {
      // Increase time 10h -> 36,000 sec
      await increaseTime(36000)

      const amountPaidForAuction = to1e18(1).sub(1) // 1 * 10^18 - 1
      const takeOfferTx = await auctionAsSigner1.takeOffer(amountPaidForAuction)

      // 36,000 / 86,400 =~ 0,416688
      // percent to seize from pool: 0,4166 * 100 =~ 41,66%
      await expect(takeOfferTx)
        .to.emit(auctioneer, "AuctionOfferTaken")
        .withArgs(
          auctionAddress,
          signer1.address,
          testToken.address,
          amountPaidForAuction
        )

      // auction desired amount is 1 * 10^18 of test tokens
      // tokens paid: 1 * 10^18 - 1
      // remaining tokens to collect is 1, hence the auction cannot be closed yet
      await expect(takeOfferTx).to.not.emit(auctioneer, "AuctionClosed")
      expect(await auctioneer.auctions(auctionAddress)).to.equal(true)
    })

    it("should take an offer and close the auction", async () => {
      // Increase time 12h -> 36,000 sec
      await increaseTime(43200)

      const amountPaidForAuction = to1e18(1)
      const takeOfferTx = await auctionAsSigner1.takeOffer(amountPaidForAuction)

      // 43,200 / 86,400 = 0.5
      // percent to seize from pool: 0,5 * 100 = 50%
      await expect(takeOfferTx)
        .to.emit(auctioneer, "AuctionOfferTaken")
        .withArgs(
          auctionAddress,
          signer1.address,
          testToken.address,
          amountPaidForAuction
        )

      // auction was fully paid off and should be closed
      await expect(takeOfferTx)
        .to.emit(auctioneer, "AuctionClosed")
        .withArgs(auctionAddress)

      expect(await auctioneer.auctions(auctionAddress)).to.equal(false)
    })
  })
})
