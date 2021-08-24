const { expect } = require("chai")

describe("SignerBondsUniswapV2", () => {
  let governance
  let thirdParty
  let rewardsManager
  let swapper
  let riskManagerV1
  let signerBondsUniswapV2

  beforeEach(async () => {
    governance = await ethers.getSigner(0)
    thirdParty = await ethers.getSigner(1)
    rewardsManager = await ethers.getSigner(2)
    swapper = await ethers.getSigner(3)

    const UniswapV2RouterStub = await ethers.getContractFactory(
      "UniswapV2RouterStub"
    )
    const uniswapV2RouterStub = await UniswapV2RouterStub.deploy()
    await uniswapV2RouterStub.deployed()

    const TestToken = await ethers.getContractFactory("TestToken")
    const testToken = await TestToken.deploy()
    await testToken.deployed()

    const UnderwriterToken = await ethers.getContractFactory("UnderwriterToken")
    const underwriterToken = await UnderwriterToken.deploy(
      "Underwriter Token",
      "COV"
    )
    await underwriterToken.deployed()

    const AssetPool = await ethers.getContractFactory("AssetPool")
    const assetPool = await AssetPool.deploy(
      testToken.address,
      underwriterToken.address,
      rewardsManager.address
    )
    await assetPool.deployed()

    const CoveragePool = await ethers.getContractFactory("CoveragePool")
    const coveragePool = await CoveragePool.deploy(assetPool.address)
    await coveragePool.deployed()

    const SignerBondsUniswapV2 = await ethers.getContractFactory(
      "SignerBondsUniswapV2"
    )

    signerBondsUniswapV2 = await SignerBondsUniswapV2.deploy(
      uniswapV2RouterStub.address,
      coveragePool.address
    )
    await signerBondsUniswapV2.deployed()

    const fakeAddress = "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    const RiskManagerV1Stub = await ethers.getContractFactory(
      "RiskManagerV1Stub"
    )
    riskManagerV1 = await RiskManagerV1Stub.deploy(
      fakeAddress,
      fakeAddress,
      fakeAddress,
      signerBondsUniswapV2.address,
      fakeAddress,
      86400,
      75
    )
    await riskManagerV1.deployed()

    await governance.sendTransaction({
      to: riskManagerV1.address,
      value: ethers.utils.parseEther("20"),
    })
  })

  describe("maxAllowedPriceImpact", () => {
    context("when governance did not set max allowed price impact", () => {
      const defaultPriceImpact = 100
      it("should return the default value", async () => {
        expect(await signerBondsUniswapV2.maxAllowedPriceImpact()).to.be.equal(
          defaultPriceImpact
        )
      })
    })
  })

  describe("setMaxAllowedPriceImpact", () => {
    const maxAllowedPriceImpact = 10000

    context("when caller is not the governance", () => {
      it("should revert", async () => {
        await expect(
          signerBondsUniswapV2
            .connect(thirdParty)
            .setMaxAllowedPriceImpact(maxAllowedPriceImpact)
        ).to.be.revertedWith("Ownable: caller is not the owner")
      })
    })

    context("when max allowed price impact too high", () => {
      it("should revert", async () => {
        await expect(
          signerBondsUniswapV2
            .connect(governance)
            .setMaxAllowedPriceImpact(maxAllowedPriceImpact + 1)
        ).to.be.revertedWith("Maximum value is 10000 basis points")
      })
    })

    context("when max allowed price impact is in correct range", () => {
      const priceImpact = 500
      beforeEach(async () => {
        expect(
          await signerBondsUniswapV2
            .connect(governance)
            .setMaxAllowedPriceImpact(priceImpact)
        )
      })

      it("should set max allowed price impact", async () => {
        expect(await signerBondsUniswapV2.maxAllowedPriceImpact()).to.be.equal(
          priceImpact
        )
      })
    })
  })

  describe("slippageTolerance", () => {
    context("when governance did not set slippage tolerance", () => {
      const defaultSlippageTolerance = 50
      it("should return the default value", async () => {
        expect(await signerBondsUniswapV2.slippageTolerance()).to.be.equal(
          defaultSlippageTolerance
        )
      })
    })
  })

  describe("setSlippageTolerance", () => {
    const maxBasisPoints = 10000

    context("when caller is not the governance", () => {
      it("should revert", async () => {
        await expect(
          signerBondsUniswapV2
            .connect(thirdParty)
            .setSlippageTolerance(maxBasisPoints)
        ).to.be.revertedWith("Ownable: caller is not the owner")
      })
    })

    context("when slippage tolerance too high", () => {
      it("should revert", async () => {
        await expect(
          signerBondsUniswapV2
            .connect(governance)
            .setSlippageTolerance(maxBasisPoints + 1)
        ).to.be.revertedWith("Maximum value is 10000 basis points")
      })
    })

    context("when slippage tolerance is in correct range", () => {
      const priceImpact = 500
      beforeEach(async () => {
        expect(
          await signerBondsUniswapV2
            .connect(governance)
            .setSlippageTolerance(priceImpact)
        )
      })

      it("should set slippage tolerance", async () => {
        expect(await signerBondsUniswapV2.slippageTolerance()).to.be.equal(
          priceImpact
        )
      })
    })
  })

  describe("swapDeadline", () => {
    context("when governance did not set default swap deadline", () => {
      const defaultSwapDeadline = 20 * 60 // 20 min
      it("should return the default value", async () => {
        expect(await signerBondsUniswapV2.swapDeadline()).to.be.equal(
          defaultSwapDeadline
        )
      })
    })
  })

  describe("setSwapDeadline", () => {
    context("when caller is not the governance", () => {
      it("should revert", async () => {
        await expect(
          signerBondsUniswapV2.connect(thirdParty).setSwapDeadline(10 * 60) // 10 min
        ).to.be.revertedWith("Ownable: caller is not the owner")
      })
    })

    context("when governance set default swap deadline", () => {
      const swapDeadline = 100 * 60 // 100 min
      beforeEach(async () => {
        expect(
          await signerBondsUniswapV2
            .connect(governance)
            .setSwapDeadline(swapDeadline)
        )
      })

      it("should set swap deadline", async () => {
        expect(await signerBondsUniswapV2.swapDeadline()).to.be.equal(
          swapDeadline
        )
      })
    })
  })

  describe("revertIfAuctionOpen", () => {
    context(
      "when governance did not set value for the revert if auction open flag",
      () => {
        const defaultRevertIfAuctionOpen = true
        it("should return the default value", async () => {
          expect(await signerBondsUniswapV2.revertIfAuctionOpen()).to.be.equal(
            defaultRevertIfAuctionOpen
          )
        })
      }
    )
  })

  describe("setRevertIfAuctionOpen", () => {
    context("when caller is not the governance", () => {
      it("should revert", async () => {
        await expect(
          signerBondsUniswapV2.connect(thirdParty).setRevertIfAuctionOpen(false)
        ).to.be.revertedWith("Ownable: caller is not the owner")
      })
    })

    context("when governance sets revert flag on opened auction", () => {
      const revertIfAuctionOpen = false
      beforeEach(async () => {
        expect(
          await signerBondsUniswapV2
            .connect(governance)
            .setRevertIfAuctionOpen(revertIfAuctionOpen)
        )
      })

      it("should set the revert flag to false", async () => {
        expect(await signerBondsUniswapV2.revertIfAuctionOpen()).to.be.equal(
          revertIfAuctionOpen
        )
      })
    })
  })

  describe("approveSwapper", () => {
    context("when caller is not the governance", () => {
      it("should revert", async () => {
        await expect(
          signerBondsUniswapV2
            .connect(thirdParty)
            .approveSwapper(swapper.address)
        ).to.be.revertedWith("Ownable: caller is not the owner")
      })
    })

    context("when caller is the governance", () => {
      let tx
      beforeEach(async () => {
        tx = await signerBondsUniswapV2
          .connect(governance)
          .approveSwapper(swapper.address)
      })

      it("should approve the swapper", async () => {
        expect(await signerBondsUniswapV2.approvedSwappers(swapper.address)).to
          .be.true
      })

      it("should emit SignerBondsSwapperApproved event", async () => {
        await expect(tx)
          .to.emit(signerBondsUniswapV2, "SignerBondsSwapperApproved")
          .withArgs(swapper.address)
      })

      it("should revert in case the swapper is already approved", async () => {
        await expect(
          signerBondsUniswapV2
            .connect(governance)
            .approveSwapper(swapper.address)
        ).to.be.revertedWith("Signer bonds swapper has been already approved")
      })
    })
  })

  describe("unapproveSwapper", () => {
    context("when caller is not the governance", () => {
      it("should revert", async () => {
        await expect(
          signerBondsUniswapV2
            .connect(thirdParty)
            .unapproveSwapper(swapper.address)
        ).to.be.revertedWith("Ownable: caller is not the owner")
      })
    })

    context("when swapper is not approved", () => {
      it("should revert", async () => {
        await expect(
          signerBondsUniswapV2
            .connect(governance)
            .unapproveSwapper(swapper.address)
        ).to.be.revertedWith("Signer bonds swapper is not approved")
      })
    })

    context("when caller is governance and swapper approved", () => {
      let tx
      beforeEach(async () => {
        await signerBondsUniswapV2
          .connect(governance)
          .approveSwapper(swapper.address)

        tx = await signerBondsUniswapV2
          .connect(governance)
          .unapproveSwapper(swapper.address)
      })

      it("should unapprove the swapper", async () => {
        expect(await signerBondsUniswapV2.approvedSwappers(swapper.address)).to
          .be.false
      })

      it("should emit SignerBondsSwapperUnapproved event", async () => {
        await expect(tx)
          .to.emit(signerBondsUniswapV2, "SignerBondsSwapperUnapproved")
          .withArgs(swapper.address)
      })
    })
  })

  describe("swapSignerBondsOnUniswapV2", () => {
    context("when swapper is not approved", () => {
      it("should revert", async () => {
        await expect(
          signerBondsUniswapV2
            .connect(thirdParty)
            .swapSignerBondsOnUniswapV2(riskManagerV1.address, 123)
        ).to.be.revertedWith("Signer bonds swapper not approved")
      })
    })
  })
})
