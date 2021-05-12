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

  beforeEach(async () => {
    // Governance that owns Coverage Pool
    governance = await ethers.getSigner(1)
    // Underwriter that will deposit some amount of tokens to Asset Pool
    underwriter = await ethers.getSigner(2)
    // Recipient that will recive seized funds
    recipient = await ethers.getSigner(3)
    // Risk Manager that will seize funds
    riskManager = await ethers.getSigner(4)

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

    const CoveragePoolConstants = await ethers.getContractFactory(
      "CoveragePoolConstants"
    )
    const coveragePoolConstants = await CoveragePoolConstants.deploy()
    await coveragePoolConstants.deployed()

    const CoveragePool = await ethers.getContractFactory("CoveragePool", {
      libraries: {
        CoveragePoolConstants: coveragePoolConstants.address,
      },
    })
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

  describe("approveRiskManager", () => {
    context("when caller is not the governance", () => {
      it("should revert", async () => {
        const notGovernance = await ethers.getSigner(5)
        await expect(
          coveragePool
            .connect(notGovernance)
            .approveRiskManager(riskManager.address)
        ).to.be.revertedWith("Ownable: caller is not the owner")
      })
    })

    context("when caller is the governance", () => {
      beforeEach(async () => {
        await coveragePool
          .connect(governance)
          .approveRiskManager(riskManager.address)
      })
      it("timestamp of risk manager approval should be stored", async () => {
        expect(
          await coveragePool.riskManagerApprovalTimestamps(riskManager.address)
        ).to.be.above(0)
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
          .approveRiskManager(riskManager.address)
      })

      context("when approval delay has not elapsed", () => {
        beforeEach(async () => {
          // Wait for less than delay approval time
          await increaseTime(13 * 24 * 3600)
        })

        it("should revert", async () => {
          await expect(
            coveragePool.connect(riskManager).seizeFunds(recipient.address, 123)
          ).to.be.revertedWith("Approval delay has not elapsed")
        })
      })

      context("when approval delay has elapsed", () => {
        beforeEach(async () => {
          // Wait for delay approval time
          await increaseTime(14 * 24 * 3600)
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
})
