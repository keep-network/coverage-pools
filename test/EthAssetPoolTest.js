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
  })

  describe("deposit", () => {
    context("when the depositor sends 0 ETH", () => {
      it("should revert", async () => {
        await expect(
          ethAssetPool.connect(underwriter1).deposit({ value: 0 })
        ).to.be.revertedWith("No ether sent to deposit")
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
        ).to.be.equal(to1e18(200)) // 100 + 100 = 200 COV
        expect(
          await underwriterToken.balanceOf(underwriter2.address)
        ).to.be.equal(to1e18(140)) // 70 + 70 = 140 COV
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
    const precisionEthBalance = ethers.BigNumber.from("1000000000000000") // 0.001

    context("when withdrawing ETH without aproving", () => {

    })

    context("when withdrawing entire deposited ETH amount", () => {
      const amount = to1e18(120)

      beforeEach(async () => {
        await ethAssetPool.connect(underwriter1).deposit({ value: amount })
        await underwriterToken
          .connect(underwriter1)
          .approve(ethAssetPool.address, amount)
        })

      it("should burn underwriter tokens", async () => {
        const balanceBefore = await ethers.provider.getBalance(underwriter1.address);
        await ethAssetPool.connect(underwriter1).withdraw(amount)

        const balanceAfter = await ethers.provider.getBalance(underwriter1.address);
        expect(balanceAfter).to.be.closeTo(balanceBefore.add(amount), precisionEthBalance);

        expect(await underwriterToken.balanceOf(underwriter1.address)).to.equal(
          0
        )
      })
    })
  })
})
