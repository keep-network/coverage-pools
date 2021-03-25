const chai = require("chai")

const expect = chai.expect
const { pastEvents } = require("./helpers/contract-test-helpers")

const AuctionJSON = require("../artifacts/contracts/Auction.sol/Auction.json")

describe("Auction", () => {
  let auctionAmountDesired
  const auctionLength = 3600 // sec
  let testTokensToMint

  let auctioneer
  let testToken
  let masterAuction
  let owner
  let auctionAddress
  let signer1

  beforeEach(async () => {
    auctionAmountDesired = await ethers.utils.parseUnits("100", "ether") // coverts to wei
    testTokensToMint = await ethers.utils.parseUnits("500", "ether")

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

  describe("on offer", async () => {
    it("should return a portion of a collateral pool which is available for taken when auction length is 100", async () => {
      const auctionAmountDesired = 10000
      const auctionLength = 100

      const createAuctionTx = await auctioneer.createAuction(
        testToken.address,
        auctionAmountDesired,
        auctionLength
      )

      const receipt = await createAuctionTx.wait()
      const events = pastEvents(receipt, auctioneer, "AuctionCreated")
      const auctionAddress = events[0].args["auctionAddress"]

      const auction = new ethers.Contract(
        auctionAddress,
        AuctionJSON.abi,
        owner
      )

      expect(await auction.isOpen()).to.be.equal(true)

      // TODO: extract to a helper file
      // add 24 sec to current a block.timestamp
      await ethers.provider.send("evm_increaseTime", [24])
      await ethers.provider.send("evm_mine")

      const onOffer = await auction.onOffer()

      // auction length: 100sec
      // 24 sec passed, which means 24% of a collateral pool is on offer
      expect(onOffer[0] / onOffer[1]).to.be.closeTo(0.24, 0.01)
    })

    it("should return a portion of a collateral pool which is available for taken when auction length is 50", async () => {
      const auctionAmountDesired = await ethers.utils.parseUnits("10", "kwei") // coverts to wei
      const auctionLength = 50

      const createAuctionTx = await auctioneer.createAuction(
        testToken.address,
        auctionAmountDesired,
        auctionLength
      )

      const receipt = await createAuctionTx.wait()
      const events = pastEvents(receipt, auctioneer, "AuctionCreated")
      const auctionAddress = events[0].args["auctionAddress"]

      const auction = new ethers.Contract(
        auctionAddress,
        AuctionJSON.abi,
        owner
      )

      expect(await auction.isOpen()).to.be.equal(true)

      // TODO: extract to a helper file
      // add 24 sec to current a block.timestamp
      await ethers.provider.send("evm_increaseTime", [24])
      await ethers.provider.send("evm_mine")

      const onOffer = await auction.onOffer()

      // auction length: 50sec
      // 24 sec passed, which means 48% of a collateral pool is on offer
      expect(onOffer[0] / onOffer[1]).to.be.closeTo(0.48, 0.01)
    })
  })

  describe("take offer", async () => {
    it("should pay more than 0 tokens", async () => {
      const auction = new ethers.Contract(
        auctionAddress,
        AuctionJSON.abi,
        owner
      )
      await expect(auction.takeOffer(0)).to.be.revertedWith(
        "Can't pay 0 tokens"
      )
    })

    it("should take the entire auction", async () => {
      const paidAmount = auctionAmountDesired // 100% of the desired amount
      const auction = new ethers.Contract(
        auctionAddress,
        AuctionJSON.abi,
        owner
      )

      const testTokenAsSigner1 = await testToken.connect(signer1)
      await testTokenAsSigner1.approve(auction.address, auctionAmountDesired)

      const auctionAsSigner1 = await auction.connect(signer1)
      expect(await testToken.balanceOf(auctioneer.address)).to.be.equal(0)

      await auctionAsSigner1.takeOffer(paidAmount)

      // entire amount paid for an auction should be transferred to auctioneer
      expect(await testToken.balanceOf(auctioneer.address)).to.be.equal(
        paidAmount
      )

      // when a desired amount is collected, a contract should be destroyed
      expect(await ethers.provider.getCode(auctionAddress)).to.equal("0x")
    })

    it("should take a partial offer from the same signer", async () => {
      const auctionAmountDesired = 100000000 // 100,000,000 satoshi, which can mimics ex 1 TBTC
      const auctionLength = 86400 // 24h in sec

      const createAuctionTx = await auctioneer.createAuction(
        testToken.address,
        auctionAmountDesired,
        auctionLength
      )

      const receipt = await createAuctionTx.wait()
      const events = pastEvents(receipt, auctioneer, "AuctionCreated")
      const auctionAddress = events[0].args["auctionAddress"]

      const auction = new ethers.Contract(
        auctionAddress,
        AuctionJSON.abi,
        owner
      )

      const testTokenAsSigner1 = await testToken.connect(signer1)
      await testTokenAsSigner1.approve(auctionAddress, auctionAmountDesired)

      auctionAsSigner1 = await auction.connect(signer1)

      expect(await testToken.balanceOf(auctioneer.address)).to.be.equal(0)

      // For testing calculation purposes assume the auction start time is 0
      // On blockchain we calculate time diffs

      // Increase time 1h -> 3600sec
      await ethers.provider.send("evm_increaseTime", [3600])
      await ethers.provider.send("evm_mine")
      let onOfferObj = await auctionAsSigner1.onOffer()
      // Velocity pool depleating rate: 1
      // Percent on offer after 1h of auction start time: 3,600 * 1 * / 86,400 ~ 0.0416 +/- 0.0002 (evm delays)
      // ~4.16% on offer of a collateral pool after 1h
      expect(onOfferObj[0] / onOfferObj[1]).to.be.closeTo(0.0416, 0.0002)
      // Pay 50% of the desired amount for an auction 50,000,000
      let partialOfferAmount = auctionAmountDesired / 2
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
      await ethers.provider.send("evm_increaseTime", [2700])
      await ethers.provider.send("evm_mine")
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
      await ethers.provider.send("evm_increaseTime", [1200])
      await ethers.provider.send("evm_mine")
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
      expect(await ethers.provider.getCode(auctionAddress)).to.equal("0x")
    })

    it("should take a partial offer from multiple signers", async () => {
      // TODO: implement
    })
  })
})
