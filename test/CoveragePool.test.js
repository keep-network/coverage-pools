const { expect } = require("chai")
const {
  to1e18,
  to1ePrecision,
  increaseTime,
} = require("./helpers/contract-test-helpers")

describe("CoveragePool", () => {
  let coveragePool
  let testToken
  let governance
  let underwriter
  let recipient
  let riskManager
  let thirdParty

  beforeEach(async () => {
    // Governance that owns Coverage Pool
    governance = await ethers.getSigner(1)
    // Underwriter that will deposit some amount of tokens to Asset Pool
    underwriter = await ethers.getSigner(2)
    // Recipient that will recive seized funds
    recipient = await ethers.getSigner(3)
    // Risk Manager that will seize funds
    riskManager = await ethers.getSigner(4)
    // Account that is not authorized to call functions on Coverage Pool
    thirdParty = await ethers.getSigner(5)

    const TestToken = await ethers.getContractFactory("TestToken")
    testToken = await TestToken.deploy()
    await testToken.deployed()

    const UnderwriterToken = await ethers.getContractFactory("UnderwriterToken")
    const underwriterToken = await UnderwriterToken.deploy(
      "Underwriter Token",
      "COV"
    )
    await underwriterToken.deployed()

    const AssetPool = await ethers.getContractFactory("AssetPool")
    const assetPool = await AssetPool.deploy(
      testToken.address,
      underwriterToken.address
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

    context("when caller is the governance", () => {
      beforeEach(async () => {
        await coveragePool
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
          .beginRiskManagerApproval(riskManager.address)
      })

      context("when approval delay has not elapsed", () => {
        beforeEach(async () => {
          // wait for less than the risk manager governance delay
          await increaseTime(29 * 24 * 3600)
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
        beforeEach(async () => {
          // wait for the risk manager governance delay
          await increaseTime(30 * 24 * 3600)

          await coveragePool
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
      })
    })
  })

  describe("beginRiskManagerUnapproval", () => {
    context("when risk manager is not approved", () => {
      it("should revert", async () => {
        await expect(
          coveragePool
            .connect(governance)
            .beginRiskManagerUnapproval(riskManager.address)
        ).to.be.revertedWith("Risk manager not approved")
      })
    })

    context("when risk manager is approved", () => {
      beforeEach(async () => {
        // aprove risk manager
        await coveragePool
          .connect(governance)
          .beginRiskManagerApproval(riskManager.address)
        await increaseTime(30 * 24 * 3600)
        await coveragePool
          .connect(governance)
          .finalizeRiskManagerApproval(riskManager.address)
      })

      context("when caller is not the governance", () => {
        it("should revert", async () => {
          await expect(
            coveragePool
              .connect(thirdParty)
              .beginRiskManagerUnapproval(riskManager.address)
          ).to.be.revertedWith("Ownable: caller is not the owner")
        })
      })

      context("when caller is the governance", () => {
        beforeEach(async () => {
          await coveragePool
            .connect(governance)
            .beginRiskManagerUnapproval(riskManager.address)
        })

        it("should not unapprove risk manager", async () => {
          expect(await coveragePool.approvedRiskManagers(riskManager.address))
            .to.be.true
        })

        it("should store unapproval process begin timestamp", async () => {
          expect(
            await coveragePool.riskManagerUnapprovalTimestamps(
              riskManager.address
            )
          ).to.be.above(0)
        })
      })
    })
  })

  describe("finalizeRiskManagerUnapproval", () => {
    beforeEach(async () => {
      // aprove risk manager
      await coveragePool
        .connect(governance)
        .beginRiskManagerApproval(riskManager.address)
      await increaseTime(30 * 24 * 3600)
      await coveragePool
        .connect(governance)
        .finalizeRiskManagerApproval(riskManager.address)
    })

    context("when caller is not the governance", () => {
      it("should revert", async () => {
        await expect(
          coveragePool
            .connect(thirdParty)
            .finalizeRiskManagerUnapproval(riskManager.address)
        ).to.be.revertedWith("Ownable: caller is not the owner")
      })
    })

    context("when unapproval was not initiated", () => {
      it("should revert", async () => {
        await expect(
          coveragePool
            .connect(governance)
            .finalizeRiskManagerUnapproval(riskManager.address)
        ).to.be.revertedWith("Risk manager unapproval not initiated")
      })
    })

    context("when approval was initiated", () => {
      beforeEach(async () => {
        await coveragePool
          .connect(governance)
          .beginRiskManagerUnapproval(riskManager.address)
      })

      context("when governance delay has not elapsed", () => {
        beforeEach(async () => {
          // wait for less than the risk manager governance delay
          await increaseTime(29 * 24 * 3600)
        })

        it("should revert", async () => {
          await expect(
            coveragePool
              .connect(governance)
              .finalizeRiskManagerUnapproval(riskManager.address)
          ).to.be.revertedWith("Risk manager governance delay has not elapsed")
        })
      })

      context("when approval delay has passed", () => {
        beforeEach(async () => {
          // wait for the risk manager governance delay
          await increaseTime(30 * 24 * 3600)

          await coveragePool
            .connect(governance)
            .finalizeRiskManagerUnapproval(riskManager.address)
        })

        it("should remove unapproval process begin timestamp", async () => {
          expect(
            await coveragePool.riskManagerUnapprovalTimestamps(
              riskManager.address
            )
          ).to.be.equal(0)
        })

        it("should unapprove risk manager", async () => {
          expect(await coveragePool.approvedRiskManagers(riskManager.address))
            .to.be.false
        })
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
        // approve risk manager
        await coveragePool
          .connect(governance)
          .beginRiskManagerApproval(riskManager.address)
        await increaseTime(30 * 24 * 3600)
        await coveragePool
          .connect(governance)
          .finalizeRiskManagerApproval(riskManager.address)
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
    })
  })
})
