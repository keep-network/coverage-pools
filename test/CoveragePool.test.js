const { expect } = require("chai")
const {
  to1e18,
  to1ePrecision,
  increaseTime,
  lastBlockTime,
} = require("./helpers/contract-test-helpers")

describe("CoveragePool", () => {
  let coveragePool
  let assetPool
  let testToken
  let underwriterToken

  let governance
  let underwriter
  let recipient
  let riskManager
  let anotherRiskManager
  let thirdParty

  beforeEach(async () => {
    // Governance that owns Coverage Pool
    governance = await ethers.getSigner(1)
    // Underwriter that will deposit some amount of tokens to Asset Pool
    underwriter = await ethers.getSigner(2)
    // Recipient that will receive seized funds
    recipient = await ethers.getSigner(3)
    // The main risk manager
    riskManager = await ethers.getSigner(4)
    // Another risk manager
    anotherRiskManager = await ethers.getSigner(5)
    // Account that is not authorized to call functions on Coverage Pool
    thirdParty = await ethers.getSigner(6)
    // Account funding Asset Pool with rewards
    const rewardsManager = await ethers.getSigner(7)

    const TestToken = await ethers.getContractFactory("TestToken")
    testToken = await TestToken.deploy()
    await testToken.deployed()

    const UnderwriterToken = await ethers.getContractFactory("UnderwriterToken")
    underwriterToken = await UnderwriterToken.deploy("Underwriter Token", "COV")
    await underwriterToken.deployed()

    const AssetPool = await ethers.getContractFactory("AssetPool")
    assetPool = await AssetPool.deploy(
      testToken.address,
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

    // Deposit 400 tokens to the asset pool
    await testToken.mint(underwriter.address, to1e18(400))
    await testToken.connect(underwriter).approve(assetPool.address, to1e18(400))
    await assetPool.connect(underwriter).deposit(to1e18(400))
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
        ).to.be.revertedWith("First risk manager was not approved")
      })
    })

    context("when first risk manager was approved", () => {
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
        expect(await coveragePool.approvedRiskManagers(riskManager.address)).to
          .be.false
      })

      it("should store approval process begin timestamp", async () => {
        expect(
          await coveragePool.riskManagerApprovalTimestamps(riskManager.address)
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
    })
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

      it("should remove timestamp of risk manager", async () => {
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

  describe("seizeFunds", () => {
    context("when caller is not an approved Risk Manager", () => {
      it("should revert", async () => {
        await expect(
          coveragePool.connect(riskManager).seizeFunds(recipient.address, 123)
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
          .seizeFunds(recipient.address, portionToSeize)
        expect(await testToken.balanceOf(recipient.address)).to.be.equal(
          amountSeized
        )
      })

      it("should not allow to seize zero portion of the coverage pool", async () => {
        const portionToSeize = 0

        await expect(
          coveragePool
            .connect(riskManager)
            .seizeFunds(recipient.address, portionToSeize)
        ).to.be.revertedWith("Portion to seize is not within the range (0, 1]")
      })

      it("should not allow to seize more than a pool has", async () => {
        // actual bounds are (0, 1]. to1e18(1) was used to mimic FLOATING_POINT_DIVISOR
        const portionToSeize = to1e18(1) + 1

        await expect(
          coveragePool
            .connect(riskManager)
            .seizeFunds(recipient.address, portionToSeize)
        ).to.be.revertedWith("Portion to seize is not within the range (0, 1]")
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
})
