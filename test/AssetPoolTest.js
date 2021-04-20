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

  const assertionPrecision = ethers.BigNumber.from("1000000000000") // 0.000001
  const collateralTokenInitialBalance = to1e18(100000)

  beforeEach(async () => {
    coveragePool = await ethers.getSigner(7)

    const TestToken = await ethers.getContractFactory("TestToken")
    collateralToken = await TestToken.deploy()
    await collateralToken.deployed()

    const AssetPool = await ethers.getContractFactory("AssetPool")
    assetPool = await AssetPool.deploy(collateralToken.address)
    await assetPool.deployed()
    await assetPool.transferOwnership(coveragePool.address)

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

        await assetPool
          .connect(coveragePool)
          .claim(coveragePool.address, claimedTokens)
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
        await underwriterToken
          .connect(underwriter1)
          .approve(assetPool.address, amount)
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
        await underwriterToken
          .connect(underwriter1)
          .approve(assetPool.address, amount)
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

        // No tokens were claimed by the coverage pool so the number of COV
        // minted is equal to the number of tokens deposited.
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

      it("should let all underwriters withdraw their original collateral token amounts", async () => {
        await assetPool.connect(underwriter4).withdraw(depositedUnderwriter4)
        expect(await collateralToken.balanceOf(underwriter4.address)).to.equal(
          collateralTokenInitialBalance
        )

        await assetPool.connect(underwriter1).withdraw(depositedUnderwriter1)
        expect(await collateralToken.balanceOf(underwriter1.address)).to.equal(
          collateralTokenInitialBalance
        )

        await assetPool.connect(underwriter3).withdraw(depositedUnderwriter3)
        expect(await collateralToken.balanceOf(underwriter3.address)).to.equal(
          collateralTokenInitialBalance
        )
        await assetPool.connect(underwriter2).withdraw(depositedUnderwriter2)
        expect(await collateralToken.balanceOf(underwriter2.address)).to.equal(
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

      it("should let all underwriters withdraw their collateral tokens proportionally to their pool share", async () => {
        // 40 collateral tokens are claimed by the coverage pool.
        await assetPool
          .connect(coveragePool)
          .claim(coveragePool.address, to1e18(40))

        // The pool has 1021 collateral tokens now (1061 - 40).
        // 1061 COV tokens exist. The underwriter has 100 COV tokens.
        // The underwriter can withdraw 1021 * 100/1061 = ~96.22997172
        // collateral tokens from the pool.
        await underwriterToken
          .connect(underwriter1)
          .approve(assetPool.address, depositedUnderwriter1)
        await assetPool.connect(underwriter1).withdraw(depositedUnderwriter1)
        expect(
          await collateralToken.balanceOf(underwriter1.address)
        ).to.be.closeTo(
          collateralTokenInitialBalance
            .sub(depositedUnderwriter1)
            .add(ethers.BigNumber.from("96229971720000000000")),
          assertionPrecision
        )

        // The pool has 924.77002828 collateral tokens now
        // (1061 - 40 - 96.22997172). 961 COV tokens exist (1061 - 100).
        // Three underwriters with a total of 600 + 22 + 3 = 625 COV tokens
        // withdraw their share. In total, they withdraw
        // 924.77002828 * 625 / 961 = ~601.43732328
        // collateral tokens from the pool.
        await underwriterToken
          .connect(underwriter5)
          .approve(assetPool.address, depositedUnderwriter5)
        await underwriterToken
          .connect(underwriter3)
          .approve(assetPool.address, depositedUnderwriter3)
        await underwriterToken
          .connect(underwriter6)
          .approve(assetPool.address, depositedUnderwriter6)
        await assetPool.connect(underwriter5).withdraw(depositedUnderwriter5)
        await assetPool.connect(underwriter3).withdraw(depositedUnderwriter3)
        await assetPool.connect(underwriter6).withdraw(depositedUnderwriter6)

        // 60 collateral tokens are claimed by the coverage pool.
        await assetPool
          .connect(coveragePool)
          .claim(coveragePool.address, to1e18(60))

        // The pool has 263.332705 collateral tokens now
        // (1061 - 40 - 96.22997172 - 601.43732328 - 60).
        // 336 COV tokens exist (1061 - 100 - 625). The underwriter has 5 COV
        // tokens. The underwriter can withdraw 263.332705 * 5/336 = ~3.91864144
        // collateral tokens from the pool.
        await underwriterToken
          .connect(underwriter4)
          .approve(assetPool.address, depositedUnderwriter4)
        await assetPool.connect(underwriter4).withdraw(depositedUnderwriter4)
        expect(
          await collateralToken.balanceOf(underwriter4.address)
        ).to.be.closeTo(
          collateralTokenInitialBalance
            .sub(depositedUnderwriter4)
            .add(ethers.BigNumber.from("3918641440000000000")),
          assertionPrecision
        )

        // The pool has 259.41406356 collateral tokens now.
        // (1061 - 40 - 96.22997172 - 601.43732328 - 60 - 3.91864144).
        // 331 COV tokens exist ((1061 - 100 - 625 - 5). The underwriter has 331
        // COV tokens. The underwriter can withdraw 259.41406356 collateral
        // tokens from the pool.
        await underwriterToken
          .connect(underwriter2)
          .approve(assetPool.address, depositedUnderwriter2)
        await assetPool.connect(underwriter2).withdraw(depositedUnderwriter2)
        expect(
          await collateralToken.balanceOf(underwriter2.address)
        ).to.be.closeTo(
          collateralTokenInitialBalance
            .sub(depositedUnderwriter2)
            .add(ethers.BigNumber.from("259414063560000000000")),
          assertionPrecision
        )

        // Nothing left in the collateral pool
        expect(await collateralToken.balanceOf(assetPool.address)).to.equal(0)
      })

      context("when collateral tokens were deposited in the meantime", () => {
        it("should withdraw underwriter collateral tokens proportionally to their pool share", async () => {
          // 1061 COV tokens exist and 1061 collateral tokens are deposited in
          // the pool. 40 collateral tokens are claimed by the pool.
          await assetPool
            .connect(coveragePool)
            .claim(coveragePool.address, to1e18(40))

          // 331 collateral tokens added to the pool
          // 331 * 1061 / 1021 = 343.96767874 COV minted
          await assetPool.connect(underwriter2).deposit(depositedUnderwriter2)

          // 3 collateral tokens added to the pool
          // 3 * 1404.96767874 / 1352 = 3.11753183 COV minted
          await assetPool.connect(underwriter6).deposit(depositedUnderwriter6)

          // Underwriter has 100/1408.08521057 share of the pool. The pool has 1355
          // collateral tokens (1061-40+331+3) so the underwriter can claim
          // 1355 * 100/1408.08521057 = 96.2299717253 tokens.
          await underwriterToken
            .connect(underwriter1)
            .approve(assetPool.address, depositedUnderwriter1)
          await assetPool.connect(underwriter1).withdraw(depositedUnderwriter1)
          expect(
            await collateralToken.balanceOf(underwriter1.address)
          ).to.be.closeTo(
            collateralTokenInitialBalance
              .sub(depositedUnderwriter1)
              .add(ethers.BigNumber.from("96229971725300000000")),
            assertionPrecision
          )

          // 1308.08521057 COV tokens exist and 1258.77002827 collateral tokens are
          // deposited in the pool. 60 collateral tokens are claimed by the pool.
          await assetPool
            .connect(coveragePool)
            .claim(coveragePool.address, to1e18(60))

          // Underwriter has 674.96767874/1308.08521057 share of the pool and
          // decides to spend half of it. The pool has 1198.77002827 collateral
          // tokens so the underwriter claims
          // 1198.77002827 * 337/1308.08521057 = 308.83729612 tokens.
          await underwriterToken
            .connect(underwriter2)
            .approve(assetPool.address, to1e18(337))
          await assetPool.connect(underwriter2).withdraw(to1e18(337))
          expect(
            await collateralToken.balanceOf(underwriter2.address)
          ).to.be.closeTo(
            collateralTokenInitialBalance
              .sub(depositedUnderwriter2)
              .sub(depositedUnderwriter2) // deposited twice
              .add(ethers.BigNumber.from("308837296120000000000")),
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
  })
})
