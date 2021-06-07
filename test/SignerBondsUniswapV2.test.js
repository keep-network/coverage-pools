const chai = require("chai")
const expect = chai.expect
const { BigNumber } = ethers
const { deployMockContract } = require("@ethereum-waffle/mock-contract")
const { to1e18, lastBlockTime } = require("./helpers/contract-test-helpers")
const CoveragePool = require("../artifacts/contracts/CoveragePool.sol/CoveragePool.json")
const IUniswapV2Pair = require("../artifacts/contracts/SignerBondsUniswapV2.sol/IUniswapV2Pair.json")
const Auctioneer = require("../artifacts/contracts/Auctioneer.sol/Auctioneer.json")

describe("SignerBondsUniswapV2", () => {
  let governance
  let riskManager
  let other
  let uniswapV2RouterStub
  let mockUniswapV2Pair
  let mockCoveragePool
  let mockAuctioneer
  let signerBondsUniswapV2

  const assetPoolAddress = "0x6e7278c99ac5314e53a3E95b2343D4C57FD46159"
  // Real KEEP token mainnet address in order to get a verifiable pair address.
  const collateralTokenAddress = "0x85Eee30c52B0b379b046Fb0F85F4f3Dc3009aFEC"

  beforeEach(async () => {
    governance = await ethers.getSigner(0)
    riskManager = await ethers.getSigner(1)
    other = await ethers.getSigner(2)

    const UniswapV2RouterStub = await ethers.getContractFactory(
      "UniswapV2RouterStub"
    )
    uniswapV2RouterStub = await UniswapV2RouterStub.deploy()
    await uniswapV2RouterStub.deployed()

    mockUniswapV2Pair = await deployMockContract(governance, IUniswapV2Pair.abi)

    mockCoveragePool = await deployMockContract(governance, CoveragePool.abi)
    await mockCoveragePool.mock.assetPool.returns(assetPoolAddress)
    await mockCoveragePool.mock.collateralToken.returns(collateralTokenAddress)

    mockAuctioneer = await deployMockContract(governance, Auctioneer.abi)

    const SignerBondsUniswapV2 = await ethers.getContractFactory(
      "SignerBondsUniswapV2Stub"
    )
    signerBondsUniswapV2 = await SignerBondsUniswapV2.deploy(
      uniswapV2RouterStub.address,
      mockCoveragePool.address,
      mockAuctioneer.address
    )
    await signerBondsUniswapV2.deployed()

    // SignerBondsUniswapV2 has to point to the deployed UniswapV2Pair mock
    // instance to make tests work. However, before setting the new value
    // via the stub, assert the initial value is correct and the pair
    // address computing logic works well.
    expect(await signerBondsUniswapV2.uniswapPair()).to.be.equal(
      // address of real KEEP/ETH LP pool
      "0xE6f19dAb7d43317344282F803f8E8d240708174a"
    )
    await signerBondsUniswapV2.setUniswapPair(mockUniswapV2Pair.address)
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

  describe("setMaxAllowedPriceImpact", () => {
    context("when the caller is not the governance", () => {
      it("should revert", async () => {
        await expect(
          signerBondsUniswapV2.connect(other).setMaxAllowedPriceImpact("150")
        ).to.be.revertedWith("Ownable: caller is not the owner")
      })
    })

    context("when called with value bigger than max", () => {
      it("should revert", async () => {
        await expect(
          signerBondsUniswapV2
            .connect(governance)
            .setMaxAllowedPriceImpact("10001")
        ).to.be.revertedWith("Maximum value is 10000 basis points")
      })
    })

    context("when the caller is the governance", () => {
      it("should set max allowed price impact parameter", async () => {
        await signerBondsUniswapV2
          .connect(governance)
          .setMaxAllowedPriceImpact("150")
        expect(await signerBondsUniswapV2.maxAllowedPriceImpact()).to.be.equal(
          "150"
        )
      })
    })
  })

  describe("setSlippageTolerance", () => {
    context("when the caller is not the governance", () => {
      it("should revert", async () => {
        await expect(
          signerBondsUniswapV2.connect(other).setSlippageTolerance("100")
        ).to.be.revertedWith("Ownable: caller is not the owner")
      })
    })

    context("when called with value bigger than max", () => {
      it("should revert", async () => {
        await expect(
          signerBondsUniswapV2.connect(governance).setSlippageTolerance("10001")
        ).to.be.revertedWith("Maximum value is 10000 basis points")
      })
    })

    context("when the caller is the governance", () => {
      it("should set slippage tolerance parameter", async () => {
        await signerBondsUniswapV2
          .connect(governance)
          .setSlippageTolerance("100")
        expect(await signerBondsUniswapV2.slippageTolerance()).to.be.equal(
          "100"
        )
      })
    })
  })

  describe("setSwapDeadline", () => {
    context("when the caller is not the governance", () => {
      it("should revert", async () => {
        await expect(
          signerBondsUniswapV2.connect(other).setSwapDeadline("2400")
        ).to.be.revertedWith("Ownable: caller is not the owner")
      })
    })

    context("when the caller is the governance", () => {
      it("should set slippage tolerance parameter", async () => {
        await signerBondsUniswapV2.connect(governance).setSwapDeadline("2400")
        expect(await signerBondsUniswapV2.swapDeadline()).to.be.equal("2400")
      })
    })
  })

  describe("setOpenAuctionsCheck", () => {
    context("when the caller is not the governance", () => {
      it("should revert", async () => {
        await expect(
          signerBondsUniswapV2.connect(other).setOpenAuctionsCheck(false)
        ).to.be.revertedWith("Ownable: caller is not the owner")
      })
    })

    context("when the caller is the governance", () => {
      it("should set the open auctions chec parameter", async () => {
        await signerBondsUniswapV2
          .connect(governance)
          .setOpenAuctionsCheck(false)
        expect(await signerBondsUniswapV2.openAuctionsCheck()).to.be.equal(
          false
        )
      })
    })
  })

  describe("swapSignerBondsOnUniswapV2", () => {
    const ethReserves = 1000
    const tokenReserves = 5000
    const exchangeRate = 5 // because one can get 5 tokens for every 1 ETH

    beforeEach(async () => {
      await mockAuctioneer.mock.openAuctionsCount.returns(0)

      await signerBondsUniswapV2.connect(governance).setOpenAuctionsCheck(false)

      await mockUniswapV2Pair.mock.getReserves.returns(
        // Real KEEP token address is smaller than WETH address so
        // token reserves should be set as reserve0.
        to1e18(tokenReserves),
        to1e18(ethReserves),
        await lastBlockTime()
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
        ).to.be.revertedWith("Amount must be greater than 0")
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

    context("when there are open auctions", () => {
      beforeEach(async () => {
        await mockAuctioneer.mock.openAuctionsCount.returns(1)
      })

      context("when the open auction check is enabled", () => {
        it("should revert", async () => {
          await signerBondsUniswapV2
            .connect(governance)
            .setOpenAuctionsCheck(true)

          await expect(
            signerBondsUniswapV2
              .connect(other)
              .swapSignerBondsOnUniswapV2(ethers.utils.parseEther("10"))
          ).to.be.revertedWith("There are open auctions")
        })
      })

      context("when the open auction check is disabled", () => {
        it("should not revert", async () => {
          // Check is disabled by default in the upstream `beforeEach` hook.

          await expect(
            signerBondsUniswapV2
              .connect(other)
              .swapSignerBondsOnUniswapV2(ethers.utils.parseEther("10"))
          ).not.to.be.reverted
        })
      })
    })

    context("when price impact exceeds allowed limit", () => {
      it("should revert", async () => {
        // Default max allowed price impact is 1%. Such a price impact will
        // occur when 50 tokens will be bought (50/5000 = 0.01 = 1%). To
        // get 50 tokens, we need 10 ETH (10 ETH * 5 = 50 tokens) + 0.3% fee.
        // In result, we need to buy tokens for more than 10.03 ETH to violate
        // the price impact limit.
        await expect(
          signerBondsUniswapV2
            .connect(other)
            .swapSignerBondsOnUniswapV2(ethers.utils.parseEther("10.031"))
        ).to.be.revertedWith("Price impact exceeds allowed limit")
      })
    })

    context("when amount and price impact are correct", () => {
      let tx

      beforeEach(async () => {
        await mockAuctioneer.mock.openAuctionsCount.returns(0)

        tx = await signerBondsUniswapV2
          .connect(other)
          .swapSignerBondsOnUniswapV2(ethers.utils.parseEther("5"))
      })

      it("should swap exact ETH for tokens on Uniswap", async () => {
        await expect(tx).to.changeEtherBalance(
          signerBondsUniswapV2,
          ethers.utils.parseEther("-5")
        )

        await expect(tx)
          .to.emit(uniswapV2RouterStub, "SwapExactETHForTokensExecuted")
          .withArgs(
            // Result of getAmountsOut (includes 0.3% fee) with default slippage
            // tolerance (0.5%) included.
            // In this case its (5*1e18 * 5 * 99.7%) * 99.5%
            "24800375000000000000",
            // First component is WETH and second is collateral token.
            [
              "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
              collateralTokenAddress,
            ],
            // Asset pool should be the recipient.
            assetPoolAddress,
            // Block time plus default deadline value (20 min).
            BigNumber.from(await lastBlockTime()).add(1200)
          )
      })

      it("should emit UniswapV2SwapExecuted event", async () => {
        await expect(tx)
          .to.emit(signerBondsUniswapV2, "UniswapV2SwapExecuted")
          .withArgs([
            "5000000000000000000", // ETH -> WETH
            "24925000000000000000", // WETH -> COLLATERAL TOKEN with 0.3% fee included
          ])
      })
    })
  })
})
