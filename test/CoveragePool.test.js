const { expect } = require("chai")
const {
  to1e18,
  to1ePrecision,
  increaseTime,
  lastBlockTime,
  lastBlockNumber,
  mineBlock,
} = require("./helpers/contract-test-helpers")

describe("CoveragePool", () => {
  let coveragePool
  let assetPool
  let collateralToken
  let underwriterToken

  let governance
  let underwriter1
  let underwriter2
  let recipient
  let riskManager
  let anotherRiskManager
  let rewardsManager
  let thirdParty

  // expected withdrawal delay in seconds
  const withdrawalDelay = 21 * 24 * 3600
  // expected reward interval in seconds
  const rewardInterval = 7 * 24 * 3600

  beforeEach(async () => {
    // Governance that owns Coverage Pool
    governance = await ethers.getSigner(1)
    // Underwriter that will deposit some amount of tokens to Asset Pool
    underwriter1 = await ethers.getSigner(2)
    underwriter2 = await ethers.getSigner(3)
    // Recipient that will receive seized funds
    recipient = await ethers.getSigner(4)
    // The main risk manager
    riskManager = await ethers.getSigner(5)
    // Another risk manager
    anotherRiskManager = await ethers.getSigner(6)
    // Account that is not authorized to call functions on Coverage Pool
    thirdParty = await ethers.getSigner(7)
    // Account funding Asset Pool with rewards
    rewardsManager = await ethers.getSigner(8)

    // To test `getPastVotes` we need a token properly implementing DAO
    // checkpoints. Using T instead of reinventing the wheel in TestToken.
    const T = await ethers.getContractFactory("T")
    collateralToken = await T.deploy()
    await collateralToken.deployed()

    const UnderwriterToken = await ethers.getContractFactory("UnderwriterToken")
    underwriterToken = await UnderwriterToken.deploy("Underwriter Token", "COV")
    await underwriterToken.deployed()

    const AssetPool = await ethers.getContractFactory("AssetPool")
    assetPool = await AssetPool.deploy(
      collateralToken.address,
      underwriterToken.address,
      rewardsManager.address
    )
    await assetPool.deployed()

    const CoveragePool = await ethers.getContractFactory("CoveragePool")
    coveragePool = await CoveragePool.deploy(assetPool.address)
    await coveragePool.deployed()

    await coveragePool.transferOwnership(governance.address)
    await assetPool.transferOwnership(coveragePool.address)
    await underwriterToken.transferOwnership(assetPool.address)
  })

  describe("approveFirstRiskManager", () => {
    context("when caller is not the governance", () => {
      it("should revert", async () => {
        await expect(
          coveragePool
            .connect(thirdParty)
            .approveFirstRiskManager(riskManager.address)
        ).to.be.revertedWith("Ownable: caller is not the owner")
      })
    })

    context("when the first risk manager has not been approved so far", () => {
      beforeEach(async () => {
        await coveragePool
          .connect(governance)
          .approveFirstRiskManager(riskManager.address)
      })

      it("should approve risk manager", async () => {
        expect(await coveragePool.approvedRiskManagers(riskManager.address)).to
          .be.true
      })

      it("should set first risk manager flag to true", async () => {
        expect(await coveragePool.firstRiskManagerApproved()).to.be.true
      })
    })

    context("when the first risk manager has already been approved", () => {
      beforeEach(async () => {
        await coveragePool
          .connect(governance)
          .approveFirstRiskManager(riskManager.address)
      })

      it("should revert", async () => {
        await expect(
          coveragePool
            .connect(governance)
            .approveFirstRiskManager(anotherRiskManager.address)
        ).to.be.revertedWith("The first risk manager was approved")
      })
    })
  })

  describe("beginRiskManagerApproval", () => {
    context("when caller is not the governance", () => {
      it("should revert", async () => {
        await expect(
          coveragePool
            .connect(thirdParty)
            .beginRiskManagerApproval(riskManager.address)
        ).to.be.revertedWith("Ownable: caller is not the owner")
      })
    })

    context("when first risk manager was not approved", () => {
      it("should revert", async () => {
        await expect(
          coveragePool
            .connect(governance)
            .beginRiskManagerApproval(riskManager.address)
        ).to.be.revertedWith(
          "The first risk manager is not yet approved; Please use " +
            "approveFirstRiskManager instead"
        )
      })
    })

    context(
      "when called by the governance and first risk manager was approved",
      () => {
        let tx
        beforeEach(async () => {
          await coveragePool
            .connect(governance)
            .approveFirstRiskManager(anotherRiskManager.address)
          tx = await coveragePool
            .connect(governance)
            .beginRiskManagerApproval(riskManager.address)
        })

        it("should not approve risk manager", async () => {
          expect(await coveragePool.approvedRiskManagers(riskManager.address))
            .to.be.false
        })

        it("should store approval process begin timestamp", async () => {
          expect(
            await coveragePool.riskManagerApprovalTimestamps(
              riskManager.address
            )
          ).to.be.above(0)
        })

        it("should emit RiskManagerApprovalStarted event", async () => {
          await expect(tx)
            .to.emit(coveragePool, "RiskManagerApprovalStarted")
            .withArgs(riskManager.address, await lastBlockTime())
        })

        it("should start the governance delay timer", async () => {
          const governanceDelay = await assetPool.withdrawalGovernanceDelay()
          expect(
            await coveragePool.getRemainingRiskManagerApprovalTime(
              riskManager.address
            )
          ).to.be.equal(governanceDelay)
        })

        context("when called for already approved risk manager", () => {
          it("should revert", async () => {
            await expect(
              coveragePool
                .connect(governance)
                .beginRiskManagerApproval(anotherRiskManager.address)
            ).to.be.revertedWith("Risk manager already approved")
          })
        })
      }
    )
  })

  describe("finalizeRiskManagerApproval", () => {
    context("when caller is not the governance", () => {
      it("should revert", async () => {
        await expect(
          coveragePool
            .connect(thirdParty)
            .finalizeRiskManagerApproval(riskManager.address)
        ).to.be.revertedWith("Ownable: caller is not the owner")
      })
    })

    context("when approval was not initiated", () => {
      it("should revert", async () => {
        await expect(
          coveragePool
            .connect(governance)
            .finalizeRiskManagerApproval(riskManager.address)
        ).to.be.revertedWith("Risk manager approval not initiated")
      })
    })

    context("when approval was initiated", () => {
      beforeEach(async () => {
        await coveragePool
          .connect(governance)
          .approveFirstRiskManager(anotherRiskManager.address)
        await coveragePool
          .connect(governance)
          .beginRiskManagerApproval(riskManager.address)
      })

      context("when approval delay has not elapsed", () => {
        beforeEach(async () => {
          const governanceDelay = await assetPool.withdrawalGovernanceDelay()
          await increaseTime(governanceDelay.sub(60).toNumber()) // - 1 minute
        })

        it("should revert", async () => {
          await expect(
            coveragePool
              .connect(governance)
              .finalizeRiskManagerApproval(riskManager.address)
          ).to.be.revertedWith("Risk manager governance delay has not elapsed")
        })
      })

      context("when approval delay has passed", () => {
        let tx
        beforeEach(async () => {
          // wait for the risk manager governance delay
          await increaseTime(30 * 24 * 3600)

          tx = await coveragePool
            .connect(governance)
            .finalizeRiskManagerApproval(riskManager.address)
        })

        it("should remove approval process begin timestamp", async () => {
          expect(
            await coveragePool.riskManagerApprovalTimestamps(
              riskManager.address
            )
          ).to.be.equal(0)
        })

        it("should approve risk manager", async () => {
          expect(await coveragePool.approvedRiskManagers(riskManager.address))
            .to.be.true
        })

        it("should emit RiskManagerApprovalCompleted event", async () => {
          await expect(tx)
            .to.emit(coveragePool, "RiskManagerApprovalCompleted")
            .withArgs(riskManager.address, await lastBlockTime())
        })

        it("should reset the governance delay timer", async () => {
          await expect(
            coveragePool.getRemainingRiskManagerApprovalTime(
              riskManager.address
            )
          ).to.be.revertedWith("Change not initiated")
        })
      })
    })
  })

  describe("unapproveRiskManager", () => {
    context("when caller is not the governance", () => {
      it("should revert", async () => {
        await expect(
          coveragePool
            .connect(thirdParty)
            .unapproveRiskManager(riskManager.address)
        ).to.be.revertedWith("Ownable: caller is not the owner")
      })
    })

    context("when called for unknown risk manager", () => {
      it("should revert", async () => {
        await expect(
          coveragePool
            .connect(governance)
            .unapproveRiskManager(riskManager.address)
        ).to.be.revertedWith(
          "Risk manager is neither approved nor with a pending approval"
        )
      })
    })

    context("when cancelling risk manager approval process", () => {
      beforeEach(async () => {
        await coveragePool
          .connect(governance)
          .approveFirstRiskManager(anotherRiskManager.address)
        await coveragePool
          .connect(governance)
          .beginRiskManagerApproval(riskManager.address)
        tx = await coveragePool
          .connect(governance)
          .unapproveRiskManager(riskManager.address)
      })

      it("should remove timestamp of risk manager approval", async () => {
        expect(
          await coveragePool.riskManagerApprovalTimestamps(riskManager.address)
        ).to.be.equal(0)
      })

      it("should emit RiskManagerUnapproved event", async () => {
        await expect(tx)
          .to.emit(coveragePool, "RiskManagerUnapproved")
          .withArgs(riskManager.address, await lastBlockTime())
      })
    })

    context("when unapproving risk manager", () => {
      beforeEach(async () => {
        await coveragePool
          .connect(governance)
          .approveFirstRiskManager(riskManager.address)
        tx = await coveragePool
          .connect(governance)
          .unapproveRiskManager(riskManager.address)
      })

      it("should unapprove risk manager", async () => {
        expect(await coveragePool.approvedRiskManagers(riskManager.address)).to
          .be.false
      })

      it("should emit RiskManagerUnapproved event", async () => {
        await expect(tx)
          .to.emit(coveragePool, "RiskManagerUnapproved")
          .withArgs(riskManager.address, await lastBlockTime())
      })
    })
  })

  describe("seizePortion", () => {
    beforeEach(async () => {
      // Deposit 400 tokens to the asset pool
      await collateralToken.mint(underwriter1.address, to1e18(400))
      await collateralToken
        .connect(underwriter1)
        .approve(assetPool.address, to1e18(400))
      await assetPool.connect(underwriter1).deposit(to1e18(400))
    })

    context("when caller is not an approved Risk Manager", () => {
      it("should revert", async () => {
        await expect(
          coveragePool.connect(riskManager).seizePortion(recipient.address, 123)
        ).to.be.revertedWith("Risk manager not approved")
      })
    })

    context("when caller is an approved Risk Manager", () => {
      beforeEach(async () => {
        await coveragePool
          .connect(governance)
          .approveFirstRiskManager(riskManager.address)
      })

      it("transfers seized funds to recipient account", async () => {
        // Portion to seize is 0.345987 (multiplied by 10^18 to save precision)
        const portionToSeize = to1ePrecision(345987, 12)
        // Expected amount is 400 * 0.345987 = 138.3948 (multiplied by 10^18)
        const amountSeized = to1ePrecision(1383948, 14)

        await coveragePool
          .connect(riskManager)
          .seizePortion(recipient.address, portionToSeize)
        expect(await collateralToken.balanceOf(recipient.address)).to.be.equal(
          amountSeized
        )
      })

      it("should not allow to seize zero portion of the coverage pool", async () => {
        const portionToSeize = 0

        await expect(
          coveragePool
            .connect(riskManager)
            .seizePortion(recipient.address, portionToSeize)
        ).to.be.revertedWith("Portion to seize is not within the range (0, 1]")
      })

      it("should not allow to seize more than the pool has", async () => {
        // actual bounds are (0, 1]. to1e18(1) was used to mimic FLOATING_POINT_DIVISOR
        const portionToSeize = to1e18(1) + 1

        await expect(
          coveragePool
            .connect(riskManager)
            .seizePortion(recipient.address, portionToSeize)
        ).to.be.revertedWith("Portion to seize is not within the range (0, 1]")
      })
    })
  })

  describe("seizeAmount", () => {
    beforeEach(async () => {
      // Deposit 400 tokens to the asset pool
      await collateralToken.mint(underwriter1.address, to1e18(400))
      await collateralToken
        .connect(underwriter1)
        .approve(assetPool.address, to1e18(400))
      await assetPool.connect(underwriter1).deposit(to1e18(400))
    })

    context("when caller is not an approved Risk Manager", () => {
      it("should revert", async () => {
        await expect(
          coveragePool.connect(riskManager).seizeAmount(recipient.address, 100)
        ).to.be.revertedWith("Risk manager not approved")
      })
    })

    context("when caller is an approved Risk Manager", () => {
      beforeEach(async () => {
        await coveragePool
          .connect(governance)
          .approveFirstRiskManager(riskManager.address)
      })

      it("transfers seized funds to recipient account", async () => {
        const amountToSeize = 250
        await coveragePool
          .connect(riskManager)
          .seizeAmount(recipient.address, amountToSeize)
        expect(await collateralToken.balanceOf(recipient.address)).to.be.equal(
          amountToSeize
        )
      })

      it("should not allow to seize zero amount", async () => {
        const amountToSeize = 0
        await expect(
          coveragePool
            .connect(riskManager)
            .seizeAmount(recipient.address, amountToSeize)
        ).to.be.revertedWith("Amount to seize must be >0")
      })

      it("should not allow to seize more than the pool has", async () => {
        const poolBalance = await collateralToken.balanceOf(assetPool.address)

        await expect(
          coveragePool
            .connect(riskManager)
            .seizeAmount(recipient.address, poolBalance + 1)
        ).to.be.revertedWith("Amount to seize exceeds the pool balance")
      })
    })
  })

  describe("grantAssetPoolShares", () => {
    context("when the caller is not an approved risk manager", () => {
      it("should revert", async () => {
        await expect(
          coveragePool
            .connect(thirdParty)
            .grantAssetPoolShares(thirdParty.address, to1e18(10))
        ).to.be.revertedWith("Risk manager not approved")
      })
    })

    context("when the caller is an approved risk manager", () => {
      beforeEach(async () => {
        await coveragePool
          .connect(governance)
          .approveFirstRiskManager(riskManager.address)

        await coveragePool
          .connect(riskManager)
          .grantAssetPoolShares(thirdParty.address, to1e18(10))
      })

      it("should grant asset pool shares to the recipient", async () => {
        // That's the only way to check whether the interaction occurred because
        // a real AssetPool is used in tests.
        expect(
          await underwriterToken.balanceOf(thirdParty.address)
        ).to.be.equal(to1e18(10))
      })
    })
  })

  describe("getPastVotes", async () => {
    let lastFinalizedBlock

    beforeEach(async () => {
      await underwriterToken
        .connect(underwriter1)
        .delegate(underwriter1.address)
      await underwriterToken
        .connect(underwriter2)
        .delegate(underwriter2.address)
    })

    context("when no tokens were deposited into the pool", () => {
      beforeEach(async () => {
        lastFinalizedBlock = (await lastBlockNumber()) - 1
      })

      it("should return zero", async () => {
        expect(
          await coveragePool.getPastVotes(
            underwriter1.address,
            lastFinalizedBlock
          )
        ).to.equal(0)
      })
    })

    context("when underwriter did not delegate voting", () => {
      beforeEach(async () => {
        await collateralToken.mint(thirdParty.address, to1e18(400))
        await collateralToken
          .connect(thirdParty)
          .approve(assetPool.address, to1e18(400))
        await assetPool.connect(thirdParty).deposit(to1e18(400))

        lastFinalizedBlock = (await lastBlockNumber()) - 1
      })

      it("should return zero", async () => {
        expect(
          await coveragePool.getPastVotes(
            thirdParty.address,
            lastFinalizedBlock
          )
        ).to.equal(0)
      })
    })

    context("when account did not deposit into the pool", () => {
      beforeEach(async () => {
        await collateralToken.mint(underwriter1.address, to1e18(400))
        await collateralToken
          .connect(underwriter1)
          .approve(assetPool.address, to1e18(400))
        await assetPool.connect(underwriter1).deposit(to1e18(400))

        lastFinalizedBlock = (await lastBlockNumber()) - 1
      })

      it("should return zero", async () => {
        expect(
          await coveragePool.getPastVotes(
            thirdParty.address,
            lastFinalizedBlock
          )
        ).to.equal(0)
      })
    })

    context("when single underwriter deposited into the pool", () => {
      const depositedAmount = to1e18(401)

      beforeEach(async () => {
        // Mint to some unrelated account. We do it to ensure the total supply
        // of T that exists in circulation, outside of the coverage pool
        // deposits does not affect the voting power of underwriters.
        await collateralToken.mint(thirdParty.address, to1e18(100000))

        // Underwriter deposits into the asset pool.
        await collateralToken.mint(underwriter1.address, depositedAmount)
        await collateralToken
          .connect(underwriter1)
          .approve(assetPool.address, depositedAmount)
        await assetPool.connect(underwriter1).deposit(depositedAmount)

        await mineBlock()
        lastFinalizedBlock = (await lastBlockNumber()) - 1
      })

      it("should return correct voting power", async () => {
        expect(
          await coveragePool.getPastVotes(
            underwriter1.address,
            lastFinalizedBlock
          )
        ).to.equal(depositedAmount)
      })
    })

    context("when multiple underwriters deposited into the pool", () => {
      const depositedAmount1 = to1e18(400)
      const depositedAmount2 = to1e18(200)

      beforeEach(async () => {
        // Mint to some unrelated account. We do it to ensure the total supply
        // of T that exists in circulation, outside of the coverage pool
        // deposits does not affect the voting power of underwriters.
        await collateralToken.mint(thirdParty.address, to1e18(100000))

        // First underwriter deposits into the asset pool.
        await collateralToken.mint(underwriter1.address, depositedAmount1)
        await collateralToken
          .connect(underwriter1)
          .approve(assetPool.address, depositedAmount1)
        await assetPool.connect(underwriter1).deposit(depositedAmount1)

        // Second underwriter deposits into the asset pool.
        await collateralToken.mint(underwriter2.address, depositedAmount2)
        await collateralToken
          .connect(underwriter2)
          .approve(assetPool.address, depositedAmount2)
        await assetPool.connect(underwriter2).deposit(depositedAmount2)

        await mineBlock()
        lastFinalizedBlock = (await lastBlockNumber()) - 1
      })

      context("when no one withdrawn, there were no claims or rewards", () => {
        it("should return correct voting power", async () => {
          expect(
            await coveragePool.getPastVotes(
              underwriter1.address,
              lastFinalizedBlock
            )
          ).to.equal(depositedAmount1)

          expect(
            await coveragePool.getPastVotes(
              underwriter2.address,
              lastFinalizedBlock
            )
          ).to.equal(depositedAmount2)
        })
      })

      context(
        "when one underwriter delegated voting power to someone else",
        () => {
          beforeEach(async () => {
            await underwriterToken
              .connect(underwriter1)
              .delegate(thirdParty.address)

            await mineBlock()
            lastFinalizedBlock = (await lastBlockNumber()) - 1
          })

          it("should return correct voting power", async () => {
            expect(
              await coveragePool.getPastVotes(
                underwriter1.address,
                lastFinalizedBlock
              )
            ).to.equal(0)

            expect(
              await coveragePool.getPastVotes(
                thirdParty.address,
                lastFinalizedBlock
              )
            ).to.equal(depositedAmount1)

            expect(
              await coveragePool.getPastVotes(
                underwriter2.address,
                lastFinalizedBlock
              )
            ).to.equal(depositedAmount2)
          })
        }
      )

      context(
        "when both underwriters delegated voting power to the same account",
        () => {
          beforeEach(async () => {
            await underwriterToken
              .connect(underwriter1)
              .delegate(thirdParty.address)
            await underwriterToken
              .connect(underwriter2)
              .delegate(thirdParty.address)

            await mineBlock()
            lastFinalizedBlock = (await lastBlockNumber()) - 1
          })

          it("should return correct voting power", async () => {
            expect(
              await coveragePool.getPastVotes(
                underwriter1.address,
                lastFinalizedBlock
              )
            ).to.equal(0)

            expect(
              await coveragePool.getPastVotes(
                underwriter2.address,
                lastFinalizedBlock
              )
            ).to.equal(0)

            expect(
              await coveragePool.getPastVotes(
                thirdParty.address,
                lastFinalizedBlock
              )
            ).to.equal(depositedAmount1.add(depositedAmount2))
          })
        }
      )

      context(
        "when one underwriter delegated voting power to the other underwriter",
        () => {
          beforeEach(async () => {
            await underwriterToken
              .connect(underwriter1)
              .delegate(underwriter2.address)

            await mineBlock()
            lastFinalizedBlock = (await lastBlockNumber()) - 1
          })

          it("should return correct voting power", async () => {
            expect(
              await coveragePool.getPastVotes(
                underwriter1.address,
                lastFinalizedBlock
              )
            ).to.equal(0)

            expect(
              await coveragePool.getPastVotes(
                underwriter2.address,
                lastFinalizedBlock
              )
            ).to.equal(depositedAmount1.add(depositedAmount2))
          })
        }
      )

      context("when one underwriter partially withdrawn", async () => {
        // no liquidations so COV amount = withdrawn amount
        // 400 - 100 = 300
        const withdrawnAmount = to1e18(100)

        beforeEach(async () => {
          await underwriterToken
            .connect(underwriter1)
            .approve(assetPool.address, withdrawnAmount)
          await assetPool
            .connect(underwriter1)
            .initiateWithdrawal(withdrawnAmount)
          await increaseTime(withdrawalDelay)
          await assetPool
            .connect(underwriter1)
            .completeWithdrawal(underwriter1.address)

          await mineBlock()
          lastFinalizedBlock = (await lastBlockNumber()) - 1
        })

        it("should return correct voting power", async () => {
          expect(
            await coveragePool.getPastVotes(
              underwriter1.address,
              lastFinalizedBlock
            )
          ).to.equal(depositedAmount1.sub(withdrawnAmount))

          expect(
            await coveragePool.getPastVotes(
              underwriter2.address,
              lastFinalizedBlock
            )
          ).to.equal(depositedAmount2)
        })
      })

      context("when one underwriter completely withdrawn", async () => {
        // no liquidations so COV amount = withdrawn amount
        const withdrawnAmount = depositedAmount1

        beforeEach(async () => {
          await underwriterToken
            .connect(underwriter1)
            .approve(assetPool.address, withdrawnAmount)
          await assetPool
            .connect(underwriter1)
            .initiateWithdrawal(withdrawnAmount)
          await increaseTime(withdrawalDelay)
          await assetPool
            .connect(underwriter1)
            .completeWithdrawal(underwriter1.address)

          await mineBlock()
          lastFinalizedBlock = (await lastBlockNumber()) - 1
        })

        it("should return correct voting power", async () => {
          expect(
            await coveragePool.getPastVotes(
              underwriter1.address,
              lastFinalizedBlock
            )
          ).to.equal(0)

          expect(
            await coveragePool.getPastVotes(
              underwriter2.address,
              lastFinalizedBlock
            )
          ).to.equal(depositedAmount2)
        })
      })

      context("when rewards were allocated", async () => {
        const assertionPrecision = ethers.BigNumber.from("10000000") // 0.00000000001
        const allocatedReward = to1e18(90)

        beforeEach(async () => {
          const rewardsPoolAddress = await assetPool.rewardsPool()
          const rewardsPool = await ethers.getContractAt(
            "RewardsPool",
            rewardsPoolAddress,
            rewardsManager
          )

          // Allocate reward and wait for the entire length of the reward
          // interval.
          await collateralToken.mint(rewardsManager.address, allocatedReward)
          await collateralToken
            .connect(rewardsManager)
            .approve(rewardsPool.address, allocatedReward)
          await rewardsPool.connect(rewardsManager).topUpReward(allocatedReward)
          await increaseTime(rewardInterval)
          await rewardsPool.withdraw()

          await mineBlock()
          lastFinalizedBlock = (await lastBlockNumber()) - 1
        })

        it("should return correct voting power", async () => {
          // underwriter 1 has 400/600 = 2/3 share of the pool
          // underwriter 2 has 200/600 = 1/3 share of the pool
          //
          // they are rewarded proportionally:
          //   underwriter 1: 90 * 2/3 = 60
          //   underwriter 2: 90 * 1/3 = 30
          //
          // their voting power should increase:
          //   underwriter 1: 400 + 60 = 460
          //   underwriter 2: 200 + 30 = 230
          expect(
            await coveragePool.getPastVotes(
              underwriter1.address,
              lastFinalizedBlock
            )
          ).to.be.closeTo(to1e18(460), assertionPrecision)

          expect(
            await coveragePool.getPastVotes(
              underwriter2.address,
              lastFinalizedBlock
            )
          ).to.be.closeTo(to1e18(230), assertionPrecision)
        })
      })

      context("when there was a claim", async () => {
        const portionToSeize = to1ePrecision(1, 17) // 0.1

        beforeEach(async () => {
          await coveragePool
            .connect(governance)
            .approveFirstRiskManager(riskManager.address)

          await coveragePool
            .connect(riskManager)
            .seizePortion(recipient.address, portionToSeize)

          await mineBlock()
          lastFinalizedBlock = (await lastBlockNumber()) - 1
        })

        it("should return correct voting power", async () => {
          // underwriter 1 has 400/600 = 2/3 share of the pool
          // underwriter 2 has 200/600 = 1/3 share of the pool
          //
          // 0.1 of the coverage pool got liquidated
          // 0.9 * 600 = 540 collateral tokens remain in the pool
          //
          // underwriter voting power should decrease:
          //   underwriter 1: 2/3 * 540 = 360
          //   underwriter 2: 1/3 * 540 = 180
          expect(
            await coveragePool.getPastVotes(
              underwriter1.address,
              lastFinalizedBlock
            )
          ).to.equal(to1e18(360))

          expect(
            await coveragePool.getPastVotes(
              underwriter2.address,
              lastFinalizedBlock
            )
          ).to.equal(to1e18(180))
        })
      })
    })
  })
})
