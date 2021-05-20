const { expect } = require("chai")
const {
  to1e18,
  increaseTime,
  to1ePrecision,
} = require("./helpers/contract-test-helpers")

const RewardsPoolJSON = require("../artifacts/contracts/RewardsPool.sol/RewardsPool.json")

describe("AssetPool", () => {
  let assetPool
  let coveragePool
  let rewardsPool

  let collateralToken
  let underwriterToken

  let underwriter1
  let underwriter2
  let underwriter3
  let underwriter4

  let rewardManager

  const assertionPrecision = ethers.BigNumber.from("10000000000000000") // 0.01

  const underwriterInitialCollateralBalance = to1e18(1000000)

  beforeEach(async () => {
    coveragePool = await ethers.getSigner(1)
    rewardManager = await ethers.getSigner(2)

    const TestToken = await ethers.getContractFactory("TestToken")
    collateralToken = await TestToken.deploy()
    await collateralToken.deployed()

    const UnderwriterToken = await ethers.getContractFactory("UnderwriterToken")
    underwriterToken = await UnderwriterToken.deploy("Underwriter Token", "COV")
    await underwriterToken.deployed()

    const AssetPool = await ethers.getContractFactory("AssetPool")
    assetPool = await AssetPool.deploy(
      collateralToken.address,
      underwriterToken.address,
      rewardManager.address
    )
    await assetPool.deployed()
    await assetPool.transferOwnership(coveragePool.address)
    await underwriterToken.transferOwnership(assetPool.address)

    rewardsPoolAddress = await assetPool.rewardsPool()
    rewardsPool = new ethers.Contract(
      rewardsPoolAddress,
      RewardsPoolJSON.abi,
      rewardManager
    )

    await collateralToken.mint(rewardManager.address, to1e18(1000000))

    const createUnderwriterWithTokens = async (index) => {
      const underwriter = await ethers.getSigner(index)
      await collateralToken.mint(
        underwriter.address,
        underwriterInitialCollateralBalance
      )
      await collateralToken
        .connect(underwriter)
        .approve(assetPool.address, underwriterInitialCollateralBalance)
      return underwriter
    }

    underwriter1 = await createUnderwriterWithTokens(3)
    underwriter2 = await createUnderwriterWithTokens(4)
    underwriter3 = await createUnderwriterWithTokens(5)
    underwriter4 = await createUnderwriterWithTokens(6)
  })

  describe("deposit", () => {
    context("when the depositor has not enough collateral tokens", () => {
      it("should revert", async () => {
        const amount = underwriterInitialCollateralBalance.add(1)
        await expect(
          assetPool.connect(underwriter1).deposit(amount)
        ).to.be.revertedWith("ERC20: transfer amount exceeds balance")
      })
    })

    context("when the depositor has enough collateral tokens", () => {
      const depositedUnderwriter1 = to1e18(100)
      const depositedUnderwriter2 = to1e18(300)

      beforeEach(async () => {
        await assetPool.connect(underwriter1).deposit(depositedUnderwriter1)
        await assetPool.connect(underwriter2).deposit(depositedUnderwriter2)
      })

      it("should transfer deposited amount to the pool", async () => {
        expect(await collateralToken.balanceOf(assetPool.address)).to.equal(
          to1e18(400)
        )
        expect(
          await collateralToken.balanceOf(underwriter1.address)
        ).to.be.equal(
          underwriterInitialCollateralBalance.sub(depositedUnderwriter1)
        )
        expect(
          await collateralToken.balanceOf(underwriter2.address)
        ).to.be.equal(
          underwriterInitialCollateralBalance.sub(depositedUnderwriter2)
        )
      })
    })

    context("when depositing tokens for the first time", () => {
      const depositedUnderwriter1 = to1e18(100)
      const depositedUnderwriter2 = to1e18(300)
      const depositedUnderwriter3 = to1e18(20)

      beforeEach(async () => {
        await assetPool.connect(underwriter1).deposit(depositedUnderwriter1)
        await assetPool.connect(underwriter2).deposit(depositedUnderwriter2)
        await assetPool.connect(underwriter3).deposit(depositedUnderwriter3)
      })

      it("should mint the right amount of underwriter tokens", async () => {
        expect(await underwriterToken.balanceOf(underwriter1.address)).to.equal(
          to1e18(100) // 100 COV minted (first deposit)
        )
        expect(await underwriterToken.balanceOf(underwriter2.address)).to.equal(
          to1e18(300) // 300 * 100 / 100 = 300 COV minted
        )
        expect(await underwriterToken.balanceOf(underwriter3.address)).to.equal(
          to1e18(20) // 20 * 400 / 400  = 20 COV minted
        )
      })
    })

    context("when there is already a deposit for the given underwriter", () => {
      const depositedUnderwriter1 = to1e18(100)
      const depositedUnderwriter2 = to1e18(70)

      beforeEach(async () => {
        await assetPool.connect(underwriter1).deposit(depositedUnderwriter1)
        await assetPool.connect(underwriter2).deposit(depositedUnderwriter2)
      })

      it("should mint more underwriter tokens for underwriter", async () => {
        await assetPool.connect(underwriter1).deposit(depositedUnderwriter1)
        await assetPool.connect(underwriter2).deposit(depositedUnderwriter2)

        expect(await underwriterToken.balanceOf(underwriter1.address)).to.equal(
          to1e18(200) // 100 + 100 = 200
        )
        expect(await underwriterToken.balanceOf(underwriter2.address)).to.equal(
          to1e18(140) // 70 + 70 = 140
        )
      })
    })

    context("when there was a claim", () => {
      const depositedUnderwriter1 = to1e18(100)
      const depositedUnderwriter2 = to1e18(50)
      const depositedUnderwriter3 = to1e18(100)
      const claim = to1e18(25)

      beforeEach(async () => {
        await assetPool.connect(underwriter1).deposit(depositedUnderwriter1)
        await assetPool.connect(underwriter2).deposit(depositedUnderwriter2)
        await assetPool.connect(coveragePool).claim(coveragePool.address, claim)
        await assetPool.connect(underwriter3).deposit(depositedUnderwriter3)
      })

      it("should mint the right amount of underwriter tokens", async () => {
        expect(await underwriterToken.balanceOf(underwriter1.address)).to.equal(
          to1e18(100) // 100 COV minted (first deposit)
        )
        expect(await underwriterToken.balanceOf(underwriter2.address)).to.equal(
          to1e18(50) // 50 * 100 / 100 = 50 COV minted
        )
        expect(await underwriterToken.balanceOf(underwriter3.address)).to.equal(
          to1e18(120) // 100 * 150 / 125 = 120 COV minted
        )
      })
    })

    context("when rewards were allocated", () => {
      const depositedUnderwriter1 = to1e18(100)
      const depositedUnderwriter2 = to1e18(50)

      const allocatedReward = to1e18(70)

      beforeEach(async () => {
        await collateralToken
          .connect(rewardManager)
          .approve(rewardsPool.address, allocatedReward)
        await rewardsPool.connect(rewardManager).topUpReward(allocatedReward)

        await assetPool.connect(underwriter1).deposit(depositedUnderwriter1)
        await increaseTime(86400) // +1 day
        await assetPool.connect(underwriter2).deposit(depositedUnderwriter2)
      })

      it("should transfer released rewards to asset pool", async () => {
        // 70 / 7  = 10 reward tokens released every day
        // 100 + 10 + 50 = 160
        expect(
          await collateralToken.balanceOf(assetPool.address)
        ).to.be.closeTo(to1e18(160), assertionPrecision)
      })

      it("should mint the right amount of underwriter tokens", async () => {
        // 100 COV minted (first deposit)
        expect(await underwriterToken.balanceOf(underwriter1.address)).to.equal(
          to1e18(100)
        )
        // 50 * 100 / 110 = 45.45(45) COV minted
        expect(
          await underwriterToken.balanceOf(underwriter2.address)
        ).to.be.closeTo("45454545454545454545", assertionPrecision)
      })
    })
  })

  describe("claim", () => {
    beforeEach(async () => {
      await assetPool.connect(underwriter1).deposit(to1e18(200))
    })

    context("when not done by the owner", () => {
      it("should revert", async () => {
        await expect(
          assetPool
            .connect(underwriter1)
            .claim(coveragePool.address, to1e18(100))
        ).to.be.revertedWith("Ownable: caller is not the owner")
      })
    })

    context("when done by the owner", () => {
      it("should transfer claimed tokens to the recipient", async () => {
        const claimRecipient = await ethers.getSigner(15)
        await assetPool
          .connect(coveragePool)
          .claim(claimRecipient.address, to1e18(90))
        expect(
          await collateralToken.balanceOf(claimRecipient.address)
        ).to.equal(to1e18(90))
      })
    })

    context("when rewards were allocated", () => {
      const allocatedReward = to1e18(70)

      beforeEach(async () => {
        await collateralToken
          .connect(rewardManager)
          .approve(rewardsPool.address, allocatedReward)
        await rewardsPool.connect(rewardManager).topUpReward(allocatedReward)

        await increaseTime(86400) // +1 day
      })

      it("should first transfer released rewards to asset pool", async () => {
        const claimRecipient = await ethers.getSigner(15)
        // 70 / 7  = 10 reward tokens released every day
        // 200 + 10 tokens in the asset pool
        // 205 claimed (more than deposited!), 5 stays in the pool
        await assetPool
          .connect(coveragePool)
          .claim(claimRecipient.address, to1e18(205))

        expect(
          await collateralToken.balanceOf(claimRecipient.address)
        ).to.equal(to1e18(205))
        expect(
          await collateralToken.balanceOf(assetPool.address)
        ).to.be.closeTo(to1e18(5), assertionPrecision)
      })
    })
  })

  describe("withdraw", () => {
    context("when withdrawing entire collateral", () => {
      const amount = to1e18(120)

      beforeEach(async () => {
        await assetPool.connect(underwriter1).deposit(amount)
        await underwriterToken
          .connect(underwriter1)
          .approve(assetPool.address, amount)
      })

      it("should burn all underwriter tokens", async () => {
        await assetPool.connect(underwriter1).withdraw(amount)
        expect(await underwriterToken.balanceOf(underwriter1.address)).to.equal(
          0
        )
      })
    })

    context("when withdrawing zero of collateral", () => {
      beforeEach(async () => {
        await assetPool.connect(underwriter1).deposit(to1e18(120))
      })

      it("should revert", async () => {
        await expect(
          assetPool.connect(underwriter1).withdraw(0)
        ).to.be.revertedWith("Underwriter token amount must be greater than 0")
      })
    })

    context("when withdrawing part of the collateral", () => {
      const amount = to1e18(120)

      beforeEach(async () => {
        await assetPool.connect(underwriter1).deposit(amount)
        await underwriterToken
          .connect(underwriter1)
          .approve(assetPool.address, amount)
      })

      it("should burn the right amount of underwriter tokens", async () => {
        await assetPool.connect(underwriter1).withdraw(to1e18(20))
        expect(await underwriterToken.balanceOf(underwriter1.address)).to.equal(
          to1e18(100)
        )
      })
    })

    context("when underwriter has not enough underwriter tokens", () => {
      const amount = to1e18(120)

      beforeEach(async () => {
        await assetPool.connect(underwriter1).deposit(amount)
        await underwriterToken
          .connect(underwriter1)
          .approve(assetPool.address, amount)
      })

      it("should revert", async () => {
        await expect(
          assetPool.connect(underwriter1).withdraw(amount.add(1))
        ).to.be.revertedWith("Underwriter token amount exceeds balance")
      })
    })

    context("when no collateral tokens were claimed by the pool", () => {
      const depositedUnderwriter1 = to1e18(100)
      const depositedUnderwriter2 = to1e18(331)
      const depositedUnderwriter3 = to1e18(22)
      const depositedUnderwriter4 = to1e18(5)

      beforeEach(async () => {
        await assetPool.connect(underwriter1).deposit(depositedUnderwriter1)
        await assetPool.connect(underwriter2).deposit(depositedUnderwriter2)
        await assetPool.connect(underwriter3).deposit(depositedUnderwriter3)
        await assetPool.connect(underwriter4).deposit(depositedUnderwriter4)

        // We can approve the number of tokens equal to the number of tokens
        // deposited - there were no claims and no rewards were allocated so
        // those numbers are equal.
        await underwriterToken
          .connect(underwriter1)
          .approve(assetPool.address, depositedUnderwriter1)
        await underwriterToken
          .connect(underwriter2)
          .approve(assetPool.address, depositedUnderwriter2)
        await underwriterToken
          .connect(underwriter3)
          .approve(assetPool.address, depositedUnderwriter3)
        await underwriterToken
          .connect(underwriter4)
          .approve(assetPool.address, depositedUnderwriter4)
      })

      it("should let all underwriters withdraw their original collateral amounts", async () => {
        await assetPool.connect(underwriter4).withdraw(depositedUnderwriter4)
        expect(await collateralToken.balanceOf(underwriter4.address)).to.equal(
          underwriterInitialCollateralBalance
        )

        await assetPool.connect(underwriter1).withdraw(depositedUnderwriter1)
        expect(await collateralToken.balanceOf(underwriter1.address)).to.equal(
          underwriterInitialCollateralBalance
        )

        await assetPool.connect(underwriter3).withdraw(depositedUnderwriter3)
        expect(await collateralToken.balanceOf(underwriter3.address)).to.equal(
          underwriterInitialCollateralBalance
        )
        await assetPool.connect(underwriter2).withdraw(depositedUnderwriter2)
        expect(await collateralToken.balanceOf(underwriter2.address)).to.equal(
          underwriterInitialCollateralBalance
        )
      })
    })

    context("when there was a claim", () => {
      const depositedUnderwriter1 = to1e18(100)
      const depositedUnderwriter2 = to1e18(50)
      const depositedUnderwriter3 = to1e18(150)
      const claim = to1e18(25)

      beforeEach(async () => {
        await assetPool.connect(underwriter1).deposit(depositedUnderwriter1)
        await assetPool.connect(underwriter2).deposit(depositedUnderwriter2)
        await assetPool.connect(underwriter3).deposit(depositedUnderwriter3)
        await assetPool.connect(coveragePool).claim(coveragePool.address, claim)

        const coverageMintedUnderwriter1 = await underwriterToken.balanceOf(
          underwriter1.address
        )
        const coverageMintedUnderwriter2 = await underwriterToken.balanceOf(
          underwriter2.address
        )
        const coverageMintedUnderwriter3 = await underwriterToken.balanceOf(
          underwriter3.address
        )
        await underwriterToken
          .connect(underwriter1)
          .approve(assetPool.address, coverageMintedUnderwriter1)
        await underwriterToken
          .connect(underwriter2)
          .approve(assetPool.address, coverageMintedUnderwriter2)
        await underwriterToken
          .connect(underwriter3)
          .approve(assetPool.address, coverageMintedUnderwriter3)
        await assetPool
          .connect(underwriter1)
          .withdraw(coverageMintedUnderwriter1)
        await assetPool
          .connect(underwriter2)
          .withdraw(coverageMintedUnderwriter2)
        await assetPool
          .connect(underwriter3)
          .withdraw(coverageMintedUnderwriter3)
      })

      it("should seize collateral proportionally to underwriter shares", async () => {
        // underwriter 1 has 100/300 share of the pool
        // underwriter 2 has 50/300 share of the pool
        // underwriter 3 has 150/300 share of the pool
        //
        // they are supposed to take the hit proportionally:
        //   underwriter 1: -25 * 100/300 = -8.3(3)
        //   underwriter 2: -25 * 50/300 = -4.16(6)
        //   underwriter 3: -25 * 150/300 = -12.5
        expect(
          await collateralToken.balanceOf(underwriter1.address)
        ).to.be.closeTo(
          underwriterInitialCollateralBalance.sub("8333333333333333333"),
          assertionPrecision
        )
        expect(
          await collateralToken.balanceOf(underwriter2.address)
        ).to.be.closeTo(
          underwriterInitialCollateralBalance.sub("4166666666666666666"),
          assertionPrecision
        )
        expect(
          await collateralToken.balanceOf(underwriter3.address)
        ).to.be.closeTo(
          underwriterInitialCollateralBalance.sub("12500000000000000000"),
          assertionPrecision
        )
      })
    })

    context("when rewards were allocated", () => {
      const depositedUnderwriter1 = to1e18(100)
      const depositedUnderwriter2 = to1e18(300)
      const depositedUnderwriter3 = to1e18(50)

      const allocatedReward = to1e18(70)

      beforeEach(async () => {
        await collateralToken
          .connect(rewardManager)
          .approve(rewardsPool.address, allocatedReward)
        await rewardsPool.connect(rewardManager).topUpReward(allocatedReward)

        await assetPool.connect(underwriter1).deposit(depositedUnderwriter1)
        await increaseTime(86400) // +1 day
        await assetPool.connect(underwriter2).deposit(depositedUnderwriter2)
        await increaseTime(86400) // +1 day
        await assetPool.connect(underwriter3).deposit(depositedUnderwriter3)
        await increaseTime(86400) // +1 day

        const coverageMintedUnderwriter1 = await underwriterToken.balanceOf(
          underwriter1.address
        )
        const coverageMintedUnderwriter2 = await underwriterToken.balanceOf(
          underwriter2.address
        )
        const coverageMintedUnderwriter3 = await underwriterToken.balanceOf(
          underwriter3.address
        )

        await underwriterToken
          .connect(underwriter1)
          .approve(assetPool.address, coverageMintedUnderwriter1)
        await underwriterToken
          .connect(underwriter2)
          .approve(assetPool.address, coverageMintedUnderwriter2)
        await underwriterToken
          .connect(underwriter3)
          .approve(assetPool.address, coverageMintedUnderwriter3)

        await assetPool
          .connect(underwriter1)
          .withdraw(coverageMintedUnderwriter1)
        await assetPool
          .connect(underwriter2)
          .withdraw(coverageMintedUnderwriter2)
        await assetPool
          .connect(underwriter3)
          .withdraw(coverageMintedUnderwriter3)
      })

      it("should withdraw collateral and released rewards", async () => {
        // day 1:
        //   +10 tokens to underwriter 1
        //
        // day 2:
        //   110 / 410 * 10 = +2.6829268293 tokens to underwriter 1
        //   300 / 410 * 10 = +7.3170731707 tokens to underwriter 2
        //
        // day 3:
        //   112.6829268293 / 470 * 10 = +2.3975090815 tokens to underwriter 1
        //   307.3170731707 / 470 * 10 = +6.5386611313 tokens to underwriter 2
        //         50 / 470 * 10 = +1.0638297872 tokens to underwriter 3
        //
        // earned:
        //    underwriter 1: 10 + 2.6829268293 + 2.3975090815 = 15.0804359108
        //    underwriter 2:      7.3170731707 + 6.5386611313 = 13.855734302
        //    underwriter 3:                                     1.0638297872
        const expectedEarnedUnderwriter1 = to1ePrecision(1508, 16)
        const expectedEarnedUnderwriter2 = to1ePrecision(1385, 16)
        const expectedEarnedUnderwriter3 = to1ePrecision(106, 16)

        expect(
          await collateralToken.balanceOf(underwriter1.address)
        ).to.be.closeTo(
          underwriterInitialCollateralBalance.add(expectedEarnedUnderwriter1),
          assertionPrecision
        )
        expect(
          await collateralToken.balanceOf(underwriter2.address)
        ).to.be.closeTo(
          underwriterInitialCollateralBalance.add(expectedEarnedUnderwriter2),
          assertionPrecision
        )
        expect(
          await collateralToken.balanceOf(underwriter3.address)
        ).to.be.closeTo(
          underwriterInitialCollateralBalance.add(expectedEarnedUnderwriter3),
          assertionPrecision
        )
      })
    })
  })
})
