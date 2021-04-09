const chai = require("chai")

const expect = chai.expect
const {
  to1e18,
  pastEvents,
  increaseTime,
} = require("./helpers/contract-test-helpers")

const AuctionJSON = require("../artifacts/contracts/Auction.sol/Auction.json")
const { BigNumber } = ethers

// amount of test tokens that an auction (aka spender) is allowed
// to transfer on behalf of a signer (aka token owner) from signer balance
const defaultAuctionTokenAllowance = to1e18(1)
const testTokensToMint = to1e18(1)

describe("Auction", () => {
  let testToken
  let owner
  let signer1
  let signer2
  let auctioneer
  let collateralPool

  before(async () => {
    const CoveragePoolConstants = await ethers.getContractFactory(
      "CoveragePoolConstants"
    )
    const coveragePoolConstants = await CoveragePoolConstants.deploy()
    await coveragePoolConstants.deployed()

    const Auctioneer = await ethers.getContractFactory("Auctioneer")
    const Auction = await ethers.getContractFactory("Auction", {
      libraries: {
        CoveragePoolConstants: coveragePoolConstants.address,
      },
    })
    const CollateralPool = await ethers.getContractFactory("CollateralPool")

    owner = await ethers.getSigner(0)
    signer1 = await ethers.getSigner(1)
    signer2 = await ethers.getSigner(2)

    auctioneer = await Auctioneer.deploy()
    await auctioneer.deployed()

    const masterAuction = await Auction.deploy()
    await masterAuction.deployed()

    collateralPool = await CollateralPool.deploy()
    await collateralPool.deployed()

    await auctioneer.initialize(collateralPool.address, masterAuction.address)
  })

  beforeEach(async () => {
    const TestToken = await ethers.getContractFactory("TestToken")
    testToken = await TestToken.deploy()

    await testToken.mint(owner.address, testTokensToMint)
    await testToken.mint(signer1.address, testTokensToMint)
    await testToken.mint(signer2.address, testTokensToMint)
    await testToken.approve(signer1.address, testTokensToMint)
    await testToken.approve(signer2.address, testTokensToMint)
  })

  describe("initialize", () => {
    const auctionLength = 86400 // 24h in sec
    const auctionAmountDesired = to1e18(1) // ex. 1 TBTC

    context("when the auction has been initialized", () => {
      it("should be opened", async () => {
        auction = await createAuction(auctionAmountDesired, auctionLength)

        expect(await auction.isOpen()).to.equal(true)
      })

      it("should not be initialized again", async () => {
        auction = await createAuction(auctionAmountDesired, auctionLength)
        await approveTestTokenForAuction(auction.address)

        await expect(
          auction.initialize(
            auctioneer.address,
            testToken.address,
            auctionAmountDesired,
            auctionLength
          )
        ).to.be.revertedWith("Auction already initialized")
      })
    })

    context("when desired amount is zero", () => {
      it("should revert", async () => {
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

  describe("onOffer", () => {
    context("when the auction starts", () => {
      it("should return zero", async () => {
        const auctionAmountDesired = 10000
        const auctionLength = 100000 // sec -> ~28h
        const auction = await createAuction(auctionAmountDesired, auctionLength)

        expect(await auction.isOpen()).to.be.equal(true)

        const onOffer = await auction.onOffer()

        expect(onOffer[0] / onOffer[1]).to.be.closeTo(0, 0.00001) // 'closeTo' because of evm delays
      })
    })

    context("when the auction is over", () => {
      beforeEach(async () => {
        const auctionAmountDesired = 10000
        const auctionLength = 50000 // sec -> ~14h
        auction = await createAuction(auctionAmountDesired, auctionLength)

        await increaseTime(auctionLength)
      })

      it("should return the entire pool at the auction's end time", async () => {
        const onOffer = await auction.onOffer()

        // when the auction is over, entire pool is available for taken
        expect(onOffer[0] / onOffer[1]).to.equal(1)

        expect(await auction.isOpen()).to.be.equal(true)
      })

      it("should still return 100% of the pool as the time passes", async () => {
        // add 100sec
        await increaseTime(100)
        const onOffer = await auction.onOffer()

        // increasing time should not affect the portion of the pool on offer
        expect(onOffer[0] / onOffer[1]).to.equal(1)

        expect(await auction.isOpen()).to.be.equal(true)
      })
    })

    context("when the auction is not over", () => {
      beforeEach(async () => {
        const auctionAmountDesired = 10000
        const auctionLength = 100000 // sec -> ~28h
        auction = await createAuction(auctionAmountDesired, auctionLength)

        await increaseTime(24000)
      })

      it("should return a portion of a collateral pool", async () => {
        expect(await auction.isOpen()).to.be.equal(true)

        const onOffer = await auction.onOffer()

        // auction length: 100000 sec
        // 24000 sec passed, which means 24% of a collateral pool is on offer
        expect(onOffer[0] / onOffer[1]).to.be.closeTo(0.24, 0.01)
      })

      it("should increase on offer value over time", async () => {
        expect(await auction.isOpen()).to.be.equal(true)

        await increaseTime(26000)
        const onOffer = await auction.onOffer()

        // auction length: 100000 sec
        // 50000 sec passed, which means 50% of a collateral pool is on offer
        expect(onOffer[0] / onOffer[1]).to.be.closeTo(0.5, 0.01)
      })
    })
  })

  describe("takeOfferWithMin", () => {
    const auctionLength = 86400 // 24h in sec
    const auctionAmountDesired = to1e18(1) // ex. 1 TBTC
    // Pay 75% of the desired amount for the auction 0.75 * 10^18
    const partialOfferAmount = BigNumber.from(75).mul(
      BigNumber.from(10).pow(16)
    )

    beforeEach(async () => {
      auction = await createAuction(auctionAmountDesired, auctionLength)
      await approveTestTokenForAuction(auction.address)

      await auction.connect(signer1).takeOffer(partialOfferAmount)
      expect(await testToken.balanceOf(auctioneer.address)).to.be.equal(
        partialOfferAmount
      )

      // at this point auction's outstanding amount is equal to:
      // (1 - 0.75) * 10^18 = 0.25 * 10^18
    })

    context(
      "when outstanding amount is equal or greater than a minimum amount to take",
      () => {
        it("should take all outstanding amount", async () => {
          const minAmount = BigNumber.from(25).mul(BigNumber.from(10).pow(16)) // 0.25 * 10^18

          // signer2 wants to take 0.75 * 10^18, which is more than the outstanding amount
          // but the minAmount 0.25 * 10^18 <= outstanding amount
          await auction
            .connect(signer2)
            .takeOfferWithMin(partialOfferAmount, minAmount)
          // auctioneer should receive the auction's desired amount
          expect(await testToken.balanceOf(auctioneer.address)).to.be.equal(
            auctionAmountDesired
          )

          // (1 - 0.25) * 10^18
          const expectedBalanceSigner2 = BigNumber.from(75).mul(
            BigNumber.from(10).pow(16)
          )
          expect(await testToken.balanceOf(signer2.address)).to.be.equal(
            expectedBalanceSigner2
          )
        })
      }
    )

    context(
      "when outstanding amount is less than a minimum amount to take",
      () => {
        it("should revert", async () => {
          // minAmount: 0.25 * 10^18 + 1
          const minAmount = BigNumber.from(25)
            .mul(BigNumber.from(10).pow(16))
            .add(BigNumber.from(1))

          // signer2 wants to take 0.75 * 10^18, which is more than the outstanding amount
          // minAmount is also greater than the outstanding amount
          await expect(
            auction
              .connect(signer2)
              .takeOfferWithMin(partialOfferAmount, minAmount)
          ).to.be.revertedWith("Can't fulfill minimum offer")
        })
      }
    )
  })

  describe("takeOffer", () => {
    const auctionLength = 86400 // 24h in sec
    const auctionAmountDesired = to1e18(1) // ex. 1 TBTC

    beforeEach(async () => {
      auction = await createAuction(auctionAmountDesired, auctionLength)
      await approveTestTokenForAuction(auction.address)
    })

    context("when paying zero amount for the auction", () => {
      it("should revert", async () => {
        await expect(auction.takeOffer(0)).to.be.revertedWith(
          "Can't pay 0 tokens"
        )
      })
    })

    context("when the auction is not over and paying the entire amount", () => {
      it("should take the entire auction and self-destruct", async () => {
        expect(await testToken.balanceOf(auctioneer.address)).to.be.equal(0)

        // Increase time 1h -> 3600sec
        await increaseTime(3600)

        await auction.connect(signer1).takeOffer(auctionAmountDesired)

        // entire amount paid for an auction should be transferred to auctioneer
        expect(await testToken.balanceOf(auctioneer.address)).to.be.equal(
          auctionAmountDesired
        )

        // when a desired amount is collected, the auction should be destroyed
        expect(await ethers.provider.getCode(auction.address)).to.equal("0x")
      })
    })

    context("when desired to take more than the outstanding amount", () => {
      it("should take only the outstanding amount", async () => {
        // Pay 25% of the desired amount for the auction 0.25
        const partialOfferAmount = auctionAmountDesired.div(BigNumber.from("4"))
        await auction.connect(signer1).takeOffer(partialOfferAmount)
        expect(await testToken.balanceOf(auctioneer.address)).to.be.equal(
          partialOfferAmount
        )

        // at this point auction's outstanding amount is equal to:
        // (1 - 0.25) * 10^18 = 0.75 * 10^18
        const outstandingAmount = auctionAmountDesired.sub(partialOfferAmount)
        // signer2 is trying to take more than the outstanding amount 1 * 10^18
        const exceededOfferAmount = to1e18(1)
        await auction.connect(signer2).takeOffer(exceededOfferAmount)
        // auctioneer should receive no more than initial auction's desired amount
        expect(await testToken.balanceOf(auctioneer.address)).to.be.equal(
          auctionAmountDesired
        )

        const expectedBalanceSigner2 = exceededOfferAmount.sub(
          outstandingAmount
        )
        expect(await testToken.balanceOf(signer2.address)).to.be.equal(
          expectedBalanceSigner2
        )
      })

      it("should not exceed portion to seize that is on offer", async () => {
        // Increase time 1h -> 3600sec
        await increaseTime(3600)

        // Offer twice the amount that needed to buy the auction
        const exceededOfferAmount = auctionAmountDesired.mul(2)
        const takeOfferTx = await auction
          .connect(signer1)
          .takeOffer(exceededOfferAmount)

        const receipt = await takeOfferTx.wait()
        const events = pastEvents(receipt, auctioneer, "AuctionOfferTaken")
        // Available portion to seize after 1h:
        // 3,600 / 86,400 ~ 0.0416 +/- 0.0002 (evm delays)
        const portionToSeize = BigNumber.from("41600") // 0.0416 * 100000 (divisor)
        // Paying more than outstanding amount must not affect pool's portion to seize
        expect(events[0].args["portionToSeize"]).to.be.closeTo(
          portionToSeize,
          200
        )
      })
    })

    context("when the auction is not over and filling it partially", () => {
      it("should take a partial offer from the same taker", async () => {
        expect(await testToken.balanceOf(auctioneer.address)).to.be.equal(0)

        // For testing calculation purposes assume the auction start time is 0
        // On blockchain we calculate the time diffs

        // Increase time 1h -> 3600sec
        await increaseTime(3600)
        let onOfferObj = await auction.connect(signer1).onOffer()
        // Velocity pool depleting rate: 1
        // Percent on offer after 1h of auction start time: 3,600 * 1 / 86,400 ~ 0.0416 +/- 0.0002 (evm delays)
        // ~4.16% on offer of a collateral pool after 1h
        expect(onOfferObj[0] / onOfferObj[1]).to.be.closeTo(0.0416, 0.0002)
        // Pay 50% of the desired amount for the auction 0.5 * 10^18
        let partialOfferAmount = auctionAmountDesired.div(BigNumber.from("2"))
        const expectedAuctioneerBalance = partialOfferAmount
        await auction.connect(signer1).takeOffer(partialOfferAmount)
        expect(await testToken.balanceOf(auctioneer.address)).to.be.equal(
          expectedAuctioneerBalance
        )

        // Ratio amount paid: 0.5 / 1 = 0.5
        // Updated start time: 0 + (3,600 - 0) * 0.5 = 1,800
        // Velocity pool depleting rate: 86,400 / (86,400 - 1,800) ~ 1.0212
        // Availability of assets in the collateral pool: 100% - (4.16% / 2) = 97.92%

        // Increase time 45min -> 2,700 sec
        // Now: 3,600 + 2,700 = 6,300
        await increaseTime(2700)
        // (6,300 - 1,800) * 1.0212 / 86,400 = 0.0531875 +/- 0.0002
        // ~5.31% on offer of a collateral pool after 1h45min
        onOfferObj = await auction.connect(signer1).onOffer()
        expect(onOfferObj[0] / onOfferObj[1]).to.be.closeTo(0.0531, 0.0002)

        // Pay 20% of the remaining amount for an auction 0.5 * 10^18 / 5 = 0.1 * 10^18
        partialOfferAmount = partialOfferAmount.div(BigNumber.from("5"))
        // Auctioneer balance: (0.5 + 0.1) => 0.6 * 10^18
        auctioneerBalance = expectedAuctioneerBalance.add(partialOfferAmount)
        await auction.connect(signer1).takeOffer(partialOfferAmount)
        expect(await testToken.balanceOf(auctioneer.address)).to.be.equal(
          auctioneerBalance
        )

        // Ratio amount paid: 0.1 / 0.5 = 0.2
        // Updated start time: 1,800 + (6,300 - 1,800) * 0.2 = 2,700
        // Velocity pool depleting rate: 86,400 / (86,400 - 2,700) ~ 1.03225
        // Availability of assets in a collateral pool: 97.92% - (5.31% * 0.2) ~ 96.86%

        // Increase time 20min -> 1,200 sec
        // Now: 6,300 + 1,200 = 7,500
        await increaseTime(1200)
        // 60% of the desired amount was paid. 0.5 + 0.1 out of 1
        onOfferObj = await auction.connect(signer1).onOffer()
        expect(onOfferObj[0] / onOfferObj[1]).to.be.closeTo(0.0573, 0.0002)
        // Buy the rest and close the auction 1 - 0.6 => 0.4 * 10^18
        partialOfferAmount = auctionAmountDesired.sub(auctioneerBalance)
        await auction.connect(signer1).takeOffer(partialOfferAmount)
        expect(await testToken.balanceOf(auctioneer.address)).to.be.equal(
          auctionAmountDesired
        )

        // when a desired amount is collected, this auction should be destroyed
        expect(await ethers.provider.getCode(auction.address)).to.equal("0x")
      })

      it("should take a partial offer from multiple takers", async () => {
        // Auction amount desired: 1 * 10^18
        // Increase time 1h -> 3600sec
        await increaseTime(3600)

        let onOfferObj = await auction.connect(signer1).onOffer()
        // Velocity pool depleting rate: 1
        // Percent on offer after 1h of auction start time: 3,600 * 1 / 86,400 ~ 0.0416 +/- 0.0002 (evm delays)
        // ~4.16% on offer of a collateral pool after 1h
        expect(onOfferObj[0] / onOfferObj[1]).to.be.closeTo(0.0416, 0.0002)
        // Pay 25% of the desired amount for the auction: 0.25 * 10^18
        const partialOfferAmount = auctionAmountDesired.div(BigNumber.from("4"))
        await auction.connect(signer1).takeOffer(partialOfferAmount)
        expect(await testToken.balanceOf(auctioneer.address)).to.be.equal(
          partialOfferAmount
        )

        // Ratio amount paid: 0.25 / 1 = 0.25
        // Updated start time: 0 + (3,600 - 0) * 0.25 = 900
        // Velocity pool depleting rate: 86,400 / (86,400 - 900) ~ 1.0105
        // Availability of assets in the collateral pool: 100% - (4.16% / 4) = 98.96%

        // Increase time 15min -> 900 sec
        // Now: 3,600 + 900 = 4,500
        await increaseTime(900)
        // onOffer: (now - updated start time) * velocity rate / auction length
        // (4,500 - 900) * 1.0105 / 86,400 = 0.0421041 +/- 0.0002
        // ~4.21% on offer of a collateral pool after 1h15min
        onOfferObj = await auction.connect(signer2).onOffer()
        expect(onOfferObj[0] / onOfferObj[1]).to.be.closeTo(0.0421, 0.0002)

        // Pay the rest of the remaining auction 0.75 * 10^18
        const amountOutstanding = await auction
          .connect(signer2)
          .amountOutstanding()
        expect(amountOutstanding).to.equal(
          auctionAmountDesired.sub(partialOfferAmount)
        )
        await auction.connect(signer2).takeOffer(amountOutstanding)
        expect(await testToken.balanceOf(auctioneer.address)).to.be.equal(
          auctionAmountDesired
        )

        // when a desired amount is collected, this auction should be destroyed
        expect(await ethers.provider.getCode(auction.address)).to.equal("0x")
      })
    })

    context("when the auction is over and paying a partial amount", () => {
      it("should take a partial offer when the auction is over", async () => {
        // Auction length 24h -> 86400sec

        // Increase time 1h -> 3600sec
        await increaseTime(3600)
        let onOfferObj = await auction.connect(signer1).onOffer()
        // Velocity pool depleting rate: 1
        // Percent on offer after 1h of auction start time: 3,600 * 1 / 86,400 ~ 0.0416 +/- 0.0002 (evm delays)
        // ~4.16% on offer of a collateral pool after 1h
        expect(onOfferObj[0] / onOfferObj[1]).to.be.closeTo(0.0416, 0.0002)
        // Pay 50% of the desired amount for an auction 0.5 * 10^18
        let partialOfferAmount = auctionAmountDesired.div(BigNumber.from("2"))
        const expectedAuctioneerBalance = partialOfferAmount
        await auction.connect(signer1).takeOffer(partialOfferAmount)
        expect(await testToken.balanceOf(auctioneer.address)).to.be.equal(
          expectedAuctioneerBalance
        )

        // Increase time 23h -> 82,800sec
        // Now: 3,600 + 82,800 = 86400sec (auction ends)
        await increaseTime(82800)
        // when auction ends, entire pool becomes available
        onOfferObj = await auction.connect(signer1).onOffer()
        expect(onOfferObj[0] / onOfferObj[1]).to.equal(1)

        // Pay 20% of the remaining amount for the auction 0.5 * 10^18 / 5 = 0.1 * 10^18
        partialOfferAmount = partialOfferAmount.div(BigNumber.from("5"))
        // Auctioneer balance: (0.5 + 0.1) => 0.6 * 10^18
        auctioneerBalance = expectedAuctioneerBalance.add(partialOfferAmount)
        await auction.connect(signer1).takeOffer(partialOfferAmount)
        expect(await testToken.balanceOf(auctioneer.address)).to.be.equal(
          auctioneerBalance
        )

        // Increase time 1h -> 3,600sec
        // Now: 86,400 + 3,600 = 90,000
        await increaseTime(3600)
        // no matter how much time has passed since the auction ended, on offer
        // should be 1 until it is closed
        onOfferObj = await auction.connect(signer1).onOffer()
        expect(onOfferObj[0] / onOfferObj[1]).to.equal(1)
        // 60% of the desired amount was paid. 0.5 + 0.1 out of 1
        // Buy the rest and close the auction 1 - 0.6 => 0.4 * 10^18
        partialOfferAmount = auctionAmountDesired.sub(auctioneerBalance)
        await auction.connect(signer1).takeOffer(partialOfferAmount)

        // when a desired amount is collected, this auction should be destroyed
        expect(await ethers.provider.getCode(auction.address)).to.equal("0x")
      })
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

  async function approveTestTokenForAuction(auctionAddress) {
    await testToken
      .connect(signer1)
      .approve(auctionAddress, defaultAuctionTokenAllowance)

    await testToken
      .connect(signer2)
      .approve(auctionAddress, defaultAuctionTokenAllowance)
  }
})
