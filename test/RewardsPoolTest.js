const { expect } = require("chai")
const { to1e18, increaseTime } = require("./helpers/contract-test-helpers")
const { BigNumber } = ethers

describe("RewardsPoolStaking", () => {
  let underwriterToken
  let rewardsPoolStaking

  let underwriter1
  let underwriter2
  let underwriter3

  const underwriterTokenInitialBalance = to1e18(100000)

  beforeEach(async () => {
    const UnderwriterToken = await ethers.getContractFactory("UnderwriterToken")
    underwriterToken = await UnderwriterToken.deploy()
    await underwriterToken.deployed()

    const CoveragePoolConstants = await ethers.getContractFactory(
      "CoveragePoolConstants"
    )
    const coveragePoolConstants = await CoveragePoolConstants.deploy()
    await coveragePoolConstants.deployed()

    const RewardsPoolStaking = await ethers.getContractFactory(
      "RewardsPoolStaking",
      {
        libraries: {
          CoveragePoolConstants: coveragePoolConstants.address,
        },
      }
    )
    rewardsPoolStaking = await RewardsPoolStaking.deploy(
      underwriterToken.address
    )
    await rewardsPoolStaking.deployed()

    const createUnderwriterWithTokens = async (index) => {
      const underwriter = await ethers.getSigner(index)
      await underwriterToken.mint(
        underwriter.address,
        underwriterTokenInitialBalance
      )
      await underwriterToken
        .connect(underwriter)
        .approve(rewardsPoolStaking.address, underwriterTokenInitialBalance)
      return underwriter
    }

    underwriter1 = await createUnderwriterWithTokens(1)
    underwriter2 = await createUnderwriterWithTokens(2)
    underwriter3 = await createUnderwriterWithTokens(3)
  })

  describe("stake", () => {
    beforeEach(async () => {
      await rewardsPoolStaking.connect(underwriter1).stake(to1e18(18))
      await rewardsPoolStaking.connect(underwriter2).stake(to1e18(7))
    })

    it("transfers staked underwriter tokens", async () => {
      expect(
        await underwriterToken.balanceOf(rewardsPoolStaking.address)
      ).to.be.equal(to1e18(25))
    })

    it("updates total staked balance", async () => {
      expect(await rewardsPoolStaking.totalStaked()).to.be.equal(to1e18(25))
    })

    it("updates staked underwriter token balances", async () => {
      expect(
        await rewardsPoolStaking.balanceOf(underwriter1.address)
      ).to.be.equal(to1e18(18))
      expect(
        await rewardsPoolStaking.balanceOf(underwriter2.address)
      ).to.be.equal(to1e18(7))
    })
  })

  describe("unstake", () => {
    beforeEach(async () => {
      await rewardsPoolStaking.connect(underwriter1).stake(to1e18(18))
      await rewardsPoolStaking.connect(underwriter2).stake(to1e18(7))

      await rewardsPoolStaking.connect(underwriter1).unstake(to1e18(4))
    })

    it("transfers back unstaked underwriter tokens", async () => {
      expect(
        await underwriterToken.balanceOf(rewardsPoolStaking.address)
      ).to.be.equal(to1e18(21))

      expect(
        await underwriterToken.balanceOf(underwriter1.address)
      ).to.be.equal(underwriterTokenInitialBalance.sub(to1e18(14)))
    })

    it("updates total staked balance", async () => {
      expect(await rewardsPoolStaking.totalStaked()).to.be.equal(to1e18(21))
    })

    it("updates staked underwriter token balances", async () => {
      expect(
        await rewardsPoolStaking.balanceOf(underwriter1.address)
      ).to.be.equal(to1e18(14))
      expect(
        await rewardsPoolStaking.balanceOf(underwriter2.address)
      ).to.be.equal(to1e18(7))
    })

    context("when trying to unstake more than staked", () => {
      it("reverts", async () => {
        await expect(
          rewardsPoolStaking.connect(underwriter2).unstake(to1e18(8))
        ).to.be.revertedWith("SafeMath: subtraction overflow")
      })
    })
  })

  describe("earned", () => {
    const precision = ethers.BigNumber.from("1000000000000") // 0.000001

    context("when there is one underwriter staking", () => {
      beforeEach(async () => {
        await rewardsPoolStaking.connect(underwriter1).stake(to1e18(80))
      })

      it("mints one reward token per second for that underwriter", async () => {
        await increaseTime(1000)
        expect(
          await rewardsPoolStaking.earned(underwriter1.address)
        ).to.be.closeTo(to1e18(1000), precision)
      })
    })

    context("when there are more than one underwriter staking", () => {
      beforeEach(async () => {
        await rewardsPoolStaking.connect(underwriter1).stake(to1e18(10))
        // hardhat will mine the second transaction in a block with +1s block
        // time, hence +1s
        await rewardsPoolStaking.connect(underwriter2).stake(to1e18(5)) // +1s
      })

      it("mints reward tokens proportionally to tokens staked over time", async () => {
        await increaseTime(100)

        // For the first 1 second:
        //   1.00 reward tokens go to underwriter1
        //
        // For the next 100 seconds:
        //   10/15 * 100 = 66.66(6) reward tokens go to underwriter1
        //   5/15 * 100 = 33.33(3) reward tokens go to underwriter2
        //
        // At the end:
        //   underwriter1: 1.00 + 66.66(6) = 67.66(6)
        //   underwriter2: 33.33(3)
        expect(
          await rewardsPoolStaking.earned(underwriter1.address)
        ).to.be.closeTo(BigNumber.from("67666666666666666666"), precision)
        expect(
          await rewardsPoolStaking.earned(underwriter2.address)
        ).to.be.closeTo(BigNumber.from("33333333333333333333"), precision)
      })
    })

    context("when underwriters stake at a different time", () => {
      beforeEach(async () => {
        await rewardsPoolStaking.connect(underwriter1).stake(to1e18(10))

        await increaseTime(10)
        await rewardsPoolStaking.connect(underwriter2).stake(to1e18(20)) // +1s

        await increaseTime(10)
        await rewardsPoolStaking.connect(underwriter3).stake(to1e18(30)) // +1s
      })

      it("mints reward tokens proportionally to tokens staked over time", async () => {
        await increaseTime(100)

        // For the first 11 seconds:
        //   11.00 reward tokens go to underwriter1
        //
        // For the next 11 seconds:
        //   10/30 * 11 = 3.66(6) reward tokens go to underwriter1
        //   20/30 * 11 = 7.33(3) reward tokens go to underwriter2
        //
        // For the next 100 seconds:
        //   10/60 * 100 = 16.66(6) reward tokens go to underwriter1
        //   20/60 * 100 = 33.33(3) reward tokens go to underwriter2
        //   30/60 * 100 = 50.00 reward tokens go to underwriter3
        //
        // At the end:
        //   underwriter1: 11.00 + 3.66(6) + 16.66(6) = 31.33(3)
        //   underwriter2: 7.33(3) + 33.33(3) = 40.66(6)
        //   underwriter3: 50.00
        expect(
          await rewardsPoolStaking.earned(underwriter1.address)
        ).to.be.closeTo(BigNumber.from("31333333333333333333"), precision)
        expect(
          await rewardsPoolStaking.earned(underwriter2.address)
        ).to.be.closeTo(BigNumber.from("40666666666666666666"), precision)
        expect(
          await rewardsPoolStaking.earned(underwriter3.address)
        ).to.be.closeTo(BigNumber.from("50000000000000000000"), precision)
      })
    })

    context("when underwriters stake and unstake at a different time", () => {
      beforeEach(async () => {
        await rewardsPoolStaking.connect(underwriter1).stake(to1e18(10))
        await rewardsPoolStaking.connect(underwriter2).stake(to1e18(20)) // +1s

        await increaseTime(10)
        await rewardsPoolStaking.connect(underwriter2).unstake(to1e18(5)) // +1s

        await increaseTime(10)
        await rewardsPoolStaking.connect(underwriter3).stake(to1e18(30)) // +1s

        await rewardsPoolStaking.connect(underwriter1).unstake(to1e18(10)) // +1s
      })

      it("mints reward tokens proportionally to tokens staked over time", async () => {
        await increaseTime(100)

        // For the first 1 second:
        //   1.00 reward tokens go to underwriter1
        //
        // For the next 10 seconds:
        //   10/30 * 10 = 3.33(3) reward tokens go to underwriter1
        //   20/30 * 10 = 6.66(6) reward tokens go to underwriter2
        //
        // For the next 1 second (during underwriter2 partial unstaking):
        //   10/30 * 1 = 0.33(3) reward tokens go to underwriter1
        //   20/30 * 1 = 0.66(6) reward tokens go to underwriter2
        //
        // For the next 11 seconds:
        //   10/25 * 11 = 4.40 reward tokens go to underwriter1
        //   15/25 * 11 = 6.6 reward tokens go to underwriter2
        //
        // For the next second (during underwriter1 total unstaking):
        //   10/55 * 1 = 0.18(18) reward tokens go to underwriter1
        //   15/55 * 1 = 0.27(27) reward tokens go to underwriter2
        //   30/55 * 1 = 0.54(54) reward tokens go to underwriter3
        //
        // For the next 100 seconds:
        //   15/45 * 100 = 33.33(3) reward tokens go to underwriter2
        //   30/45 * 100 = 66.66(6) reward tokens go to underwriter3
        //
        // At the end:
        //   underwriter1: 1.00 + 3.33(3) + 0.33(3) + 4.40 + 0.18(18) =  9.2484(84)
        //   underwriter2: 6.66(6) + 0.66(6) + 6.6 + 0.27(27) + 33.33(3) = 47.5393(93)
        //   underwriter3: 0.54(54) + 66.66(6) = 67.21(21)
        expect(
          await rewardsPoolStaking.earned(underwriter1.address)
        ).to.be.closeTo(BigNumber.from("9248484848484848484"), precision)
        expect(
          await rewardsPoolStaking.earned(underwriter2.address)
        ).to.be.closeTo(BigNumber.from("47539393939393939393"), precision)
        expect(
          await rewardsPoolStaking.earned(underwriter3.address)
        ).to.be.closeTo(BigNumber.from("67212121212121212121"), precision)
      })
    })
  })
})
