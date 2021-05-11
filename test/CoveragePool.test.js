const { expect } = require("chai")
const { to1e18, to1ePrecision } = require("./helpers/contract-test-helpers")

describe("CoveragePool", () => {
  let coveragePool
  let testToken
  let owner
  let underwriter
  let recipient
  let approvedRiskManager

  beforeEach(async () => {
    // Owner of Coverage Pool
    owner = await ethers.getSigner(1)
    // Underwriter that will deposit some amount of tokens to Asset Pool
    underwriter = await ethers.getSigner(2)
    // Recipient that will recive seized funds
    recipient = await ethers.getSigner(3)
    // Risk Manager that will be approved
    approvedRiskManager = await ethers.getSigner(4)

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

    await coveragePool.transferOwnership(owner.address)
    await assetPool.transferOwnership(coveragePool.address)
    await underwriterToken.transferOwnership(assetPool.address)

    // Deposit 400 tokens to the asset pool
    await testToken.mint(underwriter.address, to1e18(400))
    await testToken.connect(underwriter).approve(assetPool.address, to1e18(400))
    await assetPool.connect(underwriter).deposit(to1e18(400))
  })

  describe("seizeFunds", () => {
    // TODO: Add a testcase where the caller is not an approved Risk Manager

    context("when caller is the approved Risk Manager", () => {
      // TODO: When the check for approved Risk Manager is implemented,
      // call approve on the Risk Manager

      // Portion to seize is 0.345987 (multiplied by 10^18 to save precision)
      const portionToSeize = to1ePrecision(345987, 12)
      // Expected amount is 400 * 0.345987 = 138.3948 (multiplied by 10^18)
      const amountSeized = to1ePrecision(1383948, 14)
      it("transfers seized funds to recipient account", async () => {
        await coveragePool
          .connect(approvedRiskManager)
          .seizeFunds(recipient.address, portionToSeize)
        expect(await testToken.balanceOf(recipient.address)).to.be.equal(
          amountSeized
        )
      })
    })
  })
})
