const { expect } = require("chai")

const {
  to1e18,
  lastBlockTime,
  increaseTime,
  to1ePrecision,
} = require("./helpers/contract-test-helpers")

describe("RewardsPool", () => {
  let rewardToken
  let pool

  let rewardManager

  beforeEach(async () => {
    const TestToken = await ethers.getContractFactory("TestToken")
    rewardToken = await TestToken.deploy()
    await rewardToken.deployed()

    const RewardsPool = await ethers.getContractFactory("RewardsPool")
    pool = await RewardsPool.deploy(rewardToken.address)
    await pool.deployed()

    rewardManager = await ethers.getSigner(1)
    await rewardToken.mint(rewardManager.address, to1e18(10000000000))
  })

  describe("topUpReward", () => {
    const shouldBehaveCorrectly = (
      topUpAmount,
      expectedBalance,
      expectedRewardRate
    ) => {
      let tx

      beforeEach(async () => {
        await rewardToken
          .connect(rewardManager)
          .approve(pool.address, topUpAmount)
        tx = await pool.connect(rewardManager).topUpReward(topUpAmount)
      })

      it("should transfer reward tokens to the pool", async () => {
        expect(await rewardToken.balanceOf(pool.address)).to.equal(
          expectedBalance
        )
      })

      it("should emit RewardToppedUp event", async () => {
        await expect(tx).to.emit(pool, "RewardToppedUp").withArgs(topUpAmount)
      })

      it("should fail when reward tokens cannot be transferred", async () => {
        // the entire allowance was spent in beforeEach
        await expect(
          pool.connect(rewardManager).topUpReward(topUpAmount)
        ).to.be.revertedWith("ERC20: transfer amount exceeds allowance")
      })

      it("should update period finish", async () => {
        const oneWeekLater = (await lastBlockTime()) + 604800
        expect(await pool.periodFinish()).to.equal(oneWeekLater)
      })

      it("should note the update time", async () => {
        expect(await pool.lastUpdateTime()).to.equal(await lastBlockTime())
      })

      it("should recalculate reward rate", async () => {
        expect(await pool.rewardRate()).to.be.closeTo(
          expectedRewardRate,
          to1ePrecision(1, 13) // 0.00001 precision
        )
      })
    }

    context("when there are no rewards in the pool", () => {
      const topUpAmount = to1e18(100000)
      const expectedBalance = topUpAmount
      // 100000 reward tokens, one week (604800 sec) reward interval
      // Reward rate: 100000 / 604800 = ~0.1653439153439(153439)
      const expectedRewardRate = "165343915343915343"
      shouldBehaveCorrectly(topUpAmount, expectedBalance, expectedRewardRate)
    })

    context(
      "when there are rewards in the pool and interval is still pending",
      () => {
        const originalAmount = to1e18(250000)

        beforeEach(async () => {
          await rewardToken
            .connect(rewardManager)
            .approve(pool.address, originalAmount)
          await pool.connect(rewardManager).topUpReward(originalAmount)

          await increaseTime(86400) // 1 day, interval is still pending
        })

        const topUpAmount = to1e18(100000)
        const expectedBalance = originalAmount.add(topUpAmount)
        // 250 000 reward tokens initially, one week reward interval
        // 250 000 / 7 = ~35 714.28 tokens spent the first day
        // 250 000 - 35 714.28 = 214 285.72 tokens remaining
        // After the top-up: 100 000 + 214 285.72 = 314 285.72 reward tokens and
        // one week (604800 sec) reward interval.
        // Reward rate: 314 285.72 / 604800 = ~0.5196523148(148)
        const expectedRewardRate = "519652314814814814"
        shouldBehaveCorrectly(topUpAmount, expectedBalance, expectedRewardRate)
      }
    )

    context("when there are rewards in the pool and interval ended", () => {
      const originalAmount = to1e18(250000)

      beforeEach(async () => {
        await rewardToken
          .connect(rewardManager)
          .approve(pool.address, originalAmount)
        await pool.connect(rewardManager).topUpReward(originalAmount)

        await increaseTime(691200) // 8 days, interval ended
      })

      const topUpAmount = to1e18(100000)
      const expectedBalance = originalAmount.add(topUpAmount)
      // 100000 reward tokens, one week (604800 sec) reward interval
      // Previous interval ended, all tokens spent.
      // Reward rate: 100000 / 604800 = ~0.1653439153439(153439)
      const expectedRewardRate = "165343915343915343"
      shouldBehaveCorrectly(topUpAmount, expectedBalance, expectedRewardRate)
    })
  })
})
