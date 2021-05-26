const chai = require("chai")
const expect = chai.expect

const { to1e18 } = require("./helpers/contract-test-helpers")

describe("SignerBondsUniswapV2", () => {
  let governance
  let riskManager
  let other
  let uniswapV2RouterStub
  let uniswapV2PairStub
  let coveragePoolStub
  let signerBondsUniswapV2

  // Real KEEP token mainnet address in order to get a verifiable pair address.
  const tokenAddress = "0x85eee30c52b0b379b046fb0f85f4f3dc3009afec"

  beforeEach(async () => {
    governance = await ethers.getSigner(0)
    riskManager = await ethers.getSigner(1)
    other = await ethers.getSigner(2)

    const UniswapV2RouterStub = await ethers.getContractFactory(
      "UniswapV2RouterStub"
    )
    uniswapV2RouterStub = await UniswapV2RouterStub.deploy()
    await uniswapV2RouterStub.deployed()

    const UniswapV2PairStub = await ethers.getContractFactory(
      "UniswapV2PairStub"
    )
    uniswapV2PairStub = await UniswapV2PairStub.deploy()
    await uniswapV2PairStub.deployed()

    const CoveragePoolStub = await ethers.getContractFactory("CoveragePoolStub")
    coveragePoolStub = await CoveragePoolStub.deploy(tokenAddress)
    await coveragePoolStub.deployed()

    const SignerBondsUniswapV2 = await ethers.getContractFactory(
      "SignerBondsUniswapV2Stub"
    )
    signerBondsUniswapV2 = await SignerBondsUniswapV2.deploy(
      uniswapV2RouterStub.address,
      coveragePoolStub.address
    )
    await signerBondsUniswapV2.deployed()

    // SignerBondsUniswapV2 has to point to the deployed UniswapV2PairStub
    // instance to make tests work. However, before setting the new value
    // via the stub, assert the initial value is correct and the pair
    // address computing logic works well.
    expect(await signerBondsUniswapV2.uniswapPair()).to.be.equal(
      // address of real KEEP/ETH LP pool
      "0xE6f19dAb7d43317344282F803f8E8d240708174a"
    )
    await signerBondsUniswapV2.setUniswapPair(uniswapV2PairStub.address)
  })

  describe("swapSignerBonds", () => {
    let tx

    beforeEach(async () => {
      tx = await signerBondsUniswapV2
        .connect(riskManager)
        .swapSignerBonds({ value: ethers.utils.parseEther("10") })
    })

    it("should add the processed signer bonds to the contract balance", async () => {
      await expect(tx).to.changeEtherBalance(
        signerBondsUniswapV2,
        ethers.utils.parseEther("10")
      )
    })
  })

  // TODO: setMaxAllowedPriceImpact
  // TODO: setSlippageTolerance
  // TODO: setSwapDeadline

  describe("swapSignerBondsOnUniswapV2", () => {
    const ethReserves = 1000
    const tokenReserves = 5000
    const exchangeRate = 5 // because one can get 5 tokens for every 1 ETH

    beforeEach(async () => {
      await uniswapV2PairStub.setReserves(
        to1e18(ethReserves),
        to1e18(tokenReserves)
      )

      await uniswapV2RouterStub.setExchangeRate(exchangeRate)

      await signerBondsUniswapV2
        .connect(riskManager)
        .swapSignerBonds({ value: ethers.utils.parseEther("20") })
    })

    context("when amount is zero", () => {
      it("should revert", async () => {
        await expect(
          signerBondsUniswapV2.connect(other).swapSignerBondsOnUniswapV2(0)
        ).to.be.revertedWith("Amount is zero")
      })
    })

    context("when amount exceeds balance", () => {
      it("should revert", async () => {
        await expect(
          signerBondsUniswapV2
            .connect(other)
            .swapSignerBondsOnUniswapV2(ethers.utils.parseEther("21"))
        ).to.be.revertedWith("Amount exceeds balance")
      })
    })

    context("when price impact exceeds allowed limit", async () => {
      it("should revert", async () => {
        // Default max allowed price impact is 1%. Such price impact will
        // occur when 50 tokens will be bought (50/5000 = 0.01 = 1%). To
        // buy 50 tokens, we need 10 ETH (10 ETH * 5 = 50 tokens). To violate
        // the price impact limit, we need to buy tokens for more than 10 ETH.
        await expect(
          signerBondsUniswapV2
            .connect(other)
            .swapSignerBondsOnUniswapV2(ethers.utils.parseEther("10").add(1))
        ).to.be.revertedWith("Price impact exceeds allowed limit")
      })
    })

    // TODO: remaining cases
  })
})
