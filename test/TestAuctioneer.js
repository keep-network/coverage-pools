const { expect } = require("chai")
const { pastEvents } = require("./helpers/contract-test-helpers")

describe("Auctioneer", function () {
  const auctionAmountDesired = ethers.BigNumber.from("10000000")
  const auctionLength = 3600 // sec

  let auctioneer
  let testToken
  let masterAuction
  let signer1
  let signer2
  let contractAsSigner1

  beforeEach(async () => {
    const Auctioneer = await ethers.getContractFactory("Auctioneer")
    const TestToken = await ethers.getContractFactory("TestToken")
    const Auction = await ethers.getContractFactory("Auction")
    const KEEPCollateralPool = await ethers.getContractFactory(
      "KEEPCollateralPool"
    )

    signer1 = await ethers.getSigner(1)
    signer2 = await ethers.getSigner(2)

    auctioneer = await Auctioneer.deploy()
    await auctioneer.deployed()

    contractAsSigner1 = await auctioneer.connect(signer1)
    contractAsSigner2 = await auctioneer.connect(signer2)

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
  })

  describe("create auction", async () => {
    it("should create a new auction", async () => {
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
})
