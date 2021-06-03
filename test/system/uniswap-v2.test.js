const { expect } = require("chai")

const { resetFork } = require("../helpers/contract-test-helpers")

const describeFn =
  process.env.NODE_ENV === "system-test" ? describe : describe.skip

describeFn("System -- swap signer bonds on UniswapV2", () => {
  const startingBlock = 12521265
  const keepTokenAddress = "0x85Eee30c52B0b379b046Fb0F85F4f3Dc3009aFEC"
  const uniswapV2RouterAddress = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D"

  let collateralToken
  let underwriterToken
  let assetPool
  let coveragePool
  let uniswapV2Router
  let signerBondsUniswapV2

  let governance
  let rewardsManager
  let riskManager
  let thirdParty

  before(async () => {
    await resetFork(startingBlock)

    governance = await ethers.getSigner(0)
    rewardsManager = await ethers.getSigner(1)
    riskManager = await ethers.getSigner(2)
    thirdParty = await ethers.getSigner(3)

    collateralToken = await ethers.getContractAt("IERC20", keepTokenAddress)

    const UnderwriterToken = await ethers.getContractFactory("UnderwriterToken")
    underwriterToken = await UnderwriterToken.deploy("Coverage KEEP", "covKEEP")
    await underwriterToken.deployed()

    const AssetPool = await ethers.getContractFactory("AssetPool")
    assetPool = await AssetPool.deploy(
      collateralToken.address,
      underwriterToken.address,
      rewardsManager.address
    )
    await assetPool.deployed()
    await underwriterToken
      .connect(governance)
      .transferOwnership(assetPool.address)

    const CoveragePool = await ethers.getContractFactory("CoveragePool")
    coveragePool = await CoveragePool.deploy(assetPool.address)
    await coveragePool.deployed()
    await assetPool.connect(governance).transferOwnership(coveragePool.address)

    uniswapV2Router = await ethers.getContractAt(
      "IUniswapV2Router",
      uniswapV2RouterAddress
    )

    const SignerBondsUniswapV2 = await ethers.getContractFactory(
      "SignerBondsUniswapV2"
    )
    signerBondsUniswapV2 = await SignerBondsUniswapV2.deploy(
      uniswapV2Router.address,
      coveragePool.address
    )
    await signerBondsUniswapV2.deployed()

    // Simulate that risk manager deposits signer bonds on the Uniswap strategy.
    await signerBondsUniswapV2
      .connect(riskManager)
      .swapSignerBonds({ value: ethers.utils.parseEther("20") })
  })

  describe("test initial state", () => {
    describe("asset pool", () => {
      it("should not have any collateral tokens", async () => {
        expect(await collateralToken.balanceOf(assetPool.address)).to.equal(0)
      })
    })

    describe("swap strategy", () => {
      it("should have the signer bonds deposited", async () => {
        const balance = await (
          await ethers.getSigner(signerBondsUniswapV2.address)
        ).getBalance()

        expect(balance).to.equal(ethers.utils.parseEther("20"))
      })
    })
  })

  describe("when signer bonds are swapped on UniswapV2", () => {
    let tx

    before(async () => {
      tx = await signerBondsUniswapV2
        .connect(thirdParty)
        .swapSignerBondsOnUniswapV2(ethers.utils.parseEther("10"))
    })

    it(
      "should take the swapped amount from the swap strategy " +
        "contract balance",
      async () => {
        await expect(tx).to.changeEtherBalance(
          signerBondsUniswapV2,
          ethers.utils.parseEther("-10")
        )
      }
    )

    it("should send acquired tokens to the asset pool", async () => {
      // WETH_in = 10000000000000000000 (10 ETH)
      // WETH_in_with_fee = 9970000000000000000 (WETH_in * 99.7%)
      // WETH_reserve = 1196274582417900623439 (1196 WETH)
      // KEEP_reserve = 10799279239931490639501248 (10799279 KEEP)
      //
      // To calculate the KEEP output amount we must do:
      // WETH_in_with_fee * KEEP_reserve / (WETH_reserve + WETH_in_with_fee)
      // which equals to 89259521320540407673397 (89259 KEEP). The exact amount
      // is obtained because there is no slippage in test environment.
      expect(await collateralToken.balanceOf(assetPool.address)).to.equal(
        "89259521320540407673397"
      )
    })

    it("should emit UniswapV2SwapExecuted event", async () => {
      await expect(tx)
        .to.emit(signerBondsUniswapV2, "UniswapV2SwapExecuted")
        .withArgs([
          "10000000000000000000", // ETH -> WETH
          "89259521320540407673397", // WETH -> KEEP
        ])
    })

    it("should consume a reasonable amount of gas", async () => {
      await expect(parseInt(tx.gasLimit)).to.be.lessThan(11472000)

      const txReceipt = await ethers.provider.getTransactionReceipt(tx.hash)
      await expect(parseInt(txReceipt.gasUsed)).to.be.lessThan(156000)
    })
  })
})
