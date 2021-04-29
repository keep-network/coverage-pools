const { expect } = require("chai")
const { to1e18 } = require("./helpers/contract-test-helpers")

// FIXME Is there a better way to obtain a handle to contract?
const UnderwriterTokenJson = require("../artifacts/contracts/UnderwriterToken.sol/UnderwriterToken.json")

describe("EthAssetPool", () => {
  let coveragePool

  let ethAssetPool
  let wethToken
  let wethAssetPool
  let underwriterToken

  let underwriter1
  let underwriter2
  let underwriter3
  let underwriter4
  let underwriter5
  let underwriter6

  const assertionPrecision = ethers.BigNumber.from("1000000000000") // 0.000001

  beforeEach(async () => {
    coveragePool = await ethers.getSigner(7)

    const WethToken = await ethers.getContractFactory("WETH9")
    wethToken = await WethToken.deploy()
    await wethToken.deployed()

    const AssetPool = await ethers.getContractFactory("AssetPool")
    wethAssetPool = await AssetPool.deploy(wethToken.address)
    await wethAssetPool.deployed()
    await wethAssetPool.transferOwnership(coveragePool.address)

    const EthAssetPool = await ethers.getContractFactory("EthAssetPool")
    ethAssetPool = await EthAssetPool.deploy(
      wethToken.address,
      wethAssetPool.address
    )
    await ethAssetPool.deployed()

    underwriterToken = new ethers.Contract(
      await wethAssetPool.underwriterToken(),
      UnderwriterTokenJson.abi,
      ethers.provider
    )

    underwriter1 = await ethers.getSigner(1)
    underwriter2 = await ethers.getSigner(2)
    underwriter3 = await ethers.getSigner(3)
    underwriter4 = await ethers.getSigner(4)
    underwriter5 = await ethers.getSigner(5)
    underwriter6 = await ethers.getSigner(6)
  })

  describe("deposit", () => {
    context("when the depositor sends 0 ETH", () => {
      it("should revert", async () => {
        await expect(
          ethAssetPool.connect(underwriter1).deposit({ value: 0 })
        ).to.be.revertedWith("No Ether sent to deposit")
      })
    })

    context("when the depositor sends ETH properly", () => {
      const depositedUnderwriter1 = to1e18(100)
      const depositedUnderwriter2 = to1e18(300)
      const depositedUnderwriter3 = to1e18(20)

      beforeEach(async () => {
        await ethAssetPool
          .connect(underwriter1)
          .deposit({ value: depositedUnderwriter1 })
        await ethAssetPool
          .connect(underwriter2)
          .deposit({ value: depositedUnderwriter2 })
        await ethAssetPool
          .connect(underwriter3)
          .deposit({ value: depositedUnderwriter3 })
      })

      it("should transfer deposited amount of WETH to the pool", async () => {
        expect(await wethToken.balanceOf(wethAssetPool.address)).to.equal(
          to1e18(420)
        )
        expect(await wethToken.balanceOf(underwriter1.address)).to.equal(0)
        expect(await wethToken.balanceOf(underwriter2.address)).to.equal(0)
        expect(await wethToken.balanceOf(underwriter3.address)).to.equal(0)
      })

      it("should mint underwriter tokens", async () => {
        expect(
          await underwriterToken.balanceOf(underwriter1.address)
        ).to.be.equal(to1e18(100))
        expect(
          await underwriterToken.balanceOf(underwriter2.address)
        ).to.be.equal(to1e18(300))
        expect(
          await underwriterToken.balanceOf(underwriter3.address)
        ).to.be.equal(to1e18(20))
      })
    })

    context("when ETH deposit already exists", () => {
      const depositedUnderwriter1 = to1e18(100)
      const depositedUnderwriter2 = to1e18(70)

      beforeEach(async () => {
        await ethAssetPool
          .connect(underwriter1)
          .deposit({ value: depositedUnderwriter1 })
        await ethAssetPool
          .connect(underwriter2)
          .deposit({ value: depositedUnderwriter2 })
      })

      it("should mint underwriter tokens", async () => {
        await ethAssetPool
          .connect(underwriter1)
          .deposit({ value: depositedUnderwriter1 })
        await ethAssetPool
          .connect(underwriter2)
          .deposit({ value: depositedUnderwriter2 })

        expect(
          await underwriterToken.balanceOf(underwriter1.address)
        ).to.be.equal(to1e18(200)) // 100 + 100 = 200
        expect(
          await underwriterToken.balanceOf(underwriter2.address)
        ).to.be.equal(to1e18(140)) // 70 + 70 = 140
      })
    })

    context("when some WETH tokens were claimed by the pool", () => {
      const depositedUnderwriter1 = to1e18(100)
      const depositedUnderwriter2 = to1e18(70)
      const claimedTokens = to1e18(35)

      beforeEach(async () => {
        await ethAssetPool
          .connect(underwriter1)
          .deposit({ value: depositedUnderwriter1 })
        await ethAssetPool
          .connect(underwriter2)
          .deposit({ value: depositedUnderwriter2 })

        await wethAssetPool
          .connect(coveragePool)
          .claim(coveragePool.address, claimedTokens)
      })

      it("should mint underwriter tokens", async () => {
        await ethAssetPool.connect(underwriter3).deposit({ value: to1e18(20) })

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
    context("when withdrawing ETH without aproving", () => {
      const amount = to1e18(120)

      beforeEach(async () => {
        await ethAssetPool.connect(underwriter1).deposit({ value: amount })
      })

      it("should revert", async () => {
        await expect(
          ethAssetPool.connect(underwriter1).withdraw(amount)
        ).to.be.revertedWith("Not enough Underwriter tokens approved")
      })
    })

    context("when withdrawing entire deposited Ether amount", () => {
      const amount = to1e18(120)

      beforeEach(async () => {
        await ethAssetPool.connect(underwriter1).deposit({ value: amount })
        await underwriterToken
          .connect(underwriter1)
          .approve(ethAssetPool.address, amount)
      })

      it("should burn underwriter tokens", async () => {
        await expect(
          await ethAssetPool.connect(underwriter1).withdraw(amount)
        ).to.changeEtherBalance(underwriter1, amount)

        expect(await underwriterToken.balanceOf(underwriter1.address)).to.equal(
          0
        )
      })
    })

    context("when withdrawing some deposited Ether amount", () => {
      const amount = to1e18(120)

      beforeEach(async () => {
        await ethAssetPool.connect(underwriter1).deposit({ value: amount })
        await underwriterToken
          .connect(underwriter1)
          .approve(ethAssetPool.address, amount)
      })

      it("should burn underwriter tokens", async () => {
        await expect(
          await ethAssetPool.connect(underwriter1).withdraw(to1e18(30))
        ).to.changeEtherBalance(underwriter1, to1e18(30))

        expect(await underwriterToken.balanceOf(underwriter1.address)).to.equal(
          to1e18(90)
        )
      })
    })

    context("when trying to withdraw more Ether than deposited", () => {
      const amount = to1e18(120)
      const withdrawAmount = amount.add(1)

      beforeEach(async () => {
        await ethAssetPool.connect(underwriter1).deposit({ value: amount })
        await underwriterToken
          .connect(underwriter1)
          .approve(ethAssetPool.address, withdrawAmount)
      })

      it("should revert", async () => {
        await expect(
          ethAssetPool.connect(underwriter1).withdraw(withdrawAmount)
        ).to.be.revertedWith("Transfer amount exceeds balance")
      })
    })

    context("when no WETH tokens were claimed by the pool", () => {
      const depositedUnderwriter1 = to1e18(100)
      const depositedUnderwriter2 = to1e18(331)
      const depositedUnderwriter3 = to1e18(22)
      const depositedUnderwriter4 = to1e18(5)

      beforeEach(async () => {
        await ethAssetPool
          .connect(underwriter1)
          .deposit({ value: depositedUnderwriter1 })
        await ethAssetPool
          .connect(underwriter2)
          .deposit({ value: depositedUnderwriter2 })
        await ethAssetPool
          .connect(underwriter3)
          .deposit({ value: depositedUnderwriter3 })
        await ethAssetPool
          .connect(underwriter4)
          .deposit({ value: depositedUnderwriter4 })

        // No tokens were claimed by the coverage pool so the number of WETH
        // tokens minted is equal to the number of tokens deposited.
        await underwriterToken
          .connect(underwriter1)
          .approve(ethAssetPool.address, depositedUnderwriter1)
        await underwriterToken
          .connect(underwriter2)
          .approve(ethAssetPool.address, depositedUnderwriter2)
        await underwriterToken
          .connect(underwriter3)
          .approve(ethAssetPool.address, depositedUnderwriter3)
        await underwriterToken
          .connect(underwriter4)
          .approve(ethAssetPool.address, depositedUnderwriter4)
      })

      it("should let all underwriters withdraw their original Ether amounts", async () => {
        await expect(
          await ethAssetPool
            .connect(underwriter4)
            .withdraw(depositedUnderwriter4)
        ).to.changeEtherBalance(underwriter4, depositedUnderwriter4)

        await expect(
          await ethAssetPool
            .connect(underwriter1)
            .withdraw(depositedUnderwriter1)
        ).to.changeEtherBalance(underwriter1, depositedUnderwriter1)

        await expect(
          await ethAssetPool
            .connect(underwriter3)
            .withdraw(depositedUnderwriter3)
        ).to.changeEtherBalance(underwriter3, depositedUnderwriter3)

        await expect(
          await ethAssetPool
            .connect(underwriter2)
            .withdraw(depositedUnderwriter2)
        ).to.changeEtherBalance(underwriter2, depositedUnderwriter2)
      })
    })

    context("when pool claimed some WETH tokens", () => {
      const depositedUnderwriter1 = to1e18(100)
      const depositedUnderwriter2 = to1e18(331)
      const depositedUnderwriter3 = to1e18(22)
      const depositedUnderwriter4 = to1e18(5)
      const depositedUnderwriter5 = to1e18(600)
      const depositedUnderwriter6 = to1e18(3)

      beforeEach(async () => {
        await ethAssetPool
          .connect(underwriter1)
          .deposit({ value: depositedUnderwriter1 }) // 100 ETH
        await ethAssetPool
          .connect(underwriter2)
          .deposit({ value: depositedUnderwriter2 }) // 331 ETH
        await ethAssetPool
          .connect(underwriter3)
          .deposit({ value: depositedUnderwriter3 }) // 22 ETH
        await ethAssetPool
          .connect(underwriter4)
          .deposit({ value: depositedUnderwriter4 }) // 5 ETH
        await ethAssetPool
          .connect(underwriter5)
          .deposit({ value: depositedUnderwriter5 }) // 600 ETH
        await ethAssetPool
          .connect(underwriter6)
          .deposit({ value: depositedUnderwriter6 }) // 3 ETH
      })

      it("should let all underwriters withdraw their Ether proportionally to their pool share", async () => {
        // 40 WETH tokens are claimed by the coverage pool.
        await wethAssetPool
          .connect(coveragePool)
          .claim(coveragePool.address, to1e18(40))

        // The pool has 1021 WETH tokens now (1061 - 40).
        // 1061 WETH tokens exist. The underwriter has 100 WETH tokens.
        // The underwriter can withdraw 1021 * 100/1061 = ~96.22997172
        // ETH from the pool.
        await underwriterToken
          .connect(underwriter1)
          .approve(ethAssetPool.address, depositedUnderwriter1)
        await expect(
          await ethAssetPool
            .connect(underwriter1)
            .withdraw(depositedUnderwriter1)
        ).to.changeEtherBalance(
          underwriter1,
          ethers.BigNumber.from("96229971724787935909")
        )

        // The pool has 924.77002828 WETH tokens now
        // (1061 - 40 - 96.22997172). 961 WETH tokens exist (1061 - 100).
        // Three underwriters with a total of 600 + 22 + 3 = 625 WETH tokens
        // withdraw their share. In total, they withdraw
        // 924.77002828 * 625 / 961 = ~601.43732328
        // ETH from the pool.
        await underwriterToken
          .connect(underwriter5)
          .approve(ethAssetPool.address, depositedUnderwriter5)
        await underwriterToken
          .connect(underwriter3)
          .approve(ethAssetPool.address, depositedUnderwriter3)
        await underwriterToken
          .connect(underwriter6)
          .approve(ethAssetPool.address, depositedUnderwriter6)
        await ethAssetPool.connect(underwriter5).withdraw(depositedUnderwriter5)
        await ethAssetPool.connect(underwriter3).withdraw(depositedUnderwriter3)
        await ethAssetPool.connect(underwriter6).withdraw(depositedUnderwriter6)

        // 60 WETH tokens are claimed by the coverage pool.
        await wethAssetPool
          .connect(coveragePool)
          .claim(coveragePool.address, to1e18(60))

        // The pool has 263.332705 WETH tokens now
        // (1061 - 40 - 96.22997172 - 601.43732328 - 60).
        // 336 WETH tokens exist (1061 - 100 - 625). The underwriter has 5 WETH
        // tokens. The underwriter can withdraw 263.332705 * 5/336 = ~3.91864144
        // ETH from the pool.
        await underwriterToken
          .connect(underwriter4)
          .approve(ethAssetPool.address, depositedUnderwriter4)
        await expect(
          await ethAssetPool
            .connect(underwriter4)
            .withdraw(depositedUnderwriter4)
        ).to.changeEtherBalance(
          underwriter4,
          ethers.BigNumber.from("3918641443382253938")
        )

        // The pool has 259.41406356 WETH tokens now.
        // (1061 - 40 - 96.22997172 - 601.43732328 - 60 - 3.91864144).
        // 331 WETH tokens exist ((1061 - 100 - 625 - 5). The underwriter has 331
        // WETH tokens. The underwriter can withdraw 259.41406356 ETH
        // from the pool.
        await underwriterToken
          .connect(underwriter2)
          .approve(ethAssetPool.address, depositedUnderwriter2)
        await expect(
          await ethAssetPool
            .connect(underwriter2)
            .withdraw(depositedUnderwriter2)
        ).to.changeEtherBalance(
          underwriter2,
          ethers.BigNumber.from("259414063551905210719")
        )

        // Nothing left in the collateral pool
        expect(await wethToken.balanceOf(wethAssetPool.address)).to.equal(0)
      })

      context("when Ether was deposited in the meantime", () => {
        it("should withdraw underwriter WETH tokens proportionally to their pool share", async () => {
          // 1061 WETH tokens exist and 1061 WETH tokens are deposited in
          // the pool. 40 WETH tokens are claimed by the pool.
          await wethAssetPool
            .connect(coveragePool)
            .claim(coveragePool.address, to1e18(40))

          // 331 WETH tokens added to the pool
          // 331 * 1061 / 1021 = 343.96767874 WETH minted
          await ethAssetPool
            .connect(underwriter2)
            .deposit({ value: depositedUnderwriter2 })

          // 3 WETH tokens added to the pool
          // 3 * 1404.96767874 / 1352 = 3.11753183 WETH minted
          await ethAssetPool
            .connect(underwriter6)
            .deposit({ value: depositedUnderwriter6 })

          // Underwriter has 100/1408.08521057 share of the pool. The pool has 1355
          // WETH tokens (1061-40+331+3) so the underwriter can claim
          // 1355 * 100/1408.08521057 = 96.2299717253 tokens.
          await underwriterToken
            .connect(underwriter1)
            .approve(ethAssetPool.address, depositedUnderwriter1)
          await expect(
            await ethAssetPool
              .connect(underwriter1)
              .withdraw(depositedUnderwriter1)
          ).to.changeEtherBalance(
            underwriter1,
            ethers.BigNumber.from("96229971724787935909")
          )

          // 1308.08521057 WETH tokens exist and 1258.77002827 WETH tokens are
          // deposited in the pool. 60 WETH tokens are claimed by the pool.
          await wethAssetPool
            .connect(coveragePool)
            .claim(coveragePool.address, to1e18(60))

          // Underwriter has 674.96767874/1308.08521057 share of the pool and
          // decides to spend half of it. The pool has 1198.77002827 WETH
          // tokens so the underwriter claims
          // 1198.77002827 * 337/1308.08521057 = 308.83729612 tokens.
          await underwriterToken
            .connect(underwriter2)
            .approve(ethAssetPool.address, to1e18(337))
          await expect(
            await ethAssetPool.connect(underwriter2).withdraw(to1e18(337))
          ).to.changeEtherBalance(
            underwriter2,
            ethers.BigNumber.from("308837296119478524940")
          )
        })
      })
    })
  })
})
