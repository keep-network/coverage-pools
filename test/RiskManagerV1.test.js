const chai = require("chai")

const expect = chai.expect
const {
  to1e18,
  ZERO_ADDRESS,
  increaseTime,
} = require("./helpers/contract-test-helpers")

const { deployMockContract } = require("@ethereum-waffle/mock-contract")
const IDeposit = require("../artifacts/contracts/RiskManagerV1.sol/IDeposit.json")

const depositLiquidationInProgressState = 10
const depositLiquidatedState = 11
const auctionLotSize = to1e18(1)
const auctionLength = 86400 // 24h
const collateralizationThreshold = 101

describe("RiskManagerV1", () => {
  let testToken
  let signerBondsSwapStrategy
  let owner
  let notifier
  let riskManagerV1
  let mockIDeposit

  beforeEach(async () => {
    const TestToken = await ethers.getContractFactory("TestToken")
    testToken = await TestToken.deploy()
    await testToken.deployed()

    const SignerBondsSwapStrategy = await ethers.getContractFactory(
      "SignerBondsEscrow"
    )
    signerBondsSwapStrategy = await SignerBondsSwapStrategy.deploy()
    await signerBondsSwapStrategy.deployed()

    // TODO: Another type of strategy could be used
    anotherSignerBondsSwapStrategy = await SignerBondsSwapStrategy.deploy()
    await anotherSignerBondsSwapStrategy.deployed()

    const Auction = await ethers.getContractFactory("Auction")
    const CoveragePoolStub = await ethers.getContractFactory("CoveragePoolStub")
    const coveragePoolStub = await CoveragePoolStub.deploy()
    await coveragePoolStub.deployed()

    masterAuction = await Auction.deploy()
    await masterAuction.deployed()

    const RiskManagerV1 = await ethers.getContractFactory("RiskManagerV1")
    riskManagerV1 = await RiskManagerV1.deploy(
      testToken.address,
      coveragePoolStub.address,
      signerBondsSwapStrategy.address,
      masterAuction.address,
      auctionLength,
      collateralizationThreshold
    )
    await riskManagerV1.deployed()

    owner = await ethers.getSigner(0)
    notifier = await ethers.getSigner(1)

    mockIDeposit = await deployMockContract(owner, IDeposit.abi)
  })

  describe("notifyLiquidation", () => {
    context("when deposit is not in liquidation state", () => {
      it("should revert", async () => {
        await mockIDeposit.mock.currentState.returns(4) // Active state

        await expect(
          riskManagerV1.notifyLiquidation(mockIDeposit.address)
        ).to.be.revertedWith("Deposit is not in liquidation state")
      })
    })

    context("when deposit is above collateralization threshold level", () => {
      it("should revert", async () => {
        await mockIDeposit.mock.currentState.returns(
          depositLiquidationInProgressState
        )
        await mockIDeposit.mock.collateralizationPercentage.returns(
          collateralizationThreshold + 1
        )
        await expect(
          riskManagerV1.notifyLiquidation(mockIDeposit.address)
        ).to.be.revertedWith(
          "Deposit collateralization is above the threshold level"
        )
      })
    })

    context(
      "when deposit is in liquidation state and at the collateralization threshold",
      () => {
        let notifyLiquidationTx

        beforeEach(async () => {
          notifyLiquidationTx = await notifyLiquidation()
        })

        it("should emit NotifiedLiquidation event", async () => {
          await expect(notifyLiquidationTx)
            .to.emit(riskManagerV1, "NotifiedLiquidation")
            .withArgs(mockIDeposit.address, notifier.address)
        })

        it("should create an auction and populate auction's map", async () => {
          const createdAuctionAddress = await riskManagerV1.depositToAuction(
            mockIDeposit.address
          )

          expect(createdAuctionAddress).to.be.properAddress
          expect(createdAuctionAddress).to.not.equal(ZERO_ADDRESS)
        })
      }
    )
  })

  describe("notifyLiquidated", () => {
    context("when deposit is not in liquidated state", () => {
      it("should revert", async () => {
        await mockIDeposit.mock.currentState.returns(4) // Active state

        await expect(
          riskManagerV1.notifyLiquidated(mockIDeposit.address)
        ).to.be.revertedWith("Deposit is not in liquidated state")
      })
    })

    context("when deposit is in liquidated state", () => {
      beforeEach(async () => {
        await notifyLiquidation()
        await mockIDeposit.mock.currentState.returns(depositLiquidatedState)
      })

      it("should emit notified liquidated event", async () => {
        await expect(
          riskManagerV1.connect(notifier).notifyLiquidated(mockIDeposit.address)
        )
          .to.emit(riskManagerV1, "NotifiedLiquidated")
          .withArgs(mockIDeposit.address, notifier.address)
      })

      it("should early close an auction", async () => {
        const createdAuctionAddress = await riskManagerV1.depositToAuction(
          mockIDeposit.address
        )

        await riskManagerV1
          .connect(notifier)
          .notifyLiquidated(mockIDeposit.address)

        expect(
          await riskManagerV1.depositToAuction(createdAuctionAddress)
        ).to.equal(ZERO_ADDRESS)
        expect(await riskManagerV1.openAuctions(createdAuctionAddress)).to.be
          .false
      })
    })
  })

  describe("beginAuctionLengthUpdate", () => {
    context("when the caller is the owner", () => {
      const currentAuctionLength = auctionLength
      const newAuctionLength = 172800 // 48h
      let tx

      beforeEach(async () => {
        tx = await riskManagerV1
          .connect(owner)
          .beginAuctionLengthUpdate(newAuctionLength)
      })

      it("should not update the auction length", async () => {
        expect(await riskManagerV1.auctionLength()).to.be.equal(
          currentAuctionLength
        )
      })

      it("should start the governance delay timer", async () => {
        expect(
          await riskManagerV1.getRemainingAuctionLengthUpdateTime()
        ).to.be.equal(43200) // 12h contract governance delay
      })

      it("should emit the AuctionLengthUpdateStarted event", async () => {
        const blockTimestamp = (await ethers.provider.getBlock(tx.blockNumber))
          .timestamp
        await expect(tx)
          .to.emit(riskManagerV1, "AuctionLengthUpdateStarted")
          .withArgs(newAuctionLength, blockTimestamp)
      })
    })

    context("when the caller is not the owner", () => {
      it("should revert", async () => {
        await expect(
          riskManagerV1.connect(notifier).beginAuctionLengthUpdate(172800)
        ).to.be.revertedWith("Ownable: caller is not the owner")
      })
    })
  })

  describe("finalizeAuctionLengthUpdate", () => {
    const newAuctionLength = 172800 // 48h

    context(
      "when the update process is initialized, governance delay passed, " +
        "and the caller is the owner",
      () => {
        let tx

        beforeEach(async () => {
          await riskManagerV1
            .connect(owner)
            .beginAuctionLengthUpdate(newAuctionLength)

          await increaseTime(43200) // +12h contract governance delay

          tx = await riskManagerV1.connect(owner).finalizeAuctionLengthUpdate()
        })

        it("should update the auction length", async () => {
          expect(await riskManagerV1.auctionLength()).to.be.equal(
            newAuctionLength
          )
        })

        it("should emit AuctionLengthUpdated event", async () => {
          await expect(tx)
            .to.emit(riskManagerV1, "AuctionLengthUpdated")
            .withArgs(newAuctionLength)
        })

        it("should reset the governance delay timer", async () => {
          await expect(
            riskManagerV1.getRemainingAuctionLengthUpdateTime()
          ).to.be.revertedWith("Update not initiated")
        })
      }
    )

    context("when the governance delay is not passed", () => {
      it("should revert", async () => {
        await riskManagerV1
          .connect(owner)
          .beginAuctionLengthUpdate(newAuctionLength)

        await increaseTime(39600) // +11h

        await expect(
          riskManagerV1.connect(owner).finalizeAuctionLengthUpdate()
        ).to.be.revertedWith("Governance delay has not elapsed")
      })
    })

    context("when the caller is not the owner", () => {
      it("should revert", async () => {
        await expect(
          riskManagerV1.connect(notifier).finalizeAuctionLengthUpdate()
        ).to.be.revertedWith("Ownable: caller is not the owner")
      })
    })

    context("when the update process is not initialized", () => {
      it("should revert", async () => {
        await expect(
          riskManagerV1.connect(owner).finalizeAuctionLengthUpdate()
        ).to.be.revertedWith("Change not initiated")
      })
    })
  })

  describe("beginCollateralizationThresholdUpdate", () => {
    context("when the caller is the owner", () => {
      const currentCollateralizationThreshold = collateralizationThreshold
      const newCollateralizationThreshold = 102
      let tx

      beforeEach(async () => {
        tx = await riskManagerV1
          .connect(owner)
          .beginCollateralizationThresholdUpdate(newCollateralizationThreshold)
      })

      it("should not update collateralization threshold", async () => {
        expect(await riskManagerV1.collateralizationThreshold()).to.be.equal(
          currentCollateralizationThreshold
        )
      })

      it("should start the governance delay timer", async () => {
        expect(
          await riskManagerV1.getRemainingCollateralizationThresholdUpdateTime()
        ).to.be.equal(43200) // 12h contract governance delay
      })

      it("should emit the CollateralizationThresholdUpdateStarted event", async () => {
        const blockTimestamp = (await ethers.provider.getBlock(tx.blockNumber))
          .timestamp
        await expect(tx)
          .to.emit(riskManagerV1, "CollateralizationThresholdUpdateStarted")
          .withArgs(newCollateralizationThreshold, blockTimestamp)
      })
    })

    context("when the caller is not the owner", () => {
      it("should revert", async () => {
        await expect(
          riskManagerV1
            .connect(notifier)
            .beginCollateralizationThresholdUpdate(102)
        ).to.be.revertedWith("Ownable: caller is not the owner")
      })
    })
  })

  describe("finalizeCollateralizationThresholdUpdate", () => {
    const newCollateralizationThreshold = 102

    context(
      "when the update process is initialized, governance delay has passed, " +
        "and the caller is the owner",
      () => {
        let tx

        beforeEach(async () => {
          await riskManagerV1
            .connect(owner)
            .beginCollateralizationThresholdUpdate(
              newCollateralizationThreshold
            )

          await increaseTime(43200) // +12h contract governance delay

          tx = await riskManagerV1
            .connect(owner)
            .finalizeCollateralizationThresholdUpdate()
        })

        it("should update the collateralization threshold", async () => {
          expect(await riskManagerV1.collateralizationThreshold()).to.be.equal(
            newCollateralizationThreshold
          )
        })

        it("should emit CollateralizationThresholdUpdated event", async () => {
          await expect(tx)
            .to.emit(riskManagerV1, "CollateralizationThresholdUpdated")
            .withArgs(newCollateralizationThreshold)
        })

        it("should reset the governance delay timer", async () => {
          await expect(
            riskManagerV1.getRemainingCollateralizationThresholdUpdateTime()
          ).to.be.revertedWith("Update not initiated")
        })
      }
    )

    context("when the governance delay has not passed", () => {
      it("should revert", async () => {
        await riskManagerV1
          .connect(owner)
          .beginCollateralizationThresholdUpdate(newCollateralizationThreshold)

        await increaseTime(39600) // +11h

        await expect(
          riskManagerV1
            .connect(owner)
            .finalizeCollateralizationThresholdUpdate()
        ).to.be.revertedWith("Governance delay has not elapsed")
      })
    })

    context("when the caller is not the owner", () => {
      it("should revert", async () => {
        await expect(
          riskManagerV1
            .connect(notifier)
            .finalizeCollateralizationThresholdUpdate()
        ).to.be.revertedWith("Ownable: caller is not the owner")
      })
    })

    context("when the update process is not initialized", () => {
      it("should revert", async () => {
        await expect(
          riskManagerV1
            .connect(owner)
            .finalizeCollateralizationThresholdUpdate()
        ).to.be.revertedWith("Change not initiated")
      })
    })
  })

  describe("beginSignerBondsSwapStrategyUpdate", () => {
    context("when the caller is the owner", () => {
      let tx
      beforeEach(async () => {
        tx = await riskManagerV1
          .connect(owner)
          .beginSignerBondsSwapStrategyUpdate(
            anotherSignerBondsSwapStrategy.address
          )
      })

      it("should not update the signerBondsSwapStrategy", async () => {
        expect(await riskManagerV1.signerBondsSwapStrategy()).to.be.equal(
          signerBondsSwapStrategy.address
        )
      })

      it("should start the governance delay timer", async () => {
        expect(
          await riskManagerV1.getRemainingSignerBondsSwapStrategyChangeTime()
        ).to.be.equal(43200) // 12h contract governance delay
      })

      it("should emit the SignerBondsSwapStrategyUpdateStarted event", async () => {
        const blockTimestamp = (await ethers.provider.getBlock(tx.blockNumber))
          .timestamp
        await expect(tx)
          .to.emit(riskManagerV1, "SignerBondsSwapStrategyUpdateStarted")
          .withArgs(anotherSignerBondsSwapStrategy.address, blockTimestamp)
      })
    })

    context("when the caller is not the owner", () => {
      it("should revert", async () => {
        await expect(
          riskManagerV1
            .connect(notifier)
            .beginSignerBondsSwapStrategyUpdate(
              anotherSignerBondsSwapStrategy.address
            )
        ).to.be.revertedWith("Ownable: caller is not the owner")
      })
    })
  })

  describe("finalizeSignerBondsSwapStrategyUpdate", () => {
    context(
      "when the change process is initialized, governance delay passed, " +
        "and the caller is the owner",
      () => {
        let tx

        beforeEach(async () => {
          await riskManagerV1
            .connect(owner)
            .beginSignerBondsSwapStrategyUpdate(
              anotherSignerBondsSwapStrategy.address
            )

          await increaseTime(43200) // +12h contract governance delay

          tx = await riskManagerV1
            .connect(owner)
            .finalizeSignerBondsSwapStrategyUpdate()
        })

        it("should update the signer bonds swap strategy", async () => {
          expect(await riskManagerV1.signerBondsSwapStrategy()).to.be.equal(
            anotherSignerBondsSwapStrategy.address
          )
        })

        it("should emit SignerBondsSwapStrategyUpdated event", async () => {
          await expect(tx)
            .to.emit(riskManagerV1, "SignerBondsSwapStrategyUpdated")
            .withArgs(anotherSignerBondsSwapStrategy.address)
        })

        it("should reset the governance delay timer", async () => {
          await expect(
            riskManagerV1.getRemainingSignerBondsSwapStrategyChangeTime()
          ).to.be.revertedWith("Update not initiated")
        })

        it("should reset new signer bonds swap strategy", async () => {
          expect(await riskManagerV1.newSignerBondsSwapStrategy()).to.be.equal(
            ZERO_ADDRESS
          )
        })
      }
    )

    context("when the governance delay has not passed", () => {
      it("should revert", async () => {
        await riskManagerV1
          .connect(owner)
          .beginSignerBondsSwapStrategyUpdate(
            anotherSignerBondsSwapStrategy.address
          )

        await increaseTime(39600) // +11h

        await expect(
          riskManagerV1.connect(owner).finalizeSignerBondsSwapStrategyUpdate()
        ).to.be.revertedWith("Governance delay has not elapsed")
      })
    })

    context("when the caller is not the owner", () => {
      it("should revert", async () => {
        await expect(
          riskManagerV1
            .connect(notifier)
            .finalizeSignerBondsSwapStrategyUpdate()
        ).to.be.revertedWith("Ownable: caller is not the owner")
      })
    })

    context("when the update process is not initialized", () => {
      it("should revert", async () => {
        await expect(
          riskManagerV1.connect(owner).finalizeSignerBondsSwapStrategyUpdate()
        ).to.be.revertedWith("Change not initiated")
      })
    })
  })

  async function notifyLiquidation() {
    await mockIDeposit.mock.currentState.returns(
      depositLiquidationInProgressState
    )
    await mockIDeposit.mock.lotSizeTbtc.returns(auctionLotSize)
    await mockIDeposit.mock.collateralizationPercentage.returns(
      collateralizationThreshold
    )
    const tx = await riskManagerV1
      .connect(notifier)
      .notifyLiquidation(mockIDeposit.address)
    return tx
  }
})
