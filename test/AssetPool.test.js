const { expect } = require("chai")
const {
  to1e18,
  increaseTime,
  lastBlockTime,
  pastEvents,
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
  let thirdParty

  const assertionPrecision = ethers.BigNumber.from("10000000000000000") // 0.01

  const underwriterInitialCollateralBalance = to1e18(1000000)

  beforeEach(async () => {
    coveragePool = await ethers.getSigner(1)
    rewardManager = await ethers.getSigner(2)
    thirdParty = await ethers.getSigner(3)

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

    underwriter1 = await createUnderwriterWithTokens(4)
    underwriter2 = await createUnderwriterWithTokens(5)
    underwriter3 = await createUnderwriterWithTokens(6)
    underwriter4 = await createUnderwriterWithTokens(7)
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

  describe("initiateWithdrawal", () => {
    const amount = to1e18(120)

    beforeEach(async () => {
      await assetPool.connect(underwriter1).deposit(amount)
      await underwriterToken
        .connect(underwriter1)
        .approve(assetPool.address, amount)
    })

    context("when underwriter has not enough underwriter tokens", () => {
      it("should revert", async () => {
        await expect(
          assetPool.connect(underwriter1).initiateWithdrawal(amount.add(1))
        ).to.be.revertedWith("Underwriter token amount exceeds balance")
      })
    })

    context("when withdrawing zero of collateral", () => {
      it("should revert", async () => {
        await expect(
          assetPool.connect(underwriter1).initiateWithdrawal(0)
        ).to.be.revertedWith("Underwriter token amount must be greater than 0")
      })
    })

    context("when underwriter has enough underwriter tokens", () => {
      let tx

      beforeEach(async () => {
        tx = await assetPool.connect(underwriter1).initiateWithdrawal(amount)
      })

      it("should transfer underwriter tokens to the pool", async () => {
        expect(await underwriterToken.balanceOf(assetPool.address)).to.equal(
          amount
        )
      })

      it("should note the withdrawal initiated time", async () => {
        expect(
          await assetPool.withdrawalInitiatedTimestamp(underwriter1.address)
        ).to.equal(await lastBlockTime())
      })

      it("should emit WithdrawalInitiated event", async () => {
        await expect(tx)
          .to.emit(assetPool, "WithdrawalInitiated")
          .withArgs(underwriter1.address, amount, await lastBlockTime())
      })
    })

    context("when there was a pending withdrawal for the underwriter", () => {
      let tx

      beforeEach(async () => {
        await assetPool.connect(underwriter1).initiateWithdrawal(amount.sub(10))
        await increaseTime(86400) // +1 day
        tx = await assetPool.connect(underwriter1).initiateWithdrawal(10)
      })

      it("should transfer underwriter tokens to the pool", async () => {
        expect(await underwriterToken.balanceOf(assetPool.address)).to.equal(
          amount
        )
      })

      it("should overwrite the withdrawal initiated time", async () => {
        expect(
          await assetPool.withdrawalInitiatedTimestamp(underwriter1.address)
        ).to.equal(await lastBlockTime())
      })

      it("should emit WithdrawalInitiated event with a total COV amount", async () => {
        await expect(tx)
          .to.emit(assetPool, "WithdrawalInitiated")
          .withArgs(underwriter1.address, amount, await lastBlockTime())
      })
    })
  })

  describe("completeWithdrawal", () => {
    context("when withdrawal has not been initiated", () => {
      it("should revert", async () => {
        await expect(
          assetPool
            .connect(underwriter1)
            .completeWithdrawal(underwriter1.address)
        ).to.be.revertedWith("No withdrawal initiated for the underwriter")
      })
    })

    context("when withdrawal delay has not yet elapsed", () => {
      const amount = to1e18(1000)

      beforeEach(async () => {
        await assetPool.connect(underwriter1).deposit(amount)
        await underwriterToken
          .connect(underwriter1)
          .approve(assetPool.address, amount)
        await assetPool.connect(underwriter1).initiateWithdrawal(amount)

        await increaseTime(14 * 86400 - 1) // 14 days - 1 sec
      })

      it("should revert", async () => {
        await expect(
          assetPool
            .connect(underwriter1)
            .completeWithdrawal(underwriter1.address)
        ).to.be.revertedWith("Withdrawal delay has not elapsed")
      })
    })

    context("when hard withdrawal timeout has elapsed", () => {
      let tx

      beforeEach(async () => {
        const amount = to1e18(100)
        await assetPool.connect(underwriter1).deposit(amount)
        await underwriterToken
          .connect(underwriter1)
          .approve(assetPool.address, amount)
        await assetPool.connect(underwriter1).initiateWithdrawal(amount)
        await increaseTime((14 + 70) * 86400) // 14 + 70 days
        tx = await assetPool
          .connect(thirdParty)
          .completeWithdrawal(underwriter1.address)
      })

      it("should withdraw 1% to the caller and leave the rest in the pool", async () => {
        expect(await collateralToken.balanceOf(thirdParty.address)).to.equal(
          to1e18(1)
        )
        expect(await collateralToken.balanceOf(assetPool.address)).to.equal(
          to1e18(99)
        )
      })

      it("should emit WithdrawalCompleted event", async () => {
        expect(tx)
          .to.emit(assetPool, "WithdrawalCompleted")
          .withArgs(underwriter1.address, 0, await lastBlockTime())
      })

      it("should emit WithdrawalTimedOut event", async () => {
        expect(tx)
          .to.emit(assetPool, "WithdrawalTimedOut")
          .withArgs(underwriter1.address, await lastBlockTime())
      })
    })

    context("when graceful withdrawal timeout has elapsed", () => {
      const amount = to1e18(100)
      beforeEach(async () => {
        await assetPool.connect(underwriter1).deposit(amount)
        await underwriterToken
          .connect(underwriter1)
          .approve(assetPool.address, amount)
        await assetPool.connect(underwriter1).initiateWithdrawal(amount)
        await increaseTime((14 + 7) * 86400) // 14 + 7 days
      })

      it("should seize portion of tokens after the timeout", async () => {
        await increaseTime(86400) // 1 day
        await assetPool
          .connect(thirdParty)
          .completeWithdrawal(underwriter1.address)

        // We are one day after the graceful withdrawal period (one week).
        // Underwriter has 9 weeks more (63 days) to withdraw tokens and their
        // amount is reduced proportionally every day.
        //
        // 1/63 is seized by the pool
        // 62/63 goes to the underwriter
        //
        // 1/63 * 100 = 1.5873015873
        // 62/63 * 100 = 98.4126984127
        expect(
          await collateralToken.balanceOf(assetPool.address)
        ).to.be.closeTo(to1ePrecision(158, 16), assertionPrecision)

        expect(
          await collateralToken.balanceOf(underwriter1.address)
        ).to.be.closeTo(
          underwriterInitialCollateralBalance.sub(to1ePrecision(158, 16)),
          assertionPrecision
        )
      })

      it("should seize portion of tokens right before hard timeout", async () => {
        await increaseTime(62 * 86400) // 63 days
        await assetPool
          .connect(thirdParty)
          .completeWithdrawal(underwriter1.address)

        // We are 62 days after the graceful withdrawal period (one week).
        // Underwriter has 1 more day to withdraw tokens and their
        // amount is reduced proportionally every day.
        //
        // 62/63 is seized by the pool
        // 1/63 goes to the underwriter
        //
        // 62/63 * 100 = 98.4126984127
        // 1/63 * 100 = 1.5873015873
        expect(
          await collateralToken.balanceOf(assetPool.address)
        ).to.be.closeTo(to1ePrecision(9841, 16), assertionPrecision)

        expect(
          await collateralToken.balanceOf(underwriter1.address)
        ).to.be.closeTo(
          underwriterInitialCollateralBalance
            .sub(amount)
            .add(to1ePrecision(158, 16)),
          assertionPrecision
        )
      })

      it("should emit WithdrawalCompleted event", async () => {
        await increaseTime(62 * 86400) // 63 days
        const tx = await assetPool
          .connect(thirdParty)
          .completeWithdrawal(underwriter1.address)
        const receipt = await tx.wait()
        const events = pastEvents(receipt, assetPool, "WithdrawalCompleted")

        expect(events.length).to.equal(1)
        expect(events[0].args["underwriter"]).to.equal(underwriter1.address)
        expect(events[0].args["amount"]).to.be.closeTo(
          to1ePrecision(158, 16), // see the previous test for explanation
          assertionPrecision
        )
        expect(events[0].args["timestamp"]).to.equal(await lastBlockTime())
      })

      it("should emit GracefulWithdrawalTimedOut event", async () => {
        await increaseTime(62 * 86400) // 63 days
        const tx = await assetPool
          .connect(thirdParty)
          .completeWithdrawal(underwriter1.address)

        expect(tx)
          .to.emit(assetPool, "GracefulWithdrawalTimedOut")
          .withArgs(underwriter1.address, await lastBlockTime())
      })
    })

    context("when graceful withdrawal timeout has not passed", () => {
      it("should emit WithdrawalCompleted event", async () => {
        const amount = to1e18(1050)
        await assetPool.connect(underwriter1).deposit(amount)
        // We can approve the number of tokens equal to the number of tokens
        // deposited - there were no claims and no rewards were allocated so
        // those numbers are equal.
        await underwriterToken
          .connect(underwriter1)
          .approve(assetPool.address, amount)
        await assetPool.connect(underwriter1).initiateWithdrawal(amount)
        await increaseTime(14 * 86400) // 14 days
        const tx = await assetPool.completeWithdrawal(underwriter1.address)

        expect(tx)
          .to.emit(assetPool, "WithdrawalCompleted")
          .withArgs(underwriter1.address, amount, await lastBlockTime())
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

          await assetPool
            .connect(underwriter1)
            .initiateWithdrawal(depositedUnderwriter1)
          await assetPool
            .connect(underwriter2)
            .initiateWithdrawal(depositedUnderwriter2)
          await assetPool
            .connect(underwriter3)
            .initiateWithdrawal(depositedUnderwriter3)
          await assetPool
            .connect(underwriter4)
            .initiateWithdrawal(depositedUnderwriter4)

          await increaseTime(14 * 86400) // 14 days
        })

        it("should let all underwriters withdraw their original collateral amounts", async () => {
          await assetPool.completeWithdrawal(underwriter4.address)
          expect(
            await collateralToken.balanceOf(underwriter4.address)
          ).to.equal(underwriterInitialCollateralBalance)

          await assetPool.completeWithdrawal(underwriter1.address)
          expect(
            await collateralToken.balanceOf(underwriter1.address)
          ).to.equal(underwriterInitialCollateralBalance)

          await assetPool.completeWithdrawal(underwriter3.address)
          expect(
            await collateralToken.balanceOf(underwriter3.address)
          ).to.equal(underwriterInitialCollateralBalance)
          await assetPool.completeWithdrawal(underwriter2.address)
          expect(
            await collateralToken.balanceOf(underwriter2.address)
          ).to.equal(underwriterInitialCollateralBalance)
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
          await assetPool
            .connect(coveragePool)
            .claim(coveragePool.address, claim)

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
            .initiateWithdrawal(coverageMintedUnderwriter1)
          await assetPool
            .connect(underwriter2)
            .initiateWithdrawal(coverageMintedUnderwriter2)
          await assetPool
            .connect(underwriter3)
            .initiateWithdrawal(coverageMintedUnderwriter3)

          await increaseTime(14 * 86400) // 14 days
          await assetPool.completeWithdrawal(underwriter1.address)
          await assetPool.completeWithdrawal(underwriter2.address)
          await assetPool.completeWithdrawal(underwriter3.address)
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
            .initiateWithdrawal(coverageMintedUnderwriter1)
          await assetPool
            .connect(underwriter2)
            .initiateWithdrawal(coverageMintedUnderwriter2)
          await assetPool
            .connect(underwriter3)
            .initiateWithdrawal(coverageMintedUnderwriter3)

          await increaseTime(14 * 86400) // 14 days
          await assetPool.completeWithdrawal(underwriter1.address)
          await assetPool.completeWithdrawal(underwriter2.address)
          await assetPool.completeWithdrawal(underwriter3.address)
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

          // day 1:
          //   +10 tokens to underwriter 1
          //
          // day 2:
          //   110 / 410 * 10 = +2.6829268293 tokens to underwriter 1
          //   300 / 410 * 10 = +7.3170731707 tokens to underwriter 2
          //
          // days 3,4,5,6,7:
          //   112.6829268293 / 470 * 50 = +11.9875454073 tokens to underwriter 1
          //   307.3170731707 / 470 * 50 = +32.6933056564 tokens to underwriter 2
          //         50 / 470 * 50 = +5.3191489361 tokens to underwriter 3
          //
          // earned:
          //    underwriter 1: 10 + 2.6829268293 + 11.9875454073 = 24.6704722366
          //    underwriter 2:      7.3170731707 + 32.6933056564 = 40.0103788271
          //    underwriter 3:                                     5.3191489361
          const expectedEarnedUnderwriter1 = to1ePrecision(2467, 16)
          const expectedEarnedUnderwriter2 = to1ePrecision(4001, 16)
          const expectedEarnedUnderwriter3 = to1ePrecision(531, 16)

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
})
