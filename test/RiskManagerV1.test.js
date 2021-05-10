const chai = require("chai")

const expect = chai.expect
const {
  to1e18,
  to1ePrecision,
  ZERO_ADDRESS,
} = require("./helpers/contract-test-helpers")

const Auction = require("../artifacts/contracts/Auction.sol/Auction.json")

const depositLiquidationInProgressState = 10
const depositLiquidatedState = 11
const auctionLotSize = to1e18(1)

describe("RiskManagerV1", () => {
  let testToken
  let owner
  let signerBondsProcessor
  let notifier
  let bidder
  let riskManagerV1
  let deposit

  before(async () => {
    const TestToken = await ethers.getContractFactory("TestToken")
    testToken = await TestToken.deploy()
    await testToken.deployed()

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

    owner = await ethers.getSigner(0)
    notifier = await ethers.getSigner(1)
    bidder = await ethers.getSigner(2)
  })

  beforeEach(async () => {
    const SignerBondsProcessorStub = await ethers.getContractFactory(
      "SignerBondsProcessorStub"
    )
    signerBondsProcessor = await SignerBondsProcessorStub.deploy()
    await signerBondsProcessor.deployed()

    const RiskManagerV1 = await ethers.getContractFactory("RiskManagerV1Stub")
    riskManagerV1 = await RiskManagerV1.deploy(
      testToken.address,
      signerBondsProcessor.address
    )
    await riskManagerV1.initialize(
      collateralPoolStub.address,
      masterAuction.address
    )
    await riskManagerV1.deployed()

    const DepositStub = await ethers.getContractFactory("DepositStub")
    deposit = await DepositStub.deploy()
    await deposit.deployed()
  })

  describe("notifyLiquidation", () => {
    context("when deposit is not in liquidation state", () => {
      it("should revert", async () => {
        await deposit.setCurrentState(4) // Active state

        await expect(
          riskManagerV1.notifyLiquidation(deposit.address)
        ).to.be.revertedWith("Deposit is not in liquidation state")
      })
    })

    context(
      "when deposit is in liquidation state and the surplus pool is empty",
      () => {
        let notifyLiquidationTx
        let auctionAddress
        let auction

        beforeEach(async () => {
          notifyLiquidationTx = await notifyLiquidation()

          auctionAddress = await riskManagerV1.auctionsByDepositsInLiquidation(
            deposit.address
          )

          auction = new ethers.Contract(auctionAddress, Auction.abi, owner)
        })

        it("should emit NotifiedLiquidation event", async () => {
          await expect(notifyLiquidationTx)
            .to.emit(riskManagerV1, "NotifiedLiquidation")
            .withArgs(deposit.address, notifier.address)
        })

        it("should create an auction ", async () => {
          expect(auctionAddress).to.be.properAddress
          expect(auctionAddress).to.not.equal(ZERO_ADDRESS)
        })

        it("should use deposit lot size as auction's amount", async () => {
          expect(await auction.amountOutstanding()).to.be.equal(to1e18(1))
        })

        it("should not use the surplus pool", async () => {
          expect(
            await riskManagerV1.tbtcSurplusReservations(auctionAddress)
          ).to.be.equal(0)
          expect(await riskManagerV1.tbtcSurplus()).to.be.equal(0)
        })
      }
    )

    context(
      "when deposit is in liquidation state and the surplus pool is " +
        "smaller than the deposit lot size",
      () => {
        let notifyLiquidationTx
        let auctionAddress
        let auction

        beforeEach(async () => {
          const surplus = to1ePrecision(30, 16)
          await testToken.mint(owner.address, surplus)
          await testToken.connect(owner).approve(riskManagerV1.address, surplus)
          await riskManagerV1.fundTbtcSurplus(surplus)

          notifyLiquidationTx = await notifyLiquidation()

          auctionAddress = await riskManagerV1.auctionsByDepositsInLiquidation(
            deposit.address
          )

          auction = new ethers.Contract(auctionAddress, Auction.abi, owner)
        })

        it("should emit NotifiedLiquidation event", async () => {
          await expect(notifyLiquidationTx)
            .to.emit(riskManagerV1, "NotifiedLiquidation")
            .withArgs(deposit.address, notifier.address)
        })

        it("should create an auction ", async () => {
          expect(auctionAddress).to.be.properAddress
          expect(auctionAddress).to.not.equal(ZERO_ADDRESS)
        })

        it("should use deposit lot size minus surplus as auction's amount", async () => {
          expect(await auction.amountOutstanding()).to.be.equal(
            to1ePrecision(70, 16)
          )
        })

        it("should use the entire surplus pool and make a surplus reservation", async () => {
          expect(
            await riskManagerV1.tbtcSurplusReservations(auctionAddress)
          ).to.be.equal(to1ePrecision(30, 16))
          expect(await riskManagerV1.tbtcSurplus()).to.be.equal(0)
        })
      }
    )

    context(
      "when deposit is in liquidation state and the surplus pool is " +
        "equal to the deposit lot size",
      () => {
        let notifyLiquidationTx
        let auctionAddress

        beforeEach(async () => {
          const surplus = to1e18(1)
          await testToken.mint(owner.address, surplus)
          await testToken.connect(owner).approve(riskManagerV1.address, surplus)
          await riskManagerV1.fundTbtcSurplus(surplus)

          // Set deposit's withdrawable amount.
          await owner.sendTransaction({
            to: deposit.address,
            value: ethers.utils.parseEther("10"),
          })

          notifyLiquidationTx = await notifyLiquidation()

          auctionAddress = await riskManagerV1.auctionsByDepositsInLiquidation(
            deposit.address
          )
        })

        it("should emit NotifiedLiquidation event", async () => {
          await expect(notifyLiquidationTx)
            .to.emit(riskManagerV1, "NotifiedLiquidation")
            .withArgs(deposit.address, notifier.address)
        })

        it("should not create an auction", async () => {
          expect(auctionAddress).to.equal(ZERO_ADDRESS)
        })

        it("should use the entire surplus pool", async () => {
          expect(await riskManagerV1.tbtcSurplus()).to.be.equal(0)
        })

        it("should purchase deposit signer bonds at auction", async () => {
          expect(await deposit.purchaser()).to.be.equal(riskManagerV1.address)
        })

        it("should withdraw deposit funds", async () => {
          await expect(notifyLiquidationTx)
            .to.emit(deposit, "FundsWithdrawn")
            .withArgs(riskManagerV1.address, ethers.utils.parseEther("10"))
        })

        it("should trigger signer bonds processing", async () => {
          await expect(notifyLiquidationTx)
            .to.emit(signerBondsProcessor, "SignerBondsProcessed")
            .withArgs(ethers.utils.parseEther("10"))

          await expect(notifyLiquidationTx).to.changeEtherBalance(
            riskManagerV1,
            0
          )

          await expect(notifyLiquidationTx).to.changeEtherBalance(
            signerBondsProcessor,
            ethers.utils.parseEther("10")
          )
        })
      }
    )

    context(
      "when deposit is in liquidation state and the surplus pool is " +
        "bigger than the deposit lot size",
      () => {
        let notifyLiquidationTx
        let auctionAddress

        beforeEach(async () => {
          const surplus = to1e18(5)
          await testToken.mint(owner.address, surplus)
          await testToken.connect(owner).approve(riskManagerV1.address, surplus)
          await riskManagerV1.fundTbtcSurplus(surplus)

          // Set deposit's withdrawable amount.
          await owner.sendTransaction({
            to: deposit.address,
            value: ethers.utils.parseEther("10"),
          })

          notifyLiquidationTx = await notifyLiquidation()

          auctionAddress = await riskManagerV1.auctionsByDepositsInLiquidation(
            deposit.address
          )
        })

        it("should emit NotifiedLiquidation event", async () => {
          await expect(notifyLiquidationTx)
            .to.emit(riskManagerV1, "NotifiedLiquidation")
            .withArgs(deposit.address, notifier.address)
        })

        it("should not create an auction", async () => {
          expect(auctionAddress).to.equal(ZERO_ADDRESS)
        })

        it("should use a part of the surplus pool", async () => {
          expect(await riskManagerV1.tbtcSurplus()).to.be.equal(to1e18(4))
        })

        it("should purchase deposit signer bonds at auction", async () => {
          expect(await deposit.purchaser()).to.be.equal(riskManagerV1.address)
        })

        it("should withdraw deposit funds", async () => {
          await expect(notifyLiquidationTx)
            .to.emit(deposit, "FundsWithdrawn")
            .withArgs(riskManagerV1.address, ethers.utils.parseEther("10"))
        })

        it("should trigger signer bonds processing", async () => {
          await expect(notifyLiquidationTx)
            .to.emit(signerBondsProcessor, "SignerBondsProcessed")
            .withArgs(ethers.utils.parseEther("10"))

          await expect(notifyLiquidationTx).to.changeEtherBalance(
            riskManagerV1,
            0
          )

          await expect(notifyLiquidationTx).to.changeEtherBalance(
            signerBondsProcessor,
            ethers.utils.parseEther("10")
          )
        })
      }
    )
  })

  describe("notifyLiquidated", () => {
    context("when deposit is not in liquidated state", () => {
      it("should revert", async () => {
        await deposit.setCurrentState(4) // Active state

        await expect(
          riskManagerV1.notifyLiquidated(deposit.address)
        ).to.be.revertedWith("Deposit is not in liquidated state")
      })
    })

    context("when deposit is in liquidated state", () => {
      let auctionAddress
      let auction

      beforeEach(async () => {
        await notifyLiquidation()

        auctionAddress = await riskManagerV1.auctionsByDepositsInLiquidation(
          deposit.address
        )

        // Simulate that tBTC surplus reservation has been done upon
        // auction creation.
        const surplusReservation = to1ePrecision(30, 16)
        await testToken.mint(owner.address, surplusReservation)
        await testToken
          .connect(owner)
          .approve(riskManagerV1.address, surplusReservation)
        await riskManagerV1.setTbtcSurplusReservation(
          auctionAddress,
          surplusReservation
        )

        // Simulate that someone takes a partial offer on the auction.
        await testToken.mint(bidder.address, auctionLotSize)
        await testToken.connect(bidder).approve(auctionAddress, auctionLotSize)
        auction = new ethers.Contract(auctionAddress, Auction.abi, owner)
        auction.connect(bidder).takeOffer(to1ePrecision(25, 16))

        // Simulate that deposit was liquidated by someone else.
        await deposit.setCurrentState(depositLiquidatedState)
      })

      it("should emit notified liquidated event", async () => {
        await expect(
          riskManagerV1.connect(notifier).notifyLiquidated(deposit.address)
        )
          .to.emit(riskManagerV1, "NotifiedLiquidated")
          .withArgs(deposit.address, notifier.address)
      })

      it("should properly update the surplus pool", async () => {
        await riskManagerV1.connect(notifier).notifyLiquidated(deposit.address)

        // Should return the surplus reservation taken upon creation (30 * 10^16)
        // plus the auction's transferred amount (25 * 10^16).
        expect(await riskManagerV1.tbtcSurplus()).to.be.equal(
          to1ePrecision(55, 16)
        )
        // Should cleanup surplus reservation data.
        expect(
          await riskManagerV1.tbtcSurplusReservations(auctionAddress)
        ).to.equal(ZERO_ADDRESS)
      })

      it("should early close an auction", async () => {
        await riskManagerV1.connect(notifier).notifyLiquidated(deposit.address)

        expect(
          await riskManagerV1.auctionsByDepositsInLiquidation(auctionAddress)
        ).to.equal(ZERO_ADDRESS)
        expect(await riskManagerV1.openAuctions(auctionAddress)).to.be.false
      })
    })
  })

  describe("actBeforeAuctionClose", () => {
    let auctionAddress
    let auction

    beforeEach(async () => {
      await testToken.mint(bidder.address, auctionLotSize)

      await notifyLiquidation(deposit.address)

      // Set deposit's withdrawable amount.
      await owner.sendTransaction({
        to: deposit.address,
        value: ethers.utils.parseEther("10"),
      })

      auctionAddress = await riskManagerV1.auctionsByDepositsInLiquidation(
        deposit.address
      )
      await testToken.connect(bidder).approve(auctionAddress, auctionLotSize)

      auction = new ethers.Contract(auctionAddress, Auction.abi, owner)
    })

    context("when the entire deposit was bought", () => {
      let tx

      beforeEach(async () => {
        // take entire auction
        tx = await auction.connect(bidder).takeOffer(auctionLotSize)
      })
      it("should delete auction from the auctions map", async () => {
        expect(
          await riskManagerV1.auctionsByDepositsInLiquidation(deposit.address)
        ).to.equal(ZERO_ADDRESS)
      })

      it("should delete deposit from the deposits map", async () => {
        expect(
          await riskManagerV1.depositsInLiquidationByAuctions(auctionAddress)
        ).to.equal(ZERO_ADDRESS)
      })

      it("should delete auction's surplus reservation", async () => {
        expect(
          await riskManagerV1.tbtcSurplusReservations(auctionAddress)
        ).to.equal(ZERO_ADDRESS)
      })

      it("should purchase deposit signer bonds at auction", async () => {
        expect(await deposit.purchaser()).to.be.equal(riskManagerV1.address)
      })

      it("should withdraw deposit funds", async () => {
        await expect(tx)
          .to.emit(deposit, "FundsWithdrawn")
          .withArgs(riskManagerV1.address, ethers.utils.parseEther("10"))
      })

      it("should trigger signer bonds processing", async () => {
        await expect(tx)
          .to.emit(signerBondsProcessor, "SignerBondsProcessed")
          .withArgs(ethers.utils.parseEther("10"))

        await expect(tx).to.changeEtherBalance(riskManagerV1, 0)

        await expect(tx).to.changeEtherBalance(
          signerBondsProcessor,
          ethers.utils.parseEther("10")
        )
      })
    })

    context("when the deposit was bought partially", () => {
      beforeEach(async () => {
        // take partial auction
        await auction.connect(bidder).takeOffer(auctionLotSize.sub(1))
      })
      it("should keep auction in the auction map", async () => {
        expect(
          await riskManagerV1.auctionsByDepositsInLiquidation(deposit.address)
        ).to.equal(auctionAddress)
      })

      it("should keep deposit in the deposits map", async () => {
        expect(
          await riskManagerV1.depositsInLiquidationByAuctions(auctionAddress)
        ).to.equal(deposit.address)
      })
    })
  })

  async function notifyLiquidation() {
    await deposit.setCurrentState(depositLiquidationInProgressState)
    await deposit.setLotSizeTbtc(auctionLotSize)
    const tx = await riskManagerV1
      .connect(notifier)
      .notifyLiquidation(deposit.address)
    return tx
  }
})
