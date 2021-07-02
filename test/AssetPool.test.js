const { expect } = require("chai")
const {
  to1e18,
  increaseTime,
  lastBlockTime,
  to1ePrecision,
} = require("./helpers/contract-test-helpers")

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

  // expected withdrawal delay in seconds
  const withdrawalDelay = 21 * 24 * 3600
  // expected withdrawal timeout in seconds
  const withdrawalTimeout = 2 * 24 * 3600

  beforeEach(async () => {
    coveragePool = (await ethers.getSigners())[1]
    rewardManager = (await ethers.getSigners())[2]
    thirdParty = (await ethers.getSigners())[3]

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
    rewardsPool = await ethers.getContractAt(
      "RewardsPool",
      rewardsPoolAddress,
      rewardManager
    )

    await collateralToken.mint(rewardManager.address, to1e18(1000000))

    const createUnderwriterWithTokens = async (index) => {
      const underwriter = (await ethers.getSigners())[index]
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

  describe("receiveApproval", () => {
    context("when called directly", () => {
      it("should revert", async () => {
        await expect(
          assetPool
            .connect(underwriter1)
            .receiveApproval(
              underwriter1.address,
              to1e18(100),
              collateralToken.address,
              []
            )
        ).to.be.revertedWith("Only token caller allowed")
      })
    })

    context("when called for unsupported token", () => {
      const amount = to1e18(100)
      let unsupportedToken

      beforeEach(async () => {
        const TestToken = await ethers.getContractFactory("TestToken")
        unsupportedToken = await TestToken.deploy()
        await unsupportedToken.deployed()
      })

      it("should revert", async () => {
        await expect(
          unsupportedToken
            .connect(underwriter1)
            .approveAndCall(assetPool.address, amount, [])
        ).to.be.revertedWith("Unsupported collateral token")
      })
    })

    context("when called via approveAndCall", () => {
      const amount = to1e18(100)

      beforeEach(async () => {
        await collateralToken
          .connect(underwriter1)
          .approveAndCall(assetPool.address, amount, [])
      })

      it("should mint underwriter tokens to the caller", async () => {
        expect(await underwriterToken.balanceOf(underwriter1.address)).to.equal(
          amount
        )
      })

      it("should transfer deposited amount to the pool", async () => {
        expect(await collateralToken.balanceOf(assetPool.address)).to.equal(
          amount
        )
        expect(
          await collateralToken.balanceOf(underwriter1.address)
        ).to.be.equal(underwriterInitialCollateralBalance.sub(amount))
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
        const claimRecipient = (await ethers.getSigners())[15]
        await assetPool
          .connect(coveragePool)
          .claim(claimRecipient.address, to1e18(90))
        expect(
          await collateralToken.balanceOf(claimRecipient.address)
        ).to.equal(to1e18(90))
      })

      it("should emit CoverageClaimed event", async () => {
        const claimRecipient = (await ethers.getSigners())[15]
        const claimAmount = to1e18(91)
        const tx = await assetPool
          .connect(coveragePool)
          .claim(claimRecipient.address, claimAmount)

        await expect(tx)
          .to.emit(assetPool, "CoverageClaimed")
          .withArgs(claimRecipient.address, claimAmount, await lastBlockTime())
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
        const claimRecipient = (await ethers.getSigners())[15]
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

    context(
      "when there was a pending withdrawal and withdrawal timeout elapsed",
      () => {
        beforeEach(async () => {
          await assetPool
            .connect(underwriter1)
            .initiateWithdrawal(amount.sub(10))
          await increaseTime(withdrawalDelay)
        })

        context("when adding more tokens to the withdrawal", async () => {
          let tx
          beforeEach(async () => {
            tx = await assetPool.connect(underwriter1).initiateWithdrawal(10)
          })

          it("should transfer underwriter tokens to the pool", async () => {
            expect(
              await underwriterToken.balanceOf(assetPool.address)
            ).to.equal(amount)
          })

          it("should reset the withdrawal initiated time", async () => {
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

        context("when just re-initiating", async () => {
          let tx

          beforeEach(async () => {
            tx = await assetPool.connect(underwriter1).initiateWithdrawal(0)
          })

          it("should transfer no more underwriter tokens to the pool", async () => {
            expect(
              await underwriterToken.balanceOf(assetPool.address)
            ).to.equal(amount.sub(10))
          })

          it("should reset the withdrawal initiated time", async () => {
            expect(
              await assetPool.withdrawalInitiatedTimestamp(underwriter1.address)
            ).to.equal(await lastBlockTime())
          })

          it("should emit WithdrawalInitiated event with a total COV amount", async () => {
            await expect(tx)
              .to.emit(assetPool, "WithdrawalInitiated")
              .withArgs(
                underwriter1.address,
                amount.sub(10),
                await lastBlockTime()
              )
          })
        })
      }
    )
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

        await increaseTime(withdrawalDelay - 1)
      })

      it("should revert", async () => {
        await expect(
          assetPool
            .connect(underwriter1)
            .completeWithdrawal(underwriter1.address)
        ).to.be.revertedWith("Withdrawal delay has not elapsed")
      })
    })

    context("when withdrawal timeout elapsed", () => {
      const amount = to1e18(100)
      beforeEach(async () => {
        await assetPool.connect(underwriter1).deposit(amount)
        await underwriterToken
          .connect(underwriter1)
          .approve(assetPool.address, amount)
        await assetPool.connect(underwriter1).initiateWithdrawal(amount)
        await increaseTime(withdrawalDelay + withdrawalTimeout)
      })

      it("should revert", async () => {
        await expect(
          assetPool.connect(thirdParty).completeWithdrawal(underwriter1.address)
        ).to.be.revertedWith("Withdrawal timeout elapsed")
      })
    })

    context("when withdrawal timeout not elapsed", () => {
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
        await increaseTime(withdrawalDelay)
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

          await increaseTime(withdrawalDelay)
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

          await increaseTime(withdrawalDelay)
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

          await increaseTime(withdrawalDelay)
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

      context(
        "when there was an arbitrary transfer of collateral tokens",
        () => {
          const depositedUnderwriter1 = to1e18(100)
          const depositedUnderwriter2 = to1e18(50)
          const depositedUnderwriter3 = to1e18(150)
          const transferAmount = to1e18(25)

          beforeEach(async () => {
            await assetPool.connect(underwriter1).deposit(depositedUnderwriter1)
            await assetPool.connect(underwriter2).deposit(depositedUnderwriter2)
            await assetPool.connect(underwriter3).deposit(depositedUnderwriter3)

            await collateralToken.mint(thirdParty.address, transferAmount)
            await collateralToken
              .connect(thirdParty)
              .transfer(assetPool.address, transferAmount)

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

            await increaseTime(withdrawalDelay)
            await assetPool.completeWithdrawal(underwriter1.address)
            await assetPool.completeWithdrawal(underwriter2.address)
            await assetPool.completeWithdrawal(underwriter3.address)
          })

          it("should add collateral proportionally to underwriter shares", async () => {
            // underwriter 1 has 100/300 share of the pool
            // underwriter 2 has 50/300 share of the pool
            // underwriter 3 has 150/300 share of the pool
            //
            // they are supposed to take the gain proportionally:
            //   underwriter 1: 25 * 100/300 = 8.3(3)
            //   underwriter 2: 25 * 50/300 = 4.16(6)
            //   underwriter 3: 25 * 150/300 = 12.5
            expect(
              await collateralToken.balanceOf(underwriter1.address)
            ).to.be.closeTo(
              underwriterInitialCollateralBalance.add("8333333333333333333"),
              assertionPrecision
            )
            expect(
              await collateralToken.balanceOf(underwriter2.address)
            ).to.be.closeTo(
              underwriterInitialCollateralBalance.add("4166666666666666666"),
              assertionPrecision
            )
            expect(
              await collateralToken.balanceOf(underwriter3.address)
            ).to.be.closeTo(
              underwriterInitialCollateralBalance.add("12500000000000000000"),
              assertionPrecision
            )
          })
        }
      )
    })
  })

  describe("totalValue", () => {
    context("when there is nothing in the pool", () => {
      it("should return zero", async () => {
        expect(await assetPool.totalValue()).to.equal(0)
      })
    })

    context("when there are deposits in the pool", () => {
      const depositedUnderwriter1 = to1e18(100)
      const depositedUnderwriter2 = to1e18(50)

      beforeEach(async () => {
        await assetPool.connect(underwriter1).deposit(depositedUnderwriter1)
        await assetPool.connect(underwriter2).deposit(depositedUnderwriter2)
      })

      context("when rewards were not allocated", () => {
        it("should return the current pool's collateral balance", async () => {
          expect(await assetPool.totalValue()).to.equal(to1e18(150))
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

        it("should return the current pool's collateral balance and rewards earned", async () => {
          // 70 / 7  = 10 reward tokens released every day
          // 100 + 50 + 10 = 160
          expect(await assetPool.totalValue()).to.be.closeTo(
            to1e18(160),
            assertionPrecision
          )
        })
      })
    })
  })

  describe("approveNewAssetPoolUpgrade", () => {
    let newAssetPool

    beforeEach(async () => {
      const NewUnderwriterToken = await ethers.getContractFactory(
        "UnderwriterToken"
      )
      newUnderwriterToken = await NewUnderwriterToken.deploy(
        "New Underwriter Token",
        "newCOV"
      )
      await newUnderwriterToken.deployed()

      const NewAssetPoolStub = await ethers.getContractFactory(
        "NewAssetPoolStub"
      )
      newAssetPool = await NewAssetPoolStub.deploy(
        collateralToken.address,
        newUnderwriterToken.address
      )
      await newAssetPool.deployed()
    })

    context("when called by the governance", () => {
      it("should approve new asset pool", async () => {
        await assetPool
          .connect(coveragePool)
          .approveNewAssetPoolUpgrade(newAssetPool.address)

        expect(await assetPool.newAssetPool()).to.equal(newAssetPool.address)
      })

      it("should emit ApprovedAssetPoolUpgrade event", async () => {
        const tx = await assetPool
          .connect(coveragePool)
          .approveNewAssetPoolUpgrade(newAssetPool.address)

        expect(tx)
          .to.emit(assetPool, "ApprovedAssetPoolUpgrade")
          .withArgs(newAssetPool.address)
      })
    })

    context("when called not by the governance", () => {
      it("should revert", async () => {
        await expect(
          assetPool
            .connect(thirdParty)
            .approveNewAssetPoolUpgrade(newAssetPool.address)
        ).to.be.revertedWith("Ownable: caller is not the owner")
      })
    })
  })

  describe("upgradeToNewAssetPool", () => {
    let newAssetPool
    let newUnderwriterToken

    beforeEach(async () => {
      const NewUnderwriterToken = await ethers.getContractFactory(
        "UnderwriterToken"
      )
      newUnderwriterToken = await NewUnderwriterToken.deploy(
        "New Underwriter Token",
        "newCOV"
      )
      await newUnderwriterToken.deployed()

      const NewAssetPool = await ethers.getContractFactory("NewAssetPoolStub")
      newAssetPool = await NewAssetPool.deploy(
        collateralToken.address,
        newUnderwriterToken.address
      )
      await newAssetPool.deployed()
      await newUnderwriterToken.transferOwnership(newAssetPool.address)
    })

    context("when a new asset pool address does not match", () => {
      it("should revert", async () => {
        const fakeAssetPool = (await ethers.getSigners())[5]
        await assetPool
          .connect(coveragePool)
          .approveNewAssetPoolUpgrade(fakeAssetPool.address)
        await expect(
          assetPool
            .connect(underwriter1)
            .upgradeToNewAssetPool(0, newAssetPool.address)
        ).to.be.revertedWith("Addresses of a new asset pool must match")
      })
    })

    context("when upgrading with zero underwriter tokens", () => {
      it("should revert", async () => {
        await assetPool
          .connect(coveragePool)
          .approveNewAssetPoolUpgrade(newAssetPool.address)
        await expect(
          assetPool
            .connect(underwriter1)
            .upgradeToNewAssetPool(0, newAssetPool.address)
        ).to.be.revertedWith("Underwriter token amount must be greater than 0")
      })
    })

    context("when upgrading with amount greater than available", () => {
      it("should revert", async () => {
        await assetPool
          .connect(coveragePool)
          .approveNewAssetPoolUpgrade(newAssetPool.address)

        const amount = to1e18(100)
        await assetPool.connect(underwriter1).deposit(amount)
        await underwriterToken
          .connect(underwriter1)
          .approve(assetPool.address, amount)

        const amountToUpgrade = to1e18(101)
        await expect(
          assetPool
            .connect(underwriter1)
            .upgradeToNewAssetPool(amountToUpgrade, newAssetPool.address)
        ).to.be.revertedWith(
          "Underwriter token amount exceeds available balance"
        )
      })
    })

    context("when governance hasn't upgraded to a new pool yet", () => {
      it("should revert", async () => {
        const amount = to1e18(100)
        await assetPool.connect(underwriter1).deposit(amount)
        await underwriterToken
          .connect(underwriter1)
          .approve(assetPool.address, amount)

        const amountToUpgrade = to1e18(99)
        await expect(
          assetPool
            .connect(underwriter1)
            .upgradeToNewAssetPool(amountToUpgrade, newAssetPool.address)
        ).to.be.revertedWith("New asset pool must be assigned")
      })
    })

    context("when governance upgraded to a new pool", () => {
      const amountToDeposit = to1e18(100)
      const amountToUpgrade = to1e18(40)

      context("when no collateral tokens were claimed by the pool", () => {
        let tx

        beforeEach(async () => {
          await assetPool
            .connect(coveragePool)
            .approveNewAssetPoolUpgrade(newAssetPool.address)

          await assetPool.connect(underwriter1).deposit(amountToDeposit)
          await underwriterToken
            .connect(underwriter1)
            .approve(assetPool.address, amountToUpgrade)

          tx = await assetPool
            .connect(underwriter1)
            .upgradeToNewAssetPool(amountToUpgrade, newAssetPool.address)
        })

        it("should transfer collateral tokens to the new asset pool", async () => {
          expect(
            await collateralToken.balanceOf(newAssetPool.address)
          ).to.equal(amountToUpgrade)
        })

        it("should transfer new underwriter tokens to the underwriter", async () => {
          expect(
            await newUnderwriterToken.balanceOf(underwriter1.address)
          ).to.equal(amountToUpgrade)
        })

        it("should burn old underwriter tokens from the underwriter", async () => {
          // 100 - 40 = 60
          expect(
            await underwriterToken.balanceOf(underwriter1.address)
          ).to.equal(amountToDeposit.sub(amountToUpgrade))
        })

        it("should emit AssetPoolUpgraded event", async () => {
          expect(tx)
            .to.emit(assetPool, "AssetPoolUpgraded")
            .withArgs(
              underwriter1.address,
              amountToUpgrade,
              amountToUpgrade,
              await lastBlockTime()
            )
        })
      })

      context("when there was a claim", () => {
        const claim = to1e18(25)

        beforeEach(async () => {
          await assetPool
            .connect(coveragePool)
            .approveNewAssetPoolUpgrade(newAssetPool.address)
          await assetPool.connect(underwriter1).deposit(amountToDeposit)
          await assetPool
            .connect(coveragePool)
            .claim(coveragePool.address, claim)

          await increaseTime(86400) // 1 day

          await underwriterToken
            .connect(underwriter1)
            .approve(assetPool.address, amountToUpgrade)

          await assetPool
            .connect(underwriter1)
            .upgradeToNewAssetPool(amountToUpgrade, newAssetPool.address)
        })

        it("should transfer collateral proportionally after the claim", async () => {
          // underwriter 1 has 100/100 share of the pool
          // claimed by the coverage pool: 25 which is 25%
          // 40 * 75 / 100 = 30
          expect(
            await collateralToken.balanceOf(newAssetPool.address)
          ).to.equal(to1e18(30))
        })

        it("should not change the underwriter's tokens to burn", async () => {
          expect(
            await underwriterToken.balanceOf(underwriter1.address)
          ).to.equal(amountToDeposit.sub(amountToUpgrade))
        })
      })

      context("when rewards were allocated", () => {
        const allocatedReward = to1e18(70)

        beforeEach(async () => {
          await assetPool
            .connect(coveragePool)
            .approveNewAssetPoolUpgrade(newAssetPool.address)
          await collateralToken
            .connect(rewardManager)
            .approve(rewardsPool.address, allocatedReward)
          await rewardsPool.connect(rewardManager).topUpReward(allocatedReward)

          await assetPool.connect(underwriter1).deposit(amountToDeposit)

          await increaseTime(86400) // 1 day

          await underwriterToken
            .connect(underwriter1)
            .approve(assetPool.address, amountToUpgrade)

          await assetPool
            .connect(underwriter1)
            .upgradeToNewAssetPool(amountToUpgrade, newAssetPool.address)
        })

        it("should transfer collateral proportionally after rewards allocation", async () => {
          // +10 tokens to underwriter 1
          // 40 / 110 * 100 = 44
          expect(
            await collateralToken.balanceOf(newAssetPool.address)
          ).to.be.closeTo(to1e18(44), assertionPrecision)
        })
      })
    })
  })

  describe("beginWithdrawalDelayUpdate", () => {
    const newWithdrawalDelay = 172800 // 2 days

    context("when caller is the owner", () => {
      let tx

      beforeEach(async () => {
        tx = await assetPool
          .connect(coveragePool)
          .beginWithdrawalDelayUpdate(newWithdrawalDelay)
      })

      it("should not update withdrawal delay", async () => {
        expect(await assetPool.withdrawalDelay()).to.equal(withdrawalDelay)
      })

      it("should start the governance delay timer", async () => {
        // 21 days (withdrawal delay) +
        // 2 days (withdrawal timeout) +
        // 2 days additional delay
        expect(
          await assetPool.getRemainingWithdrawalDelayUpdateTime()
        ).to.equal(withdrawalDelay + withdrawalTimeout + 2 * 24 * 3600)
      })

      it("should emit WithdrawalDelayUpdateStarted event", async () => {
        const blockTimestamp = (await ethers.provider.getBlock(tx.blockNumber))
          .timestamp
        await expect(tx)
          .to.emit(assetPool, "WithdrawalDelayUpdateStarted")
          .withArgs(newWithdrawalDelay, blockTimestamp)
      })
    })

    context("when caller is not the owner", () => {
      it("should revert", async () => {
        await expect(
          assetPool
            .connect(thirdParty)
            .beginWithdrawalDelayUpdate(newWithdrawalDelay)
        ).to.be.revertedWith("Ownable: caller is not the owner")
      })
    })
  })

  describe("finalizeWithdrawalDelayUpdate", () => {
    const newWithdrawalDelay = 172800 // 2 days

    context(
      "when the update process is initialized, governance delay passed, " +
        "and the caller is the owner",
      () => {
        let tx

        beforeEach(async () => {
          await assetPool
            .connect(coveragePool)
            .beginWithdrawalDelayUpdate(newWithdrawalDelay)

          const governanceDelay = await assetPool.withdrawalGovernanceDelay()
          await increaseTime(governanceDelay.toNumber())

          tx = await assetPool
            .connect(coveragePool)
            .finalizeWithdrawalDelayUpdate()
        })

        it("should update the withdrawal delay", async () => {
          expect(await assetPool.withdrawalDelay()).to.equal(newWithdrawalDelay)
        })

        it("should emit WithdrawalDelayUpdated event", async () => {
          await expect(tx)
            .to.emit(assetPool, "WithdrawalDelayUpdated")
            .withArgs(newWithdrawalDelay)
        })

        it("should reset the governance delay timer", async () => {
          await expect(
            assetPool.getRemainingWithdrawalDelayUpdateTime()
          ).to.be.revertedWith("Change not initiated")
        })
      }
    )

    context("when the governance delay has not passed", () => {
      beforeEach(async () => {
        await assetPool
          .connect(coveragePool)
          .beginWithdrawalDelayUpdate(newWithdrawalDelay)

        const governanceDelay = await assetPool.withdrawalGovernanceDelay()
        await increaseTime(governanceDelay.sub(60).toNumber()) // - 1 minute
      })

      it("should revert", async () => {
        await expect(
          assetPool.connect(coveragePool).finalizeWithdrawalDelayUpdate()
        ).to.be.revertedWith("Governance delay has not elapsed")
      })
    })

    context("when caller is not the owner", () => {
      it("should revert", async () => {
        await expect(
          assetPool.connect(thirdParty).finalizeWithdrawalDelayUpdate()
        ).to.be.revertedWith("Ownable: caller is not the owner")
      })
    })

    context("when the update process has not been initiated", () => {
      it("should revert", async () => {
        await expect(
          assetPool.connect(coveragePool).finalizeWithdrawalDelayUpdate()
        ).to.be.revertedWith("Change not initiated")
      })
    })
  })

  describe("beginWithdrawalTimeoutUpdate", () => {
    const newWithdrawalTimeout = 604800 // 1 week

    context("when caller is the owner", () => {
      let tx

      beforeEach(async () => {
        tx = await assetPool
          .connect(coveragePool)
          .beginWithdrawalTimeoutUpdate(newWithdrawalTimeout)
      })

      it("should not update withdrawal timeout", async () => {
        // 172800 sec = 2 days, default value
        expect(await assetPool.withdrawalTimeout()).to.equal(172800)
      })

      it("should start the governance delay timer", async () => {
        // 21 days (withdrawal delay) +
        // 2 days (withdrawal timeout) +
        // 2 days additional delay
        expect(
          await assetPool.getRemainingWithdrawalTimeoutUpdateTime()
        ).to.equal(withdrawalDelay + withdrawalTimeout + 2 * 24 * 3600)
      })

      it("should emit WithdrawalTimeoutUpdateStarted event", async () => {
        const blockTimestamp = (await ethers.provider.getBlock(tx.blockNumber))
          .timestamp
        await expect(tx)
          .to.emit(assetPool, "WithdrawalTimeoutUpdateStarted")
          .withArgs(newWithdrawalTimeout, blockTimestamp)
      })
    })

    context("when caller is not the owner", () => {
      it("should revert", async () => {
        await expect(
          assetPool
            .connect(thirdParty)
            .beginWithdrawalTimeoutUpdate(newWithdrawalTimeout)
        ).to.be.revertedWith("Ownable: caller is not the owner")
      })
    })
  })

  describe("finalizeWithdrawalTimeoutUpdate", () => {
    const newWithdrawalTimeout = 604800 // 1 week

    context(
      "when the update process is initialized, governance delay passed, " +
        "and the caller is the owner",
      () => {
        let tx

        beforeEach(async () => {
          await assetPool
            .connect(coveragePool)
            .beginWithdrawalTimeoutUpdate(newWithdrawalTimeout)

          const governanceDelay = await assetPool.withdrawalGovernanceDelay()
          await increaseTime(governanceDelay.toNumber())

          tx = await assetPool
            .connect(coveragePool)
            .finalizeWithdrawalTimeoutUpdate()
        })

        it("should update the withdrawal timeout", async () => {
          expect(await assetPool.withdrawalTimeout()).to.equal(
            newWithdrawalTimeout
          )
        })

        it("should emit WithdrawalTimeoutUpdated event", async () => {
          await expect(tx)
            .to.emit(assetPool, "WithdrawalTimeoutUpdated")
            .withArgs(newWithdrawalTimeout)
        })

        it("should reset the governance delay timer", async () => {
          await expect(
            assetPool.getRemainingWithdrawalTimeoutUpdateTime()
          ).to.be.revertedWith("Change not initiated")
        })
      }
    )

    context("when the governance delay has not passed", () => {
      beforeEach(async () => {
        await assetPool
          .connect(coveragePool)
          .beginWithdrawalTimeoutUpdate(newWithdrawalTimeout)

        const governanceDelay = await assetPool.withdrawalGovernanceDelay()
        await increaseTime(governanceDelay.sub(60).toNumber()) // - 1 minute
      })

      it("should revert", async () => {
        await expect(
          assetPool.connect(coveragePool).finalizeWithdrawalTimeoutUpdate()
        ).to.be.revertedWith("Governance delay has not elapsed")
      })
    })

    context("when caller is not the owner", () => {
      it("should revert", async () => {
        await expect(
          assetPool.connect(thirdParty).finalizeWithdrawalTimeoutUpdate()
        ).to.be.revertedWith("Ownable: caller is not the owner")
      })
    })

    context("when the update process has not been initiated", () => {
      it("should revert", async () => {
        await expect(
          assetPool.connect(coveragePool).finalizeWithdrawalTimeoutUpdate()
        ).to.be.revertedWith("Change not initiated")
      })
    })
  })

  describe("grantShares", () => {
    context("when the caller is not the owner", () => {
      it("should revert", async () => {
        await expect(
          assetPool
            .connect(thirdParty)
            .grantShares(thirdParty.address, to1e18(10))
        ).to.be.revertedWith("Ownable: caller is not the owner")
      })
    })

    context("when the caller is the owner", () => {
      beforeEach(async () => {
        await assetPool
          .connect(coveragePool)
          .grantShares(thirdParty.address, to1e18(10))
      })

      it("should mint underwriter tokens for the recipient", async () => {
        expect(
          await underwriterToken.balanceOf(thirdParty.address)
        ).to.be.equal(to1e18(10))
      })
    })
  })
})
