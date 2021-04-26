const { expect } = require("chai")
const { to1e18 } = require("./helpers/contract-test-helpers")

// FIXME Is there a better way to obtain a handle to contract?
const UnderwriterTokenJson = require("../artifacts/contracts/UnderwriterToken.sol/UnderwriterToken.json")
const AssetPoolJson = require("../artifacts/contracts/AssetPool.sol/AssetPool.json")

describe("EthAssetPool", () => {
  let ethAssetPool
  let coveragePool

  let wethToken
  let assetPool
  let underwriterToken

  let underwriter1
  let underwriter2
  let underwriter3

  beforeEach(async () => {
    coveragePool = await ethers.getSigner(7)

    const WethToken = await ethers.getContractFactory("WETH9")
    wethToken = await WethToken.deploy()
    await wethToken.deployed()

    const EthAssetPool = await ethers.getContractFactory("EthAssetPool")
    ethAssetPool = await EthAssetPool.deploy(wethToken.address)
    await ethAssetPool.deployed()
    //await ethAssetPool.transferOwnership(coveragePool.address)

    assetPool = new ethers.Contract(
      await ethAssetPool.assetPool(),
      AssetPoolJson.abi,
      ethers.provider
    )

    underwriterToken = new ethers.Contract(
      await assetPool.underwriterToken(),
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
        expect(await wethToken.balanceOf(assetPool.address)).to.equal(
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
  })

  describe("withdraw", () => {
    // TODO: implement
  })

  describe("claim", () => {
    // TODO: implement if necessary
  })
})
