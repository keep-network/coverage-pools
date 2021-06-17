const chai = require("chai")
const expect = chai.expect
const {
  to1e18,
  to1ePrecision,
  ZERO_ADDRESS,
  increaseTime,
  impersonateAccount,
} = require("./helpers/contract-test-helpers")

const { deployMockContract } = require("@ethereum-waffle/mock-contract")
const ITBTCDepositToken = require("../artifacts/contracts/RiskManagerV1.sol/ITBTCDepositToken.json")
const Auction = require("../artifacts/contracts/Auction.sol/Auction.json")

const auctionLotSize = to1e18(1)
const auctionLength = 86400 // 24h
const bondAuctionThreshold = 100
const bondedAmount = to1e18(10)

describe("RiskManagerV1", () => {
  let tbtcToken
  let mockTbtcDepositToken
  let signerBondsSwapStrategy
  let owner
  let notifier
  let bidder
  let riskManagerV1
  let depositStub

  beforeEach(async () => {
    owner = await ethers.getSigner(0)
    notifier = await ethers.getSigner(1)
    bidder = await ethers.getSigner(2)

    const TestToken = await ethers.getContractFactory("TestToken")
    tbtcToken = await TestToken.deploy()
    await tbtcToken.deployed()

    mockTbtcDepositToken = await deployMockContract(
      owner,
      ITBTCDepositToken.abi
    )

    const SignerBondsSwapStrategy = await ethers.getContractFactory(
      "SignerBondsManualSwap"
    )
    signerBondsSwapStrategy = await SignerBondsSwapStrategy.deploy()
    await signerBondsSwapStrategy.deployed()

    anotherSignerBondsSwapStrategy = await SignerBondsSwapStrategy.deploy()
    await anotherSignerBondsSwapStrategy.deployed()

    const Auction = await ethers.getContractFactory("Auction")
    const CoveragePoolStub = await ethers.getContractFactory("CoveragePoolStub")
    const coveragePoolStub = await CoveragePoolStub.deploy()
    await coveragePoolStub.deployed()

    masterAuction = await Auction.deploy()
    await masterAuction.deployed()

    const RiskManagerV1Stub = await ethers.getContractFactory(
      "RiskManagerV1Stub"
    )
    riskManagerV1 = await RiskManagerV1Stub.deploy(
      tbtcToken.address,
      mockTbtcDepositToken.address,
      coveragePoolStub.address,
      signerBondsSwapStrategy.address,
      masterAuction.address,
      auctionLength,
      bondAuctionThreshold
    )
    await riskManagerV1.deployed()

    const DepositStub = await ethers.getContractFactory("DepositStub")
    depositStub = await DepositStub.deploy(tbtcToken.address, auctionLotSize)
    await depositStub.deployed()

    // Transfer some funds to the deposit contract to simulate real bonds.
    // This is why DepositStub is used instead of simple Waffle mock which
    // could not receive ETH.
    await owner.sendTransaction({
      to: depositStub.address,
      value: bondedAmount,
    })
  })

  describe("notifyLiquidation", () => {
    context("when address is not a deposit contract", () => {
      it("should revert", async () => {
        await mockTbtcDepositToken.mock.exists.returns(false)

        await expect(
          riskManagerV1.notifyLiquidation(depositStub.address)
        ).to.be.revertedWith("Address is not a deposit contract")
      })
    })

    context("when address is a deposit contract", () => {
      context("when deposit is not in liquidation state", () => {
        it("should revert", async () => {
          await mockTbtcDepositToken.mock.exists.returns(true)

          await expect(
            riskManagerV1.notifyLiquidation(depositStub.address)
          ).to.be.revertedWith("Deposit is not in liquidation state")
        })
      })

      context("when deposit is in liquidation state", () => {
        context("when deposit is below bond auction threshold level", () => {
          it("should revert", async () => {
            await mockTbtcDepositToken.mock.exists.returns(true)
            await depositStub.notifyUndercollateralizedLiquidation()
            // Bond auction value is 100% so an auction value less than the total
            // bond amount should cause a revert.
            await depositStub.setAuctionValue(bondedAmount.sub(1))
            await expect(
              riskManagerV1.notifyLiquidation(depositStub.address)
            ).to.be.revertedWith(
              "Deposit bond auction percentage is below the threshold level"
            )
          })
        })

        context("when deposit is at the bond auction threshold", () => {
          context("when already notified about the deposit", () => {
            beforeEach(async () => {
              await notifyLiquidation()
            })

            it("should revert", async () => {
              await expect(
                riskManagerV1
                  .connect(notifier)
                  .notifyLiquidation(depositStub.address)
              ).to.be.revertedWith(
                "Already notified on the deposit in liquidation"
              )
            })
          })

          context("when the surplus pool is empty", () => {
            let notifyLiquidationTx
            let auctionAddress

            beforeEach(async () => {
              notifyLiquidationTx = await notifyLiquidation()

              auctionAddress = await riskManagerV1.depositToAuction(
                depositStub.address
              )
            })

            it("should emit NotifiedLiquidation event", async () => {
              await expect(notifyLiquidationTx)
                .to.emit(riskManagerV1, "NotifiedLiquidation")
                .withArgs(depositStub.address, notifier.address)
            })

            it("should create an auction ", async () => {
              expect(auctionAddress).to.be.properAddress
              expect(auctionAddress).to.not.equal(ZERO_ADDRESS)
            })

            it("should not use the surplus pool", async () => {
              expect(await riskManagerV1.tbtcSurplus()).to.be.equal(0)
            })
          })

          context(
            "when the surplus pool is smaller than the deposit lot size",
            () => {
              let notifyLiquidationTx
              let auctionAddress

              beforeEach(async () => {
                const surplus = to1ePrecision(30, 16)
                await tbtcToken.mint(owner.address, surplus)
                await tbtcToken
                  .connect(owner)
                  .approve(riskManagerV1.address, surplus)
                await riskManagerV1.fundTbtcSurplus(surplus)

                notifyLiquidationTx = await notifyLiquidation()

                auctionAddress = await riskManagerV1.depositToAuction(
                  depositStub.address
                )
              })

              it("should emit NotifiedLiquidation event", async () => {
                await expect(notifyLiquidationTx)
                  .to.emit(riskManagerV1, "NotifiedLiquidation")
                  .withArgs(depositStub.address, notifier.address)
              })

              it("should create an auction ", async () => {
                expect(auctionAddress).to.be.properAddress
                expect(auctionAddress).to.not.equal(ZERO_ADDRESS)
              })

              it("should not use the surplus pool", async () => {
                expect(await riskManagerV1.tbtcSurplus()).to.be.equal(
                  to1ePrecision(30, 16)
                )
              })
            }
          )

          context(
            "when the surplus pool is equal to the deposit lot size",
            () => {
              let notifyLiquidationTx
              let auctionAddress

              beforeEach(async () => {
                const surplus = to1e18(1)
                await tbtcToken.mint(owner.address, surplus)
                await tbtcToken
                  .connect(owner)
                  .approve(riskManagerV1.address, surplus)
                await riskManagerV1.fundTbtcSurplus(surplus)

                notifyLiquidationTx = await notifyLiquidation()

                auctionAddress = await riskManagerV1.depositToAuction(
                  depositStub.address
                )
              })

              it("should emit NotifiedLiquidation event", async () => {
                await expect(notifyLiquidationTx)
                  .to.emit(riskManagerV1, "NotifiedLiquidation")
                  .withArgs(depositStub.address, notifier.address)
              })

              it("should not create an auction", async () => {
                expect(auctionAddress).to.equal(ZERO_ADDRESS)
              })

              it("should use the entire surplus pool", async () => {
                expect(await riskManagerV1.tbtcSurplus()).to.be.equal(0)
              })

              it("should liquidate the deposit directly", async () => {
                await expect(notifyLiquidationTx).to.changeEtherBalance(
                  riskManagerV1,
                  to1e18(10)
                )
              })
            }
          )

          context(
            "when the surplus pool is bigger than the deposit lot size",
            () => {
              let notifyLiquidationTx
              let auctionAddress

              beforeEach(async () => {
                const surplus = to1e18(5)
                await tbtcToken.mint(owner.address, surplus)
                await tbtcToken
                  .connect(owner)
                  .approve(riskManagerV1.address, surplus)
                await riskManagerV1.fundTbtcSurplus(surplus)

                notifyLiquidationTx = await notifyLiquidation()

                auctionAddress = await riskManagerV1.depositToAuction(
                  depositStub.address
                )
              })

              it("should emit NotifiedLiquidation event", async () => {
                await expect(notifyLiquidationTx)
                  .to.emit(riskManagerV1, "NotifiedLiquidation")
                  .withArgs(depositStub.address, notifier.address)
              })

              it("should not create an auction", async () => {
                expect(auctionAddress).to.equal(ZERO_ADDRESS)
              })

              it("should use a part of the surplus pool", async () => {
                expect(await riskManagerV1.tbtcSurplus()).to.be.equal(to1e18(4))
              })

              it("should liquidate the deposit directly", async () => {
                await expect(notifyLiquidationTx).to.changeEtherBalance(
                  riskManagerV1,
                  to1e18(10)
                )
              })
            }
          )
        })
      })
    })
  })

  describe("notifyLiquidated", () => {
    context("when auction for deposit does not exist", () => {
      it("should revert", async () => {
        const DepositStub = await ethers.getContractFactory("DepositStub")
        const otherDeposit = await DepositStub.deploy(
          tbtcToken.address,
          auctionLotSize
        )

        await expect(
          riskManagerV1.notifyLiquidated(otherDeposit.address)
        ).to.be.revertedWith("No auction for given deposit")
      })
    })

    context("when deposit is not in liquidated state", () => {
      it("should revert", async () => {
        await notifyLiquidation()

        await expect(
          riskManagerV1.notifyLiquidated(depositStub.address)
        ).to.be.revertedWith("Deposit is not in liquidated state")
      })
    })

    context("when deposit is in liquidated state", () => {
      let auctionAddress
      let auction

      beforeEach(async () => {
        await notifyLiquidation()

        auctionAddress = await riskManagerV1.depositToAuction(
          depositStub.address
        )

        // Simulate that someone takes a partial offer on the auction.
        await tbtcToken.mint(bidder.address, auctionLotSize)
        await tbtcToken.connect(bidder).approve(auctionAddress, auctionLotSize)
        auction = new ethers.Contract(auctionAddress, Auction.abi, owner)
        await auction.connect(bidder).takeOffer(to1ePrecision(25, 16))

        // Simulate that deposit was liquidated by someone else.
        await tbtcToken.connect(owner).mint(owner.address, auctionLotSize)
        await tbtcToken
          .connect(owner)
          .approve(depositStub.address, auctionLotSize)
        await depositStub.connect(owner).purchaseSignerBondsAtAuction()
      })

      it("should emit notified liquidated event", async () => {
        await expect(
          riskManagerV1.connect(notifier).notifyLiquidated(depositStub.address)
        )
          .to.emit(riskManagerV1, "NotifiedLiquidated")
          .withArgs(depositStub.address, notifier.address)
      })

      it("should properly update the surplus pool", async () => {
        await riskManagerV1
          .connect(notifier)
          .notifyLiquidated(depositStub.address)

        // Should return the auction's transferred amount (25 * 10^16).
        expect(await riskManagerV1.tbtcSurplus()).to.be.equal(
          to1ePrecision(25, 16)
        )
      })

      it("should early close an auction", async () => {
        await riskManagerV1
          .connect(notifier)
          .notifyLiquidated(depositStub.address)

        expect(await riskManagerV1.depositToAuction(auctionAddress)).to.equal(
          ZERO_ADDRESS
        )
        expect(await riskManagerV1.openAuctions(auctionAddress)).to.be.false
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
          ).to.be.revertedWith("Change not initiated")
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

  describe("beginBondAuctionThresholdUpdate", () => {
    context("when the caller is the owner", () => {
      const currentBondAuctionThreshold = bondAuctionThreshold
      const newBondAuctionThreshold = 90
      let tx

      beforeEach(async () => {
        tx = await riskManagerV1
          .connect(owner)
          .beginBondAuctionThresholdUpdate(newBondAuctionThreshold)
      })

      it("should not update bond auction threshold", async () => {
        expect(await riskManagerV1.bondAuctionThreshold()).to.be.equal(
          currentBondAuctionThreshold
        )
      })

      it("should start the governance delay timer", async () => {
        expect(
          await riskManagerV1.getRemainingBondAuctionThresholdUpdateTime()
        ).to.be.equal(43200) // 12h contract governance delay
      })

      it("should emit the BondAuctionThresholdUpdateStarted event", async () => {
        const blockTimestamp = (await ethers.provider.getBlock(tx.blockNumber))
          .timestamp
        await expect(tx)
          .to.emit(riskManagerV1, "BondAuctionThresholdUpdateStarted")
          .withArgs(newBondAuctionThreshold, blockTimestamp)
      })
    })

    context("when the caller is not the owner", () => {
      it("should revert", async () => {
        await expect(
          riskManagerV1.connect(notifier).beginBondAuctionThresholdUpdate(90)
        ).to.be.revertedWith("Ownable: caller is not the owner")
      })
    })
  })

  describe("finalizeBondAuctionThresholdUpdate", () => {
    const newBondAuctionThreshold = 90

    context(
      "when the update process is initialized, governance delay has passed, " +
        "and the caller is the owner",
      () => {
        let tx

        beforeEach(async () => {
          await riskManagerV1
            .connect(owner)
            .beginBondAuctionThresholdUpdate(newBondAuctionThreshold)

          await increaseTime(43200) // +12h contract governance delay

          tx = await riskManagerV1
            .connect(owner)
            .finalizeBondAuctionThresholdUpdate()
        })

        it("should update the bond auction threshold", async () => {
          expect(await riskManagerV1.bondAuctionThreshold()).to.be.equal(
            newBondAuctionThreshold
          )
        })

        it("should emit BondAuctionThresholdUpdated event", async () => {
          await expect(tx)
            .to.emit(riskManagerV1, "BondAuctionThresholdUpdated")
            .withArgs(newBondAuctionThreshold)
        })

        it("should reset the governance delay timer", async () => {
          await expect(
            riskManagerV1.getRemainingBondAuctionThresholdUpdateTime()
          ).to.be.revertedWith("Change not initiated")
        })
      }
    )

    context("when the governance delay has not passed", () => {
      it("should revert", async () => {
        await riskManagerV1
          .connect(owner)
          .beginBondAuctionThresholdUpdate(newBondAuctionThreshold)

        await increaseTime(39600) // +11h

        await expect(
          riskManagerV1.connect(owner).finalizeBondAuctionThresholdUpdate()
        ).to.be.revertedWith("Governance delay has not elapsed")
      })
    })

    context("when the caller is not the owner", () => {
      it("should revert", async () => {
        await expect(
          riskManagerV1.connect(notifier).finalizeBondAuctionThresholdUpdate()
        ).to.be.revertedWith("Ownable: caller is not the owner")
      })
    })

    context("when the update process is not initialized", () => {
      it("should revert", async () => {
        await expect(
          riskManagerV1.connect(owner).finalizeBondAuctionThresholdUpdate()
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

      it("should not update the signer bonds swap strategy", async () => {
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

    context("when signer bonds swap strategy is invalid", () => {
      it("should revert", async () => {
        await expect(
          riskManagerV1
            .connect(owner)
            .beginSignerBondsSwapStrategyUpdate(ZERO_ADDRESS)
        ).to.be.revertedWith("Invalid signer bonds swap strategy address")
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
          ).to.be.revertedWith("Change not initiated")
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

  describe("withdrawSignerBonds", () => {
    beforeEach(async () => {
      // Set the risk manager contract balance
      await owner.sendTransaction({
        to: riskManagerV1.address,
        value: ethers.utils.parseEther("10"),
      })
    })

    context("when the caller is not the signer bonds swap strategy", () => {
      it("should revert", async () => {
        await expect(
          riskManagerV1
            .connect(bidder)
            .withdrawSignerBonds(ethers.utils.parseEther("10"))
        ).to.be.revertedWith("Caller is not the signer bonds swap strategy")
      })
    })

    context("when the caller is the signer bonds swap strategy", () => {
      let signerBondsSwapStrategySigner

      beforeEach(async () => {
        signerBondsSwapStrategySigner = await impersonateAccount(
          signerBondsSwapStrategy.address,
          owner
        )
      })

      context("when amount exceeds balance", () => {
        it("should revert", async () => {
          await expect(
            riskManagerV1
              .connect(signerBondsSwapStrategySigner)
              .withdrawSignerBonds(ethers.utils.parseEther("11"))
          ).to.be.revertedWith("Failed to send Ether")
        })
      })

      context("when amount does not exceed balance", () => {
        it("should withdraw signer bonds to the swap strategy contract", async () => {
          const tx = await riskManagerV1
            .connect(signerBondsSwapStrategySigner)
            .withdrawSignerBonds(ethers.utils.parseEther("10"))

          await expect(tx).to.changeEtherBalance(
            riskManagerV1,
            ethers.utils.parseEther("-10")
          )
          await expect(tx).to.changeEtherBalance(
            signerBondsSwapStrategy,
            ethers.utils.parseEther("10")
          )
        })
      })
    })
  })

  async function notifyLiquidation() {
    await mockTbtcDepositToken.mock.exists.returns(true)
    await depositStub.notifyUndercollateralizedLiquidation()
    await depositStub.setAuctionValue(bondedAmount)
    const tx = await riskManagerV1
      .connect(notifier)
      .notifyLiquidation(depositStub.address)
    return tx
  }
})
