const { expect } = require("chai")

const { resetFork } = require("../helpers/contract-test-helpers")

const describeFn =
  process.env.NODE_ENV === "system-test" ? describe : describe.skip

describeFn("System -- swap signer bonds on UniswapV2", () => {
  const startingBlock = 12521265
  const keepTokenAddress = "0x85Eee30c52B0b379b046Fb0F85F4f3Dc3009aFEC"
  const uniswapV2RouterAddress = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D"
  const tbtcTokenAddress = "0x8daebade922df735c38c80c7ebd708af50815faa"
  const tbtcDepositTokenAddress = "0x10b66bd1e3b5a936b7f8dbc5976004311037cdf0"
  const auctionLength = 86400 // 24h
  const bondAuctionThreshold = 75

  let tbtcToken
  let collateralToken
  let underwriterToken
  let assetPool
  let coveragePool
  let uniswapV2Router
  let signerBondsUniswapV2
  let riskManagerV1

  let governance
  let rewardsManager
  let thirdParty

  before(async () => {
    await resetFork(startingBlock)

    governance = await ethers.getSigner(0)
    rewardsManager = await ethers.getSigner(1)
    thirdParty = await ethers.getSigner(2)

    tbtcToken = await ethers.getContractAt("IERC20", tbtcTokenAddress)
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

    const Auction = await ethers.getContractFactory("Auction")
    const masterAuction = await Auction.deploy()
    await masterAuction.deployed()

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

    const RiskManagerV1 = await ethers.getContractFactory("RiskManagerV1")
    riskManagerV1 = await RiskManagerV1.deploy(
      tbtcToken.address,
      tbtcDepositTokenAddress,
      coveragePool.address,
      signerBondsUniswapV2.address,
      masterAuction.address,
      auctionLength,
      bondAuctionThreshold
    )
    await riskManagerV1.deployed()

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
        .swapSignerBonds(riskManagerV1.address, ethers.utils.parseEther("10"), {
          gasLimit: 200000,
        })
    })

    it(
      "should take the swapped amount from the risk manager " +
        "contract balance",
      async () => {
        await expect(tx).to.changeEtherBalance(
          riskManagerV1,
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
      await expect(parseInt(tx.gasLimit)).to.be.equal(200000)

      const txReceipt = await ethers.provider.getTransactionReceipt(tx.hash)
      await expect(parseInt(txReceipt.gasUsed)).to.be.lessThan(175000)
    })
  })
})
