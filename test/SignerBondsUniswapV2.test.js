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
