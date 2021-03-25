const chai = require("chai")

const expect = chai.expect
const { pastEvents, increaseTime } = require("./helpers/contract-test-helpers")

const AuctionJSON = require("../artifacts/contracts/Auction.sol/Auction.json")

const defaultAuctionLength = 86400 // 24h in sec
const defaultAuctionAmountDesired = 100000000 // equivalent of 1 BTC in satoshi. Should represent ex. 1 TBTC
// amount of test tokens that an auction (aka spender) is allowed
// to transfer on behalf of signer1 (aka token owner) from signer1 balance
const defaultAuctionTokenAllowance = 100000000
const testTokensToMint = 100000000

describe("Auction", () => {
  let auctioneer
  let testToken
  let auction
  let auctionAsSigner1
  let owner
  let signer1

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

    const masterAuction = await Auction.deploy()
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

    auction = await createAuction(
      defaultAuctionAmountDesired,
      defaultAuctionLength
    )

    const testTokenAsSigner1 = await testToken.connect(signer1)
    await testTokenAsSigner1.approve(
      auction.address,
      defaultAuctionTokenAllowance
    )

    auctionAsSigner1 = await auction.connect(signer1)
  })

  describe("initialize", async () => {
    it("should not initialize already initialized auction", async () => {
      expect(await auction.isOpen()).to.equal(true)

      await expect(
        auction.initialize(
          auctioneer.address,
          testToken.address,
          defaultAuctionAmountDesired,
          defaultAuctionLength
        )
      ).to.be.revertedWith("Auction already initialized")
    })

    it("should not initialize when desired amount is zero", async () => {
      const auctionAmountDesired = 0
      await expect(
        auctioneer.createAuction(
          testToken.address,
          auctionAmountDesired,
          defaultAuctionLength
        )
      ).to.be.revertedWith("Amount desired must be greater than zero")
    })
  })

  describe("on offer", async () => {
    it("should return a portion of a collateral pool which is available for taken when auction length is 100000", async () => {
      const auctionAmountDesired = 10000
      const auctionLength = 100000 // sec -> ~28h
      const auction = await createAuction(auctionAmountDesired, auctionLength)

      expect(await auction.isOpen()).to.be.equal(true)

      await increaseTime(24000)
      const onOffer = await auction.onOffer()

      // auction length: 100000 sec
      // 24000 sec passed, which means 24% of a collateral pool is on offer
      expect(onOffer[0] / onOffer[1]).to.be.closeTo(0.24, 0.01)
    })

    it("should return a portion of a collateral pool which is available for taken when auction length is 50000", async () => {
      const auctionAmountDesired = 10000
      const auctionLength = 50000 // sec -> ~14h
      const auction = await createAuction(auctionAmountDesired, auctionLength)

      expect(await auction.isOpen()).to.be.equal(true)

      await increaseTime(24000)
      const onOffer = await auction.onOffer()

      // auction length: 50000sec
      // 24000 sec passed, which means 48% of a collateral pool is on offer
      expect(onOffer[0] / onOffer[1]).to.be.closeTo(0.48, 0.01)
    })

    it("should return a portion of a collateral pool which is available for taken when requesting a couple of times", async () => {
      const auctionAmountDesired = 10000
      const auctionLength = 100000 // sec -> ~28h
      const auction = await createAuction(auctionAmountDesired, auctionLength)

      expect(await auction.isOpen()).to.be.equal(true)

      await increaseTime(24000)
      let onOffer = await auction.onOffer()

      // auction length: 100000 sec
      // 24000 sec passed, which means 24% of a collateral pool is on offer
      expect(onOffer[0] / onOffer[1]).to.be.closeTo(0.24, 0.01)

      await increaseTime(26000)
      onOffer = await auction.onOffer()

      // auction length: 100000 sec
      // 50000 sec passed, which means 50% of a collateral pool is on offer
      expect(onOffer[0] / onOffer[1]).to.be.closeTo(0.5, 0.01)
    })
  })

  describe("take offer", async () => {
    it("should pay more than 0 tokens", async () => {
      await expect(auction.takeOffer(0)).to.be.revertedWith(
        "Can't pay 0 tokens"
      )
    })

    it("should take the entire auction", async () => {
      expect(await testToken.balanceOf(auctioneer.address)).to.be.equal(0)

      // Increase time 1h -> 3600sec
      await increaseTime(3600)

      await auctionAsSigner1.takeOffer(defaultAuctionAmountDesired)

      // entire amount paid for an auction should be transferred to auctioneer
      expect(await testToken.balanceOf(auctioneer.address)).to.be.equal(
        defaultAuctionAmountDesired
      )

      // when a desired amount is collected, a contract should be destroyed
      expect(await ethers.provider.getCode(auction.address)).to.equal("0x")
    })

    it("should take a partial offer from the same signer", async () => {
      expect(await testToken.balanceOf(auctioneer.address)).to.be.equal(0)

      // For testing calculation purposes assume the auction start time is 0
      // On blockchain we calculate the time diffs

      // Increase time 1h -> 3600sec
      await increaseTime(3600)
      let onOfferObj = await auctionAsSigner1.onOffer()
      // Velocity pool depleating rate: 1
      // Percent on offer after 1h of auction start time: 3,600 * 1 * / 86,400 ~ 0.0416 +/- 0.0002 (evm delays)
      // ~4.16% on offer of a collateral pool after 1h
      expect(onOfferObj[0] / onOfferObj[1]).to.be.closeTo(0.0416, 0.0002)
      // Pay 50% of the desired amount for an auction 50,000,000
      let partialOfferAmount = defaultAuctionAmountDesired / 2
      await auctionAsSigner1.takeOffer(partialOfferAmount)
      expect(await testToken.balanceOf(auctioneer.address)).to.be.equal(
        50000000
      )

      // Ratio amount paid: (50,000,000) / 100,000,000 = 0.5
      // Updated start time: 0 + (3,600 - 0) * 0.5 = 1,800
      // Velocity pool depleating rate: 86,400 / (86,400 - 1,800) ~ 1.0212
      // Availability of assets in the collateral pool: 100% - (4.16% / 2) = 97.92%

      // Increase time 45min -> 2,700 sec
      // Now: 3,600 + 2,700 = 6,300
      await increaseTime(2700)
      // (6,300 - 1,800) * 1.0212 / 86,400 = 0.0531875 +/- 0.0002
      // ~5.31% on offer of a collateral pool after 1h45min
      onOfferObj = await auctionAsSigner1.onOffer()
      expect(onOfferObj[0] / onOfferObj[1]).to.be.closeTo(0.0531, 0.0002)

      // Pay 20% of the remaining amount for an auction 50,000,000 / 5 = 10,000,000
      partialOfferAmount = partialOfferAmount / 5
      await auctionAsSigner1.takeOffer(partialOfferAmount)
      expect(await testToken.balanceOf(auctioneer.address)).to.be.equal(
        60000000
      )

      // Ratio amount paid: (10,000,000) / 50,000,000 = 0.2
      // Updated start time: 1,800 + (6,300 - 1,800) * 0.2 = 2,700
      // Velocity pool depleating rate: 86,400 / (86,400 - 2,700) ~ 1.03225
      // Availability of assets in a collateral pool: 97.92% - (5.31% * 0.2) ~ 96.86%

      // Increase time 20min -> 1,200 sec
      // Now: 6,300 + 1,200 = 7,500
      await increaseTime(1200)
      // 60% of the desired amount was paid. 50,000,000 + 10,000,000 out of 100,000,000
      onOfferObj = await auctionAsSigner1.onOffer()
      expect(onOfferObj[0] / onOfferObj[1]).to.be.closeTo(0.0573, 0.0002)
      // Buy the rest and close the auction 100,000,000 - 60,000,000 = 40,000,000
      partialOfferAmount = 40000000
      await auctionAsSigner1.takeOffer(partialOfferAmount)
      expect(await testToken.balanceOf(auctioneer.address)).to.be.equal(
        100000000
      )

      // when a desired amount is collected, this auction should be destroyed
      expect(await ethers.provider.getCode(auction.address)).to.equal("0x")
    })

    it("should take a partial offer from multiple signers", async () => {
      // TODO: implement
    })
  })

  async function createAuction(auctionAmountDesired, auctionLength) {
    const createAuctionTx = await auctioneer.createAuction(
      testToken.address,
      auctionAmountDesired,
      auctionLength
    )

    const receipt = await createAuctionTx.wait()
    const events = pastEvents(receipt, auctioneer, "AuctionCreated")
    const auctionAddress = events[0].args["auctionAddress"]

    return new ethers.Contract(auctionAddress, AuctionJSON.abi, owner)
  }
})
