const { expect } = require("chai")
const { pastEvents } = require("./helpers/contract-test-helpers")

const AuctionJSON = require("../artifacts/contracts/Auction.sol/Auction.json")

describe("Auctioneer", function () {
  const auctionAmountDesired = ethers.utils.parseUnits("100", "ether") // coverts to wei
  const auctionLength = 3600 // sec

  let auctioneer
  let testToken
  let masterAuction
  let owner
  let auctionAddress

  beforeEach(async () => {
    const Auctioneer = await ethers.getContractFactory("Auctioneer")
    const TestToken = await ethers.getContractFactory("TestToken")
    const Auction = await ethers.getContractFactory("Auction")
    const KEEPCollateralPool = await ethers.getContractFactory(
      "KEEPCollateralPool"
    )

    owner = await ethers.getSigner(0)

    auctioneer = await Auctioneer.deploy()
    await auctioneer.deployed()

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

    const createAuctionTx = await auctioneer.createAuction(
      testToken.address,
      auctionAmountDesired,
      auctionLength
    )

    const receipt = await createAuctionTx.wait()
    const events = pastEvents(receipt, auctioneer, "AuctionCreated")
    auctionAddress = events[0].args["auctionAddress"]
  })

  describe("initialize", async () => {
    it("should not initialize already initialized auction", async () => {
      const auction = new ethers.Contract(
        auctionAddress,
        AuctionJSON.abi,
        owner
      )

      expect(await auction.isOpen()).to.equal(true)

      await expect(
        auction.initialize(
          auctioneer.address,
          testToken.address,
          auctionAmountDesired,
          auctionLength
        )
      ).to.be.revertedWith("Auction already initialized")
    })

    it("should not initialize when desired amount is zero", async () => {
      const auctionAmountDesired = 0
      await expect(
        auctioneer.createAuction(
          testToken.address,
          auctionAmountDesired,
          auctionLength
        )
      ).to.be.revertedWith("Amount desired must be greater than zero")
    })
  })
})
