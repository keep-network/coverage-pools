const { expect } = require("chai")
const { to1e18 } = require("./helpers/contract-test-helpers")

// FIXME Is there a better way to obtain a handle to contract?
const UnderwriterTokenJson = require("../artifacts/contracts/UnderwriterToken.sol/UnderwriterToken.json")

describe("AssetPool", () => {
  let assetPool
  let coveragePool

  let collateralToken
  let underwriterToken

  let underwriter1
  let underwriter2
  let underwriter3
  let underwriter4
  let underwriter5
  let underwriter6

  const assertionPrecision = ethers.BigNumber.from("100000000000000000") // 0.1
  const collateralTokenInitialBalance = to1e18(100000)

  beforeEach(async () => {
    coveragePool = await ethers.getSigner(7)

    const TestToken = await ethers.getContractFactory("TestToken")
    collateralToken = await TestToken.deploy()
    await collateralToken.deployed()

    const AssetPool = await ethers.getContractFactory("AssetPool")
    assetPool = await AssetPool.deploy(
      collateralToken.address,
      coveragePool.address
    )
    await assetPool.deployed()

    underwriterToken = new ethers.Contract(
      await assetPool.underwriterToken(),
      UnderwriterTokenJson.abi,
      ethers.provider
    )

    const createUnderwriterWithTokens = async (index) => {
      const underwriter = await ethers.getSigner(index)
      await collateralToken.mint(
        underwriter.address,
        collateralTokenInitialBalance
      )
      await collateralToken
        .connect(underwriter)
        .approve(assetPool.address, collateralTokenInitialBalance)
      return underwriter
    }

    underwriter1 = await createUnderwriterWithTokens(1)
    underwriter2 = await createUnderwriterWithTokens(2)
    underwriter3 = await createUnderwriterWithTokens(3)
    underwriter4 = await createUnderwriterWithTokens(4)
    underwriter5 = await createUnderwriterWithTokens(5)
    underwriter6 = await createUnderwriterWithTokens(6)
  })

  describe("deposit", () => {
    context("when the depositor has not enough collateral tokens", () => {
      it("should revert", async () => {
        const amount = collateralTokenInitialBalance.add(1)
        await expect(
          assetPool.connect(underwriter1).deposit(amount)
        ).to.be.revertedWith("ERC20: transfer amount exceeds balance")
      })
    })

    context("when the depositor has enough collateral tokens", () => {
      const depositedUnderwriter1 = to1e18(100)
      const depositedUnderwriter2 = to1e18(300)
      const depositedUnderwriter3 = to1e18(20)

      beforeEach(async () => {
        await assetPool.connect(underwriter1).deposit(depositedUnderwriter1)
        await assetPool.connect(underwriter2).deposit(depositedUnderwriter2)
        await assetPool.connect(underwriter3).deposit(depositedUnderwriter3)
      })

      it("should transfer deposited amount to the pool", async () => {
        expect(await collateralToken.balanceOf(assetPool.address)).to.equal(
          to1e18(420)
        )
        expect(
          await collateralToken.balanceOf(underwriter1.address)
        ).to.be.equal(collateralTokenInitialBalance.sub(depositedUnderwriter1))
        expect(
          await collateralToken.balanceOf(underwriter2.address)
        ).to.be.equal(collateralTokenInitialBalance.sub(depositedUnderwriter2))
        expect(
          await collateralToken.balanceOf(underwriter3.address)
        ).to.be.equal(collateralTokenInitialBalance.sub(depositedUnderwriter3))
      })

      it("should mint underwriter tokens", async () => {
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

    context("when deposit already exists", () => {
      const depositedUnderwriter1 = to1e18(100)
      const depositedUnderwriter2 = to1e18(70)

      beforeEach(async () => {
        await assetPool.connect(underwriter1).deposit(depositedUnderwriter1)
        await assetPool.connect(underwriter2).deposit(depositedUnderwriter2)
      })

      it("should mint underwriter tokens", async () => {
        await assetPool.connect(underwriter1).deposit(depositedUnderwriter1)
        await assetPool.connect(underwriter2).deposit(depositedUnderwriter2)

        expect(await underwriterToken.balanceOf(underwriter1.address)).to.equal(
          to1e18(200) // 100 + 100 = 200 COV
        )
        expect(await underwriterToken.balanceOf(underwriter2.address)).to.equal(
          to1e18(140) // 70 + 70 = 140 COV
        )
      })
    })

    context("when some collateral tokens were claimed by the pool", () => {
      const depositedUnderwriter1 = to1e18(100)
      const depositedUnderwriter2 = to1e18(70)
      const claimedTokens = to1e18(35)

      beforeEach(async () => {
        await assetPool.connect(underwriter1).deposit(depositedUnderwriter1)
        await assetPool.connect(underwriter2).deposit(depositedUnderwriter2)

        await assetPool.connect(coveragePool).claim(claimedTokens)
      })

      it("should mint underwriter tokens", async () => {
        await assetPool.connect(underwriter3).deposit(to1e18(20))

        expect(
          await underwriterToken.balanceOf(underwriter3.address)
        ).to.be.closeTo(
          ethers.BigNumber.from("25185185000000000000"), // 20 * 170 / 135 = ~25.185185
          assertionPrecision
        )
      })
    })
  })

  describe("withdraw", () => {
    context("when withdrawing entire collateral", () => {
      const amount = to1e18(120)

      beforeEach(async () => {
        await assetPool.connect(underwriter1).deposit(amount)
      })

      it("should burn underwriter tokens", async () => {
        await assetPool.connect(underwriter1).withdraw(amount)
        expect(await underwriterToken.balanceOf(underwriter1.address)).to.equal(
          0
        )
      })
    })

    context("when withdrawing part of the collateral", () => {
      const amount = to1e18(120)

      beforeEach(async () => {
        await assetPool.connect(underwriter1).deposit(amount)
      })

      it("should burn underwriter tokens", async () => {
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
      })

      it("should let all underwriters to withdraw their collateral", async () => {
        await assetPool.connect(underwriter1).withdraw(depositedUnderwriter1)
        await assetPool.connect(underwriter2).withdraw(depositedUnderwriter2)
        await assetPool.connect(underwriter3).withdraw(depositedUnderwriter3)
        await assetPool.connect(underwriter4).withdraw(depositedUnderwriter4)
      })

      it("should return underwriters their original collateral token amounts", async () => {
        await assetPool.connect(underwriter1).withdraw(depositedUnderwriter1)
        expect(await collateralToken.balanceOf(underwriter1.address)).to.equal(
          collateralTokenInitialBalance
        )

        await assetPool.connect(underwriter3).withdraw(depositedUnderwriter3)
        expect(await collateralToken.balanceOf(underwriter3.address)).to.equal(
          collateralTokenInitialBalance
        )
      })
    })

    context("when pool claimed some collateral tokens", () => {
      const depositedUnderwriter1 = to1e18(100)
      const depositedUnderwriter2 = to1e18(331)
      const depositedUnderwriter3 = to1e18(22)
      const depositedUnderwriter4 = to1e18(5)
      const depositedUnderwriter5 = to1e18(600)
      const depositedUnderwriter6 = to1e18(3)

      beforeEach(async () => {
        await assetPool.connect(underwriter1).deposit(depositedUnderwriter1) // 100 COV
        await assetPool.connect(underwriter2).deposit(depositedUnderwriter2) // 331 COV
        await assetPool.connect(underwriter3).deposit(depositedUnderwriter3) // 22 COV
        await assetPool.connect(underwriter4).deposit(depositedUnderwriter4) // 5 COV
        await assetPool.connect(underwriter5).deposit(depositedUnderwriter5) // 600 COV
        await assetPool.connect(underwriter6).deposit(depositedUnderwriter6) // 3 COV
      })

      it("should let all underwriters to withdraw their collateral", async () => {
        await assetPool.connect(coveragePool).claim(to1e18(10))
        await assetPool.connect(underwriter1).withdraw(depositedUnderwriter1)
        await assetPool.connect(underwriter2).withdraw(depositedUnderwriter2)
        await assetPool.connect(underwriter3).withdraw(depositedUnderwriter3)
        await assetPool.connect(underwriter4).withdraw(depositedUnderwriter4)
        await assetPool.connect(coveragePool).claim(to1e18(20))
        await assetPool.connect(underwriter5).withdraw(depositedUnderwriter5)
        await assetPool.connect(coveragePool).claim(to1e18(1))
        await assetPool.connect(underwriter6).withdraw(depositedUnderwriter6)
      })

      it("should withdraw underwriter collateral tokens proportionally to their pool share", async () => {
        // 1061 COV tokens exist and 1061 collateral tokens are deposited in
        // the pool. 40 collateral tokens are claimed by the pool.
        await assetPool.connect(coveragePool).claim(to1e18(40))

        // Underwriter has 100/1061 share of the pool. The pool has 1021
        // collateral tokens so the underwriter can claim
        // 1021 * 100/1061 = 96.2299 tokens.
        await assetPool.connect(underwriter1).withdraw(depositedUnderwriter1)
        expect(
          await collateralToken.balanceOf(underwriter1.address)
        ).to.be.closeTo(
          collateralTokenInitialBalance
            .sub(depositedUnderwriter1)
            .add(ethers.BigNumber.from("96229900000000000000")),
          assertionPrecision
        )

        // 961 COV tokens exist and 924.77 collateral tokens are deposited in
        // the pool. 60 collateral tokens are claimed by the pool.
        await assetPool.connect(coveragePool).claim(to1e18(60))

        // Underwriter has 331/961 share of the pool and decides to spend half
        // of it. The pool has 864.77 collateral tokens so the underwriter
        // claims 864.77 * 165/961 = 148.4776 tokens.
        await assetPool.connect(underwriter2).withdraw(to1e18(165))
        expect(
          await collateralToken.balanceOf(underwriter2.address)
        ).to.be.closeTo(
          collateralTokenInitialBalance
            .sub(depositedUnderwriter2)
            .add(ethers.BigNumber.from("148477600000000000000")),
          assertionPrecision
        )

        // Underwriter has 5/796 share of the pool. The pool has 716.29
        // collateral tokens so the underwriter can claim
        // 716.29 * 5/796 = 4.4993 tokens.
        await assetPool.connect(underwriter4).withdraw(depositedUnderwriter4)
        expect(
          await collateralToken.balanceOf(underwriter4.address)
        ).to.be.closeTo(
          collateralTokenInitialBalance
            .sub(depositedUnderwriter4)
            .add(ethers.BigNumber.from("4499300000000000000")),
          assertionPrecision
        )
      })

      context("when collateral tokens were deposited in the meantime", () => {
        it("should withdraw underwriter collateral tokens proportionally to their pool share", async () => {
          // 1061 COV tokens exist and 1061 collateral tokens are deposited in
          // the pool. 40 collateral tokens are claimed by the pool.
          await assetPool.connect(coveragePool).claim(to1e18(40))

          // 331 * 1061 / 1021 = 343.9676 COV minted
          await assetPool.connect(underwriter2).deposit(depositedUnderwriter2)

          // 3 * 1404.96 / 1352 = 3.1175 COV minted
          await assetPool.connect(underwriter6).deposit(depositedUnderwriter6)

          // Underwriter has 100/1408.0851 share of the pool. The pool has 1355
          // collateral tokens so the underwriter can claim
          // 1355 * 100/1408.0851 = 96.2299 tokens.
          await assetPool.connect(underwriter1).withdraw(depositedUnderwriter1)
          expect(
            await collateralToken.balanceOf(underwriter1.address)
          ).to.be.closeTo(
            collateralTokenInitialBalance
              .sub(depositedUnderwriter1)
              .add(ethers.BigNumber.from("96229900000000000000")),
            assertionPrecision
          )

          // 1308.0851 COV tokens exist and 1258.7701 collateral tokens are
          // deposited in the pool. 60 collateral tokens are claimed by the pool.
          await assetPool.connect(coveragePool).claim(to1e18(60))

          // Underwriter has 674.9676/1308.0851 share of the pool and decides to
          // spend half  of it. The pool has 1198.7701 collateral tokens so the
          // underwriter claims 1198.7701 * 337/1308.0851 = 308.8373 tokens.
          await assetPool.connect(underwriter2).withdraw(to1e18(337))
          expect(
            await collateralToken.balanceOf(underwriter2.address)
          ).to.be.closeTo(
            collateralTokenInitialBalance
              .sub(depositedUnderwriter2)
              .sub(depositedUnderwriter2) // deposited twice
              .add(ethers.BigNumber.from("308837300000000000000")),
            assertionPrecision
          )
        })
      })
    })
  })

  describe("claim", () => {
    beforeEach(async () => {
      await assetPool.connect(underwriter1).deposit(to1e18(200))
    })
    context("when not done by coverage pool", () => {
      it("should revert", async () => {
        await expect(
          assetPool.connect(underwriter1).claim(to1e18(100))
        ).to.be.revertedWith("Caller is not the coverage pool")
      })
    })

    context("when done by coverage pool", () => {
      it("should transfer claimed tokens to coverage pool", async () => {
        await assetPool.connect(coveragePool).claim(to1e18(90))
        expect(await collateralToken.balanceOf(coveragePool.address)).to.equal(
          to1e18(90)
        )
      })
    })
  })
})
