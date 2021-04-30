const { expect } = require("chai")
const { to1e18 } = require("./helpers/contract-test-helpers")

const UnderwriterTokenJson = require("../artifacts/contracts/UnderwriterToken.sol/UnderwriterToken.json")

describe("EthAssetPool", () => {
  let ethAssetPool
  let wethToken
  let wethAssetPool
  let underwriterToken

  let underwriter1
  let underwriter2
  let underwriter3

  beforeEach(async () => {
    const WethToken = await ethers.getContractFactory("WETH9")
    wethToken = await WethToken.deploy()
    await wethToken.deployed()

    const AssetPool = await ethers.getContractFactory("AssetPool")
    wethAssetPool = await AssetPool.deploy(wethToken.address)
    await wethAssetPool.deployed()

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
        await ethAssetPool
          .connect(underwriter1)
          .deposit({ value: depositedUnderwriter1 })
        await ethAssetPool
          .connect(underwriter2)
          .deposit({ value: depositedUnderwriter2 })
      })

      it("should transfer deposited amount of WETH to the pool", async () => {
        expect(await wethToken.balanceOf(wethAssetPool.address)).to.equal(
          to1e18(340)
        )
        expect(await wethToken.balanceOf(underwriter1.address)).to.equal(0)
        expect(await wethToken.balanceOf(underwriter2.address)).to.equal(0)
      })

      it("should mint underwriter tokens", async () => {
        expect(
          await underwriterToken.balanceOf(underwriter1.address)
        ).to.be.equal(to1e18(200)) // 100 + 100 = 200
        expect(
          await underwriterToken.balanceOf(underwriter2.address)
        ).to.be.equal(to1e18(140)) // 70 + 70 = 140
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
        ).to.be.revertedWith("Transfer amount exceeds allowance")
      })
    })

    context("when withdrawing entire deposited Ether amount", () => {
      const amount = to1e18(120)
      let tx

      beforeEach(async () => {
        await ethAssetPool.connect(underwriter1).deposit({ value: amount })
        await underwriterToken
          .connect(underwriter1)
          .approve(ethAssetPool.address, amount)
        tx = await ethAssetPool.connect(underwriter1).withdraw(amount)
      })

      it("should transfer Ether to the underwriter", async () => {
        await expect(tx).to.changeEtherBalance(underwriter1, amount)
      })

      it("should burn underwriter tokens", async () => {
        expect(await underwriterToken.balanceOf(underwriter1.address)).to.equal(
          0
        )
      })
    })

    context("when withdrawing some deposited Ether amount", () => {
      const amount = to1e18(120)
      let tx

      beforeEach(async () => {
        await ethAssetPool.connect(underwriter1).deposit({ value: amount })
        await underwriterToken
          .connect(underwriter1)
          .approve(ethAssetPool.address, amount)
        tx = await ethAssetPool.connect(underwriter1).withdraw(to1e18(30))
      })

      it("should transfer Ether to the underwriter", async () => {
        await expect(tx).to.changeEtherBalance(underwriter1, to1e18(30))
      })

      it("should burn underwriter tokens", async () => {
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
  })

  describe("receive", () => {
    context("when sending Ether directly to the contract", () => {
      it("should revert", async () => {
        await expect(
          underwriter1.sendTransaction({
            to: ethAssetPool.address,
            value: to1e18(100),
          })
        ).to.be.revertedWith("Plain ETH transfers not allowed")
      })
    })
  })
})
