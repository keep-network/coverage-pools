const { expect } = require("chai")
const {
  to1e18,
  to1ePrecision,
  increaseTime,
} = require("../helpers/contract-test-helpers")

describe("RewardPool", () => {
  const assetPool1 = "0x0000000000000000000000000000000000000001"
  const assetPool2 = "0x0000000000000000000000000000000000000002"
  const assetPool3 = "0x0000000000000000000000000000000000000003"

  let pool

  beforeEach(async () => {
    const RewardPool = await ethers.getContractFactory("RewardPool")
    pool = await RewardPool.deploy()
    await pool.deployed()
  })

  describe("earned", () => {
    context("when there is one asset pool", () => {
      context("when reward rate is constant", () => {
        beforeEach(async () => {
          // hardhat will mine the transaction in a new block with +1s block
          // time, hence +1s
          await pool.setRewardRate(assetPool1, to1ePrecision(15, 17)) // +1s
          await increaseTime(1000)
        })

        it("should mint reward tokens per second proportionally to the reward rate", async () => {
          // For the first 1 second (setRewardRate):
          //   0 reward tokens are minted
          //
          // For the next 1000 seconds:
          //   1.5 * 1000 = 1500 reward tokens minted for assetPool1
          expect(await pool.earned(assetPool1)).to.equal(to1e18(1500))
        })
      })

      context("when reward rate gets updated", () => {
        beforeEach(async () => {
          await pool.setRewardRate(assetPool1, to1ePrecision(15, 17)) // +1s
          await increaseTime(500)
          await pool.setRewardRate(assetPool1, to1e18(2)) // + 1s
          await increaseTime(100)
        })

        it("should mint reward tokens per second proportionally to the reward rate", async () => {
          // For the first 1 second (setRewardRate):
          //   0 reward tokens are minted
          //
          // For the next 500 seconds:
          //   1.5 * 500 = 750 reward tokens minted for assetPool1
          //
          // For the next 1 second (setRewardRate):
          //   1.5 * 1 = 1.5 reward tokens minted for assetPool1
          //
          // For the next 100 seconds:
          //   2 * 100 = 200 reward tokens minted for assetPool1
          //
          // At the end:
          //   assetPool1: 750 + 1.5 + 200 = 951.5
          expect(await pool.earned(assetPool1)).to.equal(
            to1ePrecision(9515, 17)
          )
        })
      })

      context("when reward rate is set to zero all the time", () => {
        beforeEach(async () => {
          await pool.setRewardRate(assetPool1, 0) // +1s
          await increaseTime(500)
        })

        it("should not mint any reward tokens", async () => {
          // For the first 1 second (setRewardRate):
          //   0 reward tokens are minted
          //
          // For the next 500 seconds:
          //   0 reward tokens are minted
          expect(await pool.earned(assetPool1)).to.equal(0)
        })
      })

      context(
        "when reward rate starts at zero and is set to non-zero after some time",
        () => {
          beforeEach(async () => {
            await pool.setRewardRate(assetPool1, 0) // +1s
            await increaseTime(500)
            await pool.setRewardRate(assetPool1, to1ePrecision(15, 17)) // +1s
            await increaseTime(100)
          })

          it("should start minting reward tokens after the rate update", async () => {
            // For the first 1 second (setRewardRate):
            //   0 reward tokens are minted
            //
            // For the next 500 seconds:
            //   0 reward tokens are minted
            //
            // For the next 1 second (setRewardRate):
            //   0 reward tokens are minted
            //
            // For the next 100 seconds:
            //   1.5 * 100 = 150 reward tokens minted
            //
            // At the end:
            //   assetPool1: 150
            expect(await pool.earned(assetPool1)).to.equal(to1e18(150))
          })
        }
      )

      context("when reward rate after some time is set to zero", () => {
        beforeEach(async () => {
          await pool.setRewardRate(assetPool1, to1e18(1)) // +1s
          await increaseTime(100)
          await pool.setRewardRate(assetPool1, to1e18(0)) // +1s
          await increaseTime(100)
        })

        it("should mint reward tokens for the time reward rate was non-zero", async () => {
          // For the first 1 second (setRewardRate):
          //   0 reward tokens are minted
          //
          // For the next 100 seconds:
          //   1 * 100 = 100 reward tokens are minted
          //
          // For the next 1 second (setRewardRate):
          //   1 * 1 = 1 reward tokens are minted
          //
          // For the next 100 seconds:
          //   0 reward tokens are minted
          //
          // At the end:
          //   assetPool1: 100 + 1 = 101
          expect(await pool.earned(assetPool1)).to.equal(to1e18(101))
        })
      })

      context(
        "when reward rate after some time is set to zero and then set to non-zero again",
        () => {
          beforeEach(async () => {
            await pool.setRewardRate(assetPool1, to1e18(1)) // +1s
            await increaseTime(100)
            await pool.setRewardRate(assetPool1, to1e18(0)) // +1s
            await increaseTime(100)
            await pool.setRewardRate(assetPool1, to1ePrecision(15, 17)) // +1s
            await increaseTime(100)
          })

          it("should not mint reward tokens for the time reward rate was zero", async () => {
            // For the first 1 second (setRewardRate):
            //   0 reward tokens are minted
            //
            // For the next 100 seconds:
            //   1 * 100 = 100 reward tokens are minted
            //
            // For the next 1 second (setRewardRate):
            //   1 * 1 = 1 reward tokens are minted
            //
            // For the next 100 seconds:
            //   0 reward tokens are minted
            //
            // For the next 1 second (setRewardRate):
            //   0 reward tokens are minted
            //
            // For the next 100 seconds:
            //   1.5 * 100 = 150 reward tokens minted
            //
            // At the end:
            //   assetPool1: 100 + 1 + 150 = 251
            expect(await pool.earned(assetPool1)).to.equal(to1e18(251))
          })
        }
      )
    })

    context("when there are more than one asset pool", () => {
      context(
        "when asset pools are registered roughly at the same time",
        () => {
          beforeEach(async () => {
            await pool.setRewardRate(assetPool1, to1e18(10)) // +1s
            await pool.setRewardRate(assetPool2, to1e18(5)) // +1s
            await increaseTime(100)
          })

          it("should mint reward tokens per second proportionally to the reward rate", async () => {
            // For the first 1 second (setRewardRate for assetPool1):
            //   0 reward tokens are minted
            //
            // For the next 1 second (setRewardRate for assetPool2):
            //   10 reward tokens minted for assetPool1
            //
            // For the next 100 seconds:
            //   10 * 100 = 1000 reward tokens minted for assetPool1
            //   5 * 100 = 500 reward tokens minted for assetPool2
            //
            // At the end:
            //   assetPool1: 10 + 1000 = 1010
            //   assetPool2: 500
            expect(await pool.earned(assetPool1)).to.equal(to1e18(1010))
            expect(await pool.earned(assetPool2)).to.equal(to1e18(500))
          })
        }
      )

      context("when asset pools are registered at different time", () => {
        beforeEach(async () => {
          await pool.setRewardRate(assetPool1, to1e18(10)) // +1s
          await increaseTime(10)
          await pool.setRewardRate(assetPool2, to1e18(20)) // +1s
          await increaseTime(10)
          await pool.setRewardRate(assetPool3, to1e18(30)) // +1s
          await increaseTime(100)
        })

        it("should mint reward tokens per second proportionally to the reward rate", async () => {
          // For the first 1 second (setRewardRate for assetPool1):
          //   0 reward tokens minted
          //
          // For the next 10 seconds:
          //   10 * 10 = 100 reward tokens minted for assetPool1
          //
          // For the next 1 second (setRewardRate for assetPool2):
          //   10 * 1 = 10 reward tokens minted for assetPool1
          //
          // For the next 10 seconds:
          //   10 * 10 = 100 reward tokens minted for assetPool1
          //   20 * 10 = 200 reward tokens minted for assetPool2
          //
          // For the next 1 second (setRewardRate for assetPool3)
          //   10 * 1 = 10 reward tokens minted for assetPool1
          //   20 * 1 = 20 reward tokens minted for assetPool2
          //
          // For the next 100 seconds:
          //   10 * 100 = 1000 reward tokens minted for assetPool1
          //   20 * 100 = 2000 reward tokens minted for assetPool2
          //   30 * 100 = 3000 reward tokens minted for assetPool2
          //
          // At the end:
          //   assetPool1: 100 + 10 + 100 + 10 + 1000 = 1220
          //   assetPool2: 200 + 20 + 2000 = 2220
          //   assetPool3: 3000
          expect(await pool.earned(assetPool1)).to.equal(to1e18(1220))
          expect(await pool.earned(assetPool2)).to.equal(to1e18(2220))
          expect(await pool.earned(assetPool3)).to.equal(to1e18(3000))
        })
      })

      context(
        "when pools are registered roughly at the same time and reward rates are getting updated",
        () => {
          beforeEach(async () => {
            await pool.setRewardRate(assetPool1, to1ePrecision(15, 17)) // +1s
            await pool.setRewardRate(assetPool2, to1e18(3)) // +1s
            await pool.setRewardRate(assetPool3, to1e18(5)) // +1s
            await increaseTime(10)
            await pool.setRewardRate(assetPool2, to1ePrecision(15, 17)) // +1s
            await pool.setRewardRate(assetPool3, to1e18(1)) // +1s
            await increaseTime(5)
          })

          it("should mint reward tokens per second proportionally to the reward rate", async () => {
            // For the first 1 second (setRewardRate for assetPool1):
            //   0 reward tokens minted
            //
            // For the next 1 second (setRewardRate for assetPool2):
            //   1.5 * 1 = 1.5 reward tokens minted for assetPool1
            //
            // For the next 1 second (setRewardRate for assetPool3):
            //   1.5 * 1 = 1.5 reward tokens minted for assetPool1
            //   3 * 1 = 3 reward tokens minted for assetPool2
            //
            // For the next 10 seconds:
            //   1.5 * 10 = 15 reward tokens minted for assetPool1
            //   3 * 10 = 30 reward tokens minted for assetPool2
            //   5 * 10 = 50 reward tokens minted for assetPool3
            //
            // For the next 1 second (setRewardRate for assetPool2):
            //   1.5 * 1 = 1.5 reward tokens minted for assetPool1
            //   3 * 1 = 3 reward tokens minted for assetPool2
            //   5 * 1 = 5 reward tokens minted for assetPool3
            //
            // For the next 1 seconds (setRewardRate for assetPool3):
            //   1.5 * 1 = 1.5 reward tokens minted for assetPool1
            //   1.5 * 1 = 1.5 reward tokens minted for assetPool2
            //   5 * 1 = 5 reward tokens minted for assetPool3
            //
            // For the next 5 seconds:
            //   1.5 * 5 = 7.5 reward tokens minted for assetPool1
            //   1.5 * 5 = 7.5 reward tokens minted for assetPool2
            //   1 * 5 = 5 reward tokens minted for assetPool3
            //
            // At the end:
            //   assetPool1: 1.5 + 1.5 + 15 + 1.5 + 1.5 + 7.5 = 28.5
            //   assetPool2: 3 + 30 + 3 + 1.5 + 7.5 = 45
            //   assetPool3: 50 + 5 + 5 + 5 = 65
            expect(await pool.earned(assetPool1)).to.equal(
              to1ePrecision(285, 17)
            )
            expect(await pool.earned(assetPool2)).to.equal(to1e18(45))
            expect(await pool.earned(assetPool3)).to.equal(to1e18(65))
          })
        }
      )

      context(
        "when asset pools are registered at different time and reward rates are getting updated",
        () => {
          beforeEach(async () => {
            await pool.setRewardRate(assetPool1, to1ePrecision(15, 17)) // +1s
            await increaseTime(100)
            await pool.setRewardRate(assetPool1, to1e18(2)) // +1s
            await pool.setRewardRate(assetPool2, to1e18(1)) // +1s
            await increaseTime(10)
            await pool.setRewardRate(assetPool1, to1e18(3)) // +1s
            await pool.setRewardRate(assetPool3, to1e18(1)) // +1s
            await increaseTime(5)
          })

          it("should mint reward tokens per second proportionally to the reward rate", async () => {
            // For the first 1 second (setRewardRate for assetPool1):
            //   0 reward tokens are minted
            //
            // For the next 100 seconds:
            //   1.5 * 100 = 150 reward tokens minted for assetPool1
            //
            // For the next 1 second (setRewardRate for assetPool1):
            //   1.5 * 1 = 1.5 reward tokens minted for assetPool1
            //
            // For the next 1 second (setRewardRate for assetPool2):
            //   2 * 1 = 2 reward tokens minted for assetPool1
            //
            // For the next 10 seconds:
            //   2 * 10 = 20 reward tokens minted for assetPool1
            //   1 * 10 = 10 reward tokens minted for assetPool2
            //
            // For the next 1 second (setRewardRate for assetPool1):
            //   2 * 1 = 2 reward tokens minted for assetPool1
            //   1 * 1 = 1 reward tokens minted for assetPool2
            //
            // For the next 1 second (setRewardRate for assetPool3):
            //   3 * 1 = 3 reward tokens minted for assetPool1
            //   1 * 1 = 1 reward tokens minted for assetPool2
            //
            // For the next 5 seconds:
            //   3 * 5 = 15 reward tokens minted for assetPool1
            //   1 * 5 = 5 reward tokens minted for assetPool2
            //   1 * 5 = 5 reward tokens minted for assetPool3
            //
            // At the end:
            //   assetPool1: 150 + 1.5 + 2 + 20 + 2 + 3 + 15 = 193.5
            //   assetPool2: 10 + 1 + 1 + 5 = 17
            //   assetPool3: 5
            expect(await pool.earned(assetPool1)).to.equal(
              to1ePrecision(1935, 17)
            )
            expect(await pool.earned(assetPool2)).to.equal(to1e18(17))
            expect(await pool.earned(assetPool3)).to.equal(to1e18(5))
          })
        }
      )

      context(
        "when reward rate is set to zero all the time for all pools",
        () => {
          beforeEach(async () => {
            await pool.setRewardRate(assetPool1, 0) // +1s
            await pool.setRewardRate(assetPool2, 0) // +1s
            await increaseTime(500)
          })

          it("should not mint any reward tokens", async () => {
            // For the first 1 second (setRewardRate for assetPool1):
            //   0 reward tokens are minted
            //
            // For the next 1 second (setRewardRate for assetPool2):
            //   0 reward tokens are minted
            //
            // For the next 500 seconds:
            //   0 reward tokens are minted
            expect(await pool.earned(assetPool1)).to.equal(0)
            expect(await pool.earned(assetPool2)).to.equal(0)
          })
        }
      )

      context(
        "when one reward rate starts at zero and is updated to non-zero after some time",
        () => {
          beforeEach(async () => {
            await pool.setRewardRate(assetPool1, to1e18(1)) // +1s
            await pool.setRewardRate(assetPool2, 0) // +1s
            await increaseTime(500)
            await pool.setRewardRate(assetPool2, to1ePrecision(15, 17)) // +1s
            await increaseTime(100)
          })

          it("should start minting reward tokens after the rate update", async () => {
            // For the first 1 second (setRewardRate for assetPool1):
            //   0 reward tokens are minted
            //
            // For the next 1 second (setRewardRate for assetPool2):
            //   1 * 1 reward tokens minted for assetPool1
            //
            // For the next 500 seconds:
            //   1 * 500 = 500 reward tokens minted for assetPool1
            //
            // For the next 1 second (setRewardRate for assetPool2):
            //   1 * 1 reward tokens minted for assetPool1
            //
            // For the next 100 seconds:
            //    1 * 100 = 100 reward tokens minted for assetPool1
            //    1.5 * 100 = 150 reward tokens minted for assetPool2
            //
            // At the end:
            //   assetPool1: 1 + 500 + 1 + 100 = 602
            //   assetPool2: 150
            expect(await pool.earned(assetPool1)).to.equal(to1e18(602))
            expect(await pool.earned(assetPool2)).to.equal(to1e18(150))
          })
        }
      )

      context(
        "when one reward rate after some time is set to zero and then to non-zero again",
        () => {
          beforeEach(async () => {
            await pool.setRewardRate(assetPool1, to1e18(1)) // +1s
            await pool.setRewardRate(assetPool2, to1e18(2)) // +1s
            await increaseTime(100)
            await pool.setRewardRate(assetPool1, to1e18(0)) // +1s
            await increaseTime(100)
            await pool.setRewardRate(assetPool1, to1ePrecision(15, 17)) // +1s
            await increaseTime(100)
          })

          it("should not mint reward tokens for the time reward rate was zero", async () => {
            // For the first 1 second (setRewardRate for assetPool1):
            //   0 reward tokens are minted
            //
            // For the next 1 second (setRewardRate for assetPool2):
            //   1 * 1 = 1 reward tokens minted for assetPool1
            //
            // For the next 100 seconds:
            //   1 * 100 = 100 reward tokens minted for assetPool1
            //   2 * 100 = 200 reward tokens minted for assetPool2
            //
            // For the next 1 second (setRewardRate for assetPool1):
            //   1 * 1 = 1 reward tokens minted for assetPool1
            //   2 * 1 = 2 reward tokens minted for assetPool2
            //
            // For the next 100 seconds:
            //   2 * 100 = 200 reward tokens minted for assetPool2
            //
            // For the next 1 second (setRewardRate for assetPool1):
            //   2 * 1 = 2 reward tokens minted for assetPool2
            //
            // For the next 100 seconds:
            //   1.5 * 100 = 150 reward tokens minted for assetPool1
            //   2 * 100 = 200 reward tokens minted for assetPool2
            //
            // At the end:
            //   assetPool1: 1 + 100 + 1 + 150 = 252
            //   assetPool2: 200 + 2 + 200 + 2 + 200 = 604
            expect(await pool.earned(assetPool1)).to.equal(to1e18(252))
            expect(await pool.earned(assetPool2)).to.equal(to1e18(604))
          })
        }
      )

      context("when all reward rates after some time are set to zero", () => {
        beforeEach(async () => {
          await pool.setRewardRate(assetPool1, to1e18(1)) // +1s
          await pool.setRewardRate(assetPool2, to1e18(2)) // +1s
          await increaseTime(100)
          await pool.setRewardRate(assetPool1, to1e18(0)) // +1s
          await pool.setRewardRate(assetPool2, to1e18(0)) // +1s
          await increaseTime(500)
        })

        it("should mint reward tokens for the time reward rates were non-zero", async () => {
          // For the first 1 second (setRewardRate for assetPool1):
          //   0 reward tokens are minted
          //
          // For the next 1 second (setRewardRate for assetPool2):
          //   1 * 1 = 1 reward tokens minted for assetPool1
          //
          // For the next 100 seconds:
          //   1 * 100 = 100 reward tokens minted for assetPool1
          //   2 * 100 = 200 reward tokens minted for assetPool2
          //
          // For the next 1 second (setRewardRate for assetPool1):
          //   1 * 1 = 1 reward tokens minted for assetPool1
          //   2 * 1 = 2 reward tokens minted for assetPool2
          //
          // For the next 1 second (setRewardRate for assetPool2):
          //   2 * 1 = 2 reward tokens minted for assetPool2
          //
          // For the next 500 seconds:
          //   0 reward tokens minted
          //
          // At the end:
          //   assetPool1: 1 + 100 + 1 = 102
          //   assetPool2: 200 + 2 + 2 = 204
          expect(await pool.earned(assetPool1)).to.equal(to1e18(102))
          expect(await pool.earned(assetPool2)).to.equal(to1e18(204))
        })
      })

      context(
        "when all reward rates after some time are set to zero and then to non-zero again",
        () => {
          beforeEach(async () => {
            await pool.setRewardRate(assetPool1, to1e18(1)) // +1s
            await pool.setRewardRate(assetPool2, to1e18(2)) // +1s
            await increaseTime(100)
            await pool.setRewardRate(assetPool1, to1e18(0)) // +1s
            await pool.setRewardRate(assetPool2, to1e18(0)) // +1s
            await increaseTime(100)
            await pool.setRewardRate(assetPool1, to1ePrecision(15, 17)) // +1s
            await pool.setRewardRate(assetPool2, to1e18(1)) // +1s
            await increaseTime(100)
          })

          it("should not mint reward tokens for the time reward rates were zero", async () => {
            // For the first 1 second (setRewardRate for assetPool1):
            //   0 reward tokens are minted
            //
            // For the next 1 second (setRewardRate for assetPool2):
            //   1 * 1 = 1 reward tokens minted for assetPool1
            //
            // For the next 100 seconds:
            //   1 * 100 = 100 reward tokens minted for assetPool1
            //   2 * 100 = 200 reward tokens minted for assetPool2
            //
            // For the next 1 second (setRewardRate for assetPool1):
            //   1 * 1 = 1 reward tokens minted for assetPool1
            //   2 * 1 = 2 reward tokens minted for assetPool2
            //
            // For the next 1 second (setRewardRate for assetPool2):
            //   2 * 1 = 2 reward tokens minted for assetPool2
            //
            // For the next 100 seconds:
            //   No reward tokens minted
            //
            // For the next 1 second (setRewardRate for assetPool1):
            //   No reward tokens minted
            //
            // For the next 1 second (setRewardRate for assetPool2):
            //   1.5 * 1 = 1.5 reward tokens minted for assetPool1
            //
            // For the next 100 seconds:
            //   1.5 * 100 = 150 reward tokens minted for assetPool1
            //   1 * 100 = 100 reward tokens minted for assetPool2
            //
            // At the end:
            //   assetPool1: 1 + 100 + 1 + 1.5 + 150 = 253.5
            //   assetPool2: 200 + 2 + 2 + 100 =
            expect(await pool.earned(assetPool1)).to.equal(
              to1ePrecision(2535, 17)
            )
            expect(await pool.earned(assetPool2)).to.equal(to1e18(304))
          })
        }
      )
    })
  })
})
