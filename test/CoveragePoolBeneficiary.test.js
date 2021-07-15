const chai = require("chai")

const expect = chai.expect
const { to1e18 } = require("./helpers/contract-test-helpers")

describe("CoveragePoolBeneficiary", () => {
  const transferAmount = to1e18(4242)

  let owner
  let rewardToken
  let rewardManager
  let assetPool
  let thirdParty

  before(async () => {
    owner = await ethers.getSigner(0)
    thirdParty = await ethers.getSigner(1)
    rewardManager = await ethers.getSigner(2)
    assetPool = await ethers.getSigner(3)

    const TestToken = await ethers.getContractFactory("TestToken")
    rewardToken = await TestToken.deploy()
    await rewardToken.deployed()

    const RewardsPool = await ethers.getContractFactory("RewardsPool")
    rewardsPool = await RewardsPool.deploy(
      rewardToken.address,
      assetPool.address,
      rewardManager.address
    )
    await rewardsPool.deployed()

    const CoveragePoolBeneficiary = await ethers.getContractFactory(
      "CoveragePoolBeneficiary"
    )
    coveragePoolBeneficiary = await CoveragePoolBeneficiary.deploy(
      rewardToken.address,
      rewardsPool.address
    )
    await coveragePoolBeneficiary.deployed()
    await rewardsPool
      .connect(rewardManager)
      .transferOwnership(coveragePoolBeneficiary.address)

    await rewardToken.mint(owner.address, to1e18(100000))
    await rewardToken
      .connect(owner)
      .transfer(coveragePoolBeneficiary.address, transferAmount)
  })

  describe("__escrowSentTokens", () => {
    context("when a caller is not the owner", () => {
      it("should revert", async () => {
        await expect(
          coveragePoolBeneficiary
            .connect(thirdParty)
            .__escrowSentTokens(transferAmount)
        ).to.be.revertedWith("Ownable: caller is not the owner")
      })
    })

    context("when a caller is the owner", () => {
      it("should top up reward pool", async () => {
        const tx = await coveragePoolBeneficiary
          .connect(owner)
          .__escrowSentTokens(transferAmount)

        await expect(tx)
          .to.emit(rewardsPool, "RewardToppedUp")
          .withArgs(transferAmount)
      })
    })
  })
})
