const { expect } = require("chai")

const { resetFork } = require("../helpers/contract-test-helpers")
const { initContracts } = require("./init-contracts")

const describeFn =
  process.env.NODE_ENV === "system-test" ? describe : describe.skip

describeFn("System -- swap signer bonds on UniswapV2", () => {
  const startingBlock = 12521265
  let collateralToken
  let underwriterToken
  let assetPool
  let coveragePool
  let signerBondsUniswapV2
  let riskManagerV1

  let thirdParty

  before(async () => {
    await resetFork(startingBlock)

    const governance = await ethers.getSigner(0)

    const contracts = await initContracts()
    collateralToken = contracts.collateralToken
    underwriterToken = contracts.underwriterToken
    assetPool = contracts.assetPool
    coveragePool = contracts.coveragePool
    signerBondsUniswapV2 = contracts.signerBondsUniswapV2
    thirdParty = contracts.thirdPartyAccount

    await underwriterToken
      .connect(governance)
      .transferOwnership(assetPool.address)

    await assetPool.connect(governance).transferOwnership(coveragePool.address)

    // Simulate that risk manager deposits signer bonds on the Uniswap strategy.
    // await signerBondsUniswapV2
    //   .connect(riskManager)
    //   .swapSignerBonds({ value: ethers.utils.parseEther("20") })

    // Simulate that risk manager has withdrawable signer bonds.
    await governance.sendTransaction({
      to: riskManagerV1.address,
      value: ethers.utils.parseEther("20"),
    })
  })

  describe("test initial state", () => {
    describe("asset pool", () => {
      it("should not have any collateral tokens", async () => {
        expect(await collateralToken.balanceOf(assetPool.address)).to.equal(0)
      })
    })

    describe("risk manager", () => {
      it("should have the signer bonds deposited", async () => {
        const balance = await (
          await ethers.getSigner(riskManagerV1.address)
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
        .swapSignerBondsOnUniswapV2(
          riskManagerV1.address,
          ethers.utils.parseEther("10"),
          {
            gasLimit: 200000,
          }
        )
    })

    it("should take the swapped amount from the risk manager contract balance", async () => {
      await expect(tx).to.changeEtherBalance(
        riskManagerV1,
        ethers.utils.parseEther("-10")
      )
    })

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
      await expect(parseInt(tx.gasLimit)).to.be.equal(200000)

      const txReceipt = await ethers.provider.getTransactionReceipt(tx.hash)
      await expect(parseInt(txReceipt.gasUsed)).to.be.lessThan(175000)
    })
  })
})
