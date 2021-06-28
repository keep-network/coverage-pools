const { expect } = require("chai")

const {
  to1e18,
  to1ePrecision,
  lastBlockTime,
  increaseTime,
  pastEvents,
} = require("./helpers/contract-test-helpers")

describe("RewardsPool", () => {
  let rewardToken
  let pool

  let rewardManager
  let assetPool
  let thirdParty

  beforeEach(async () => {
    rewardManager = await ethers.getSigner(1)
    assetPool = await ethers.getSigner(2)
    thirdParty = await ethers.getSigner(3)

    const TestToken = await ethers.getContractFactory("TestToken")
    rewardToken = await TestToken.deploy()
    await rewardToken.deployed()

    const RewardsPool = await ethers.getContractFactory("RewardsPool")
    pool = await RewardsPool.deploy(
      rewardToken.address,
      assetPool.address,
      rewardManager.address
    )
    await pool.deployed()

    await rewardToken.mint(rewardManager.address, to1e18(500000))
    await rewardToken.mint(thirdParty.address, to1e18(500000))
  })

  describe("topUpReward", () => {
    context("when called by the owner", () => {
      beforeEach(async () => {
        await rewardToken
          .connect(rewardManager)
          .approve(pool.address, to1e18(1))
      })

      it("should not revert", async () => {
        await pool.connect(rewardManager).topUpReward(to1e18(1))
        // ok, did not revert
      })
    })

    context("when called by non-owner", () => {
      beforeEach(async () => {
        await rewardToken.connect(thirdParty).approve(pool.address, to1e18(1))
      })

      it("should revert", async () => {
        await expect(
          pool.connect(thirdParty).topUpReward(to1e18(1))
        ).to.be.revertedWith("Ownable: caller is not the owner")
      })
    })

    const shouldBehaveCorrectly = (
      topUpAmount,
      expectedContractBalance,
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
          expectedContractBalance
        )
      })

      it("should revert when reward tokens could not be transferred", async () => {
        // the entire allowance was spent in beforeEach
        await expect(
          pool.connect(rewardManager).topUpReward(topUpAmount)
        ).to.be.revertedWith("ERC20: transfer amount exceeds allowance")
      })

      it("should emit RewardToppedUp event", async () => {
        await expect(tx).to.emit(pool, "RewardToppedUp").withArgs(topUpAmount)
      })

      it("should update interval finish to one week later", async () => {
        expect(await pool.intervalFinish()).to.equal(
          (await lastBlockTime()) + 604800
        )
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

    context("when allocating first interval", () => {
      const topUpAmount = to1e18(100000)
      const expectedBalance = topUpAmount
      // 100000 reward tokens
      // one week (604800 sec) reward interval
      //
      // 100000 / 604800 = ~0.1653439153439(153439)
      const expectedRewardRate = "165343915343915343"

      shouldBehaveCorrectly(topUpAmount, expectedBalance, expectedRewardRate)
    })

    context("when interval ended and allocating new one", () => {
      const originalAmount = to1e18(250000)
      const topUpAmount = to1e18(100000)
      const expectedBalance = originalAmount.add(topUpAmount)
      const delay = 691200 // 8 days
      // 100000 reward tokens
      // one week (604800 sec) reward interval
      //
      // 100000 / 604800 = ~0.1653439153439(153439)
      const expectedRewardRate = "165343915343915343"

      beforeEach(async () => {
        await rewardToken
          .connect(rewardManager)
          .approve(pool.address, originalAmount)
        await pool.connect(rewardManager).topUpReward(originalAmount)
        await increaseTime(delay)
      })

      shouldBehaveCorrectly(topUpAmount, expectedBalance, expectedRewardRate)
    })

    context("when interval is pending and allocating new one", () => {
      const originalAmount = to1e18(250000)
      const topUpAmount = to1e18(100000)
      const expectedBalance = originalAmount.add(topUpAmount)
      const delay = 86400 // 1 day
      // 250 000 reward tokens initially
      //
      // 250 000 / 7 = ~35 714.28 tokens spent the first day
      // 250 000 - 35 714.28 = 214 285.72 tokens remaining
      //
      // 100 000 + 214 285.72 = 314 285.72 reward tokens after the top-up
      // 314 285.72 / 604800 = ~0.5196523148(148)
      const expectedRewardRate = "519652314814814814"

      beforeEach(async () => {
        await rewardToken
          .connect(rewardManager)
          .approve(pool.address, originalAmount)
        await pool.connect(rewardManager).topUpReward(originalAmount)
        await increaseTime(delay)
      })

      shouldBehaveCorrectly(topUpAmount, expectedBalance, expectedRewardRate)
    })
  })

  describe("earned", () => {
    context("when reward interval is in progress", async () => {
      beforeEach(async () => {
        const rewardAmount = to1e18(250000)
        await rewardToken
          .connect(rewardManager)
          .approve(pool.address, rewardAmount)
        await pool.connect(rewardManager).topUpReward(rewardAmount)

        await increaseTime(86400) // +1 day
      })

      it("should return amount proportional to the time passed", async () => {
        expect(await pool.earned()).to.be.closeTo(
          to1e18(35714), // 250 000 * 1/7 = ~35 714
          to1e18(1)
        )
      })
    })

    context("when rewards were not yet allocated", () => {
      it("should return zero", async () => {
        expect(await pool.earned()).to.equal(0)
      })
    })

    context(
      "when the last interval ended and rewards were fully withdrawn",
      () => {
        beforeEach(async () => {
          const rewardAmount = to1e18(250000)
          await rewardToken
            .connect(rewardManager)
            .approve(pool.address, rewardAmount)
          await pool.connect(rewardManager).topUpReward(rewardAmount)

          await increaseTime(604800) // +7 days
          await pool.withdraw()
        })

        it("should return zero", async () => {
          expect(await pool.earned()).to.equal(0)
        })
      }
    )

    context(
      "when the last interval ended and rewards were not withdrawn",
      () => {
        beforeEach(async () => {
          const rewardAmount = to1e18(250000)
          await rewardToken
            .connect(rewardManager)
            .approve(pool.address, rewardAmount)
          await pool.connect(rewardManager).topUpReward(rewardAmount)

          await increaseTime(604800) // +7 days
        })

        it("should return full reward amount", async () => {
          expect(await pool.earned()).to.be.closeTo(to1e18(250000), to1e18(1))
        })
      }
    )

    context(
      "when the last interval ended and rewards were partially withdrawn",
      () => {
        beforeEach(async () => {
          const rewardAmount = to1e18(250000)
          await rewardToken
            .connect(rewardManager)
            .approve(pool.address, rewardAmount)
          await pool.connect(rewardManager).topUpReward(rewardAmount)

          await increaseTime(86400) // +1 day
          await pool.withdraw()
          await increaseTime(604800) // +7 days
        })

        it("should return amount of not yet withdrawn rewards", async () => {
          // 250 000 * 1/7 = ~35 714 withdrawn after the first day
          // 250 000 * 6/7 = ~214 285 remaining available for withdrawal
          expect(await pool.earned()).to.be.closeTo(to1e18(214285), to1e18(1))
        })
      }
    )

    context(
      "when the previous interval ended without withdrawing and a new one is pending",
      () => {
        beforeEach(async () => {
          const rewardAmount = to1e18(250000)
          await rewardToken
            .connect(rewardManager)
            .approve(pool.address, rewardAmount)
          await pool.connect(rewardManager).topUpReward(rewardAmount)

          await increaseTime(604800) // +7 days

          await rewardToken
            .connect(rewardManager)
            .approve(pool.address, rewardAmount)
          await pool.connect(rewardManager).topUpReward(rewardAmount)

          await increaseTime(86400) // +1 day
        })

        it("should add amount from the previous interval", async () => {
          // 250 000 not yet withdrawn from the previous interval
          // 250 000 * 1/7 = ~35 714 allocated so far in the current interval
          // 250 000 + 35 714 = 285714
          expect(await pool.earned()).to.be.closeTo(to1e18(285714), to1e18(1))
        })
      }
    )

    context(
      "when the previous interval ended with partial withdrawal and a new one is pending",
      () => {
        beforeEach(async () => {
          const rewardAmount = to1e18(250000)
          await rewardToken
            .connect(rewardManager)
            .approve(pool.address, rewardAmount)
          await pool.connect(rewardManager).topUpReward(rewardAmount)

          await increaseTime(259200) // +3 days
          await pool.withdraw()
          await increaseTime(345600) // +4 days

          await rewardToken
            .connect(rewardManager)
            .approve(pool.address, rewardAmount)
          await pool.connect(rewardManager).topUpReward(rewardAmount)

          await increaseTime(86400) // +1 day
        })

        it("should add remaining amount from the previous interval", async () => {
          // 250 000 * 3/7 withdrawn from the last interval
          // 250 000 * 4/7 = ~142857.14 remaining from the last interval
          // 250 000 * 1/7 = ~35714.28 earned so far in the current interval
          //
          // 142857.14 + 35714.28 = 178571.42
          expect(await pool.earned()).to.be.closeTo(to1e18(178571), to1e18(1))
        })
      }
    )
  })

  describe("withdraw", () => {
    const rewardAmount = to1e18(100000)

    beforeEach(async () => {
      await rewardToken
        .connect(rewardManager)
        .approve(pool.address, rewardAmount)
    })

    it("should not revert when rewards were not yet allocated", async () => {
      await pool.withdraw()
      // ok, did not revert
    })

    it("should not revert when rewards ended", async () => {
      await pool.connect(rewardManager).topUpReward(rewardAmount)
      await increaseTime(691200) // +8 days
      await pool.withdraw() // withdraw all rewards

      await pool.withdraw()
      // ok, did not revert
    })

    it("should allow to withdraw rewards over time", async () => {
      await pool.connect(rewardManager).topUpReward(rewardAmount)

      await increaseTime(86400) // +1 days
      await pool.withdraw()
      expect(await rewardToken.balanceOf(assetPool.address)).to.be.closeTo(
        to1e18(14285), // 1/7 * 100 000
        to1e18(1)
      )

      await increaseTime(172800) // + 2 days
      await pool.withdraw()
      expect(await rewardToken.balanceOf(assetPool.address)).to.be.closeTo(
        to1e18(42857), // (1/7 + 2/7) * 100 000
        to1e18(1)
      )
    })

    it("should emit RewardWithdrawn event", async () => {
      await pool.connect(rewardManager).topUpReward(rewardAmount)

      await increaseTime(86400) // +1 days
      const tx = await pool.withdraw()
      const receipt = await tx.wait()
      const events = pastEvents(receipt, pool, "RewardWithdrawn")
      expect(events.length).to.equal(1)
      expect(events[0].args["amount"]).to.be.closeTo(
        to1e18(14285), // 1/7 * 100 000
        to1e18(1)
      )
    })
  })
})
