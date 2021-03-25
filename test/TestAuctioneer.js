const { expect } = require("chai")
const { pastEvents } = require("./helpers/contract-test-helpers")

const AuctionJSON = require("../artifacts/contracts/Auction.sol/Auction.json")

const auctionLength = 86400 // 24h in sec
const auctionAmountDesired = 100000000 // equivalent of 1 BTC in satoshi. Should represent ex. 1 TBTC
const testTokensToMint = 100000000
// amount of test tokens that an auction (aka spender) is allowed
// to transfer on behalf of signer1 (aka token owner) from signer1 balance
const defaultAuctionTokenAllowance = 100000000

describe("Auctioneer", () => {
  let auctioneer
  let testToken
  let masterAuction
  let owner
  let signer1
  let contractAsSigner1

  beforeEach(async () => {
    const Auctioneer = await ethers.getContractFactory("Auctioneer")
    const TestToken = await ethers.getContractFactory("TestToken")
    const Auction = await ethers.getContractFactory("Auction")
    const KEEPCollateralPool = await ethers.getContractFactory(
      "KEEPCollateralPool"
    )

    owner = await ethers.getSigner(0)
    signer1 = await ethers.getSigner(1)

    auctioneer = await Auctioneer.deploy()
    await auctioneer.deployed()

    contractAsSigner1 = await auctioneer.connect(signer1)

    masterAuction = await Auction.deploy()
    await masterAuction.deployed()

    keepCollateralPool = await KEEPCollateralPool.deploy()
    await keepCollateralPool.deployed()

    await auctioneer.initialize(
      keepCollateralPool.address,
      masterAuction.address
    )

    testToken = await TestToken.deploy()
    await testToken.deployed()

    await testToken.mint(owner.address, testTokensToMint)
    await testToken.mint(signer1.address, testTokensToMint)
    await testToken.approve(signer1.address, testTokensToMint)
  })

  describe("initialize", async () => {
    it("should not initialize actioneer a second time", async () => {
      await expect(
        auctioneer.initialize(keepCollateralPool.address, masterAuction.address)
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
      const amountPaidForAuction = 99999999
      const takeOfferTx = await auctionAsSigner1.takeOffer(amountPaidForAuction)

      await expect(takeOfferTx)
        .to.emit(auctioneer, "AuctionOfferTaken")
        .withArgs(auctionAddress, testToken.address, amountPaidForAuction)

      // auction desired amount is 100,000,000 of test tokens (ex. TBTC in satoshi)
      // tokens paid: 99999999
      // remaining tokens to collect is 1, hence the auction cannot be closed yet
      await expect(takeOfferTx).to.not.emit(auctioneer, "AuctionClosed")
      expect(await auctioneer.auctions(auctionAddress)).to.equal(true)
    })

    it("should take an offer and close the auction", async () => {
      const amountPaidForAuction = 100000000
      const takeOfferTx = await auctionAsSigner1.takeOffer(amountPaidForAuction)

      await expect(takeOfferTx)
        .to.emit(auctioneer, "AuctionOfferTaken")
        .withArgs(auctionAddress, testToken.address, amountPaidForAuction)

      // auction was fully paid off and should be closed
      await expect(takeOfferTx)
        .to.emit(auctioneer, "AuctionClosed")
        .withArgs(auctionAddress)

      expect(await auctioneer.auctions(auctionAddress)).to.equal(false)
    })
  })
})
