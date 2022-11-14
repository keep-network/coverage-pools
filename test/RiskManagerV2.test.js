const chai = require("chai")
const expect = chai.expect
const hre = require("hardhat")
const {
  increaseTime,
  ZERO_ADDRESS,
} = require("./helpers/contract-test-helpers")
const { getNamedAccounts } = hre

const { ethers } = require("hardhat")

describe("RiskManagerV2", () => {
  let tbtcToken
  let riskManagerV2
  let coveragePoolStub
  let tCommunityMultiSig
  let tCommunityMultiSigSigner
  let newTCommunityMultisig

  let RiskManagerV2

  beforeEach(async () => {
    owner = await ethers.getSigner(0)
    thirdParty = await ethers.getSigner(1)
    bidder = await ethers.getSigner(2)
    newTCommunityMultisig = await ethers.getSigner(3)
    const namedAccounts = await getNamedAccounts()

    tCommunityMultiSig = namedAccounts.tCommunityMultiSig
    tCommunityMultiSigSigner = await ethers.getSigner(tCommunityMultiSig)

    const TestToken = await ethers.getContractFactory("TestToken")
    tbtcToken = await TestToken.deploy()
    await tbtcToken.deployed()

    const Auction = await ethers.getContractFactory("Auction")
    const CoveragePoolStub = await ethers.getContractFactory("CoveragePoolStub")
    coveragePoolStub = await CoveragePoolStub.deploy()
    await coveragePoolStub.deployed()

    masterAuction = await Auction.deploy()
    await masterAuction.deployed()

    RiskManagerV2 = await ethers.getContractFactory("RiskManagerV2")
    riskManagerV2 = await RiskManagerV2.deploy(
      tbtcToken.address,
      coveragePoolStub.address,
      masterAuction.address,
      tCommunityMultiSig
    )
    await riskManagerV2.deployed()
  })

  describe("RiskManagerV2 constructor", () => {
    context("when passing a zero address for TBTC token", () => {
      it("should revert", async () => {
        await expect(
          RiskManagerV2.deploy(
            ZERO_ADDRESS,
            coveragePoolStub.address,
            masterAuction.address,
            tCommunityMultiSig
          )
        ).to.be.revertedWith("TBTC Token cannot be zero address")
      })
    })

    context("when passing a zero address for council multisig", () => {
      it("should revert", async () => {
        await expect(
          RiskManagerV2.deploy(
            tbtcToken.address,
            coveragePoolStub.address,
            masterAuction.address,
            ZERO_ADDRESS
          )
        ).to.be.revertedWith("Council multisig cannot be zero address")
      })
    })
  })

  describe("claimCoverage", () => {
    context("when a caller is not council multisig", () => {
      it("should revert", async () => {
        await expect(riskManagerV2.claimCoverage(42)).to.be.revertedWith(
          "Caller is not the council multisig"
        )
      })
    })

    context("when a caller is a council multisig", () => {
      it("should claim coverage on the coverage pool", async () => {
        const tx = await riskManagerV2
          .connect(tCommunityMultiSigSigner)
          .claimCoverage(42)

        await expect(tx)
          .to.emit(coveragePoolStub, "FundsSeized")
          .withArgs(tCommunityMultiSig, 42)
      })
    })
  })

  describe("beginCouncilMultisigUpdate", () => {
    context("when the caller is the owner", () => {
      let tx

      beforeEach(async () => {
        tx = await riskManagerV2
          .connect(owner)
          .beginCouncilMultisigUpdate(newTCommunityMultisig.address)
      })

      it("should not update the council multisig", async () => {
        expect(await riskManagerV2.councilMultisig()).to.be.equal(
          tCommunityMultiSig
        )
      })

      it("should start the governance delay timer", async () => {
        expect(
          await riskManagerV2.getRemainingCouncilMultisigUpdateTime()
        ).to.be.equal(43200) // 12h contract governance delay
      })

      it("should emit the CouncilMultisigStarted event", async () => {
        const blockTimestamp = (await ethers.provider.getBlock(tx.blockNumber))
          .timestamp
        await expect(tx)
          .to.emit(riskManagerV2, "CouncilMultisigStarted")
          .withArgs(newTCommunityMultisig.address, blockTimestamp)
      })
    })

    context("when the caller is not the owner", () => {
      it("should revert", async () => {
        await expect(
          riskManagerV2
            .connect(thirdParty)
            .beginCouncilMultisigUpdate(newTCommunityMultisig.address)
        ).to.be.revertedWith("Ownable: caller is not the owner")
      })
    })
  })

  describe("finalizeCouncilMultisigUpdate", () => {
    context(
      "when the update process is initialized, governance delay passed, " +
        "and the caller is the owner",
      () => {
        let tx

        beforeEach(async () => {
          await riskManagerV2
            .connect(owner)
            .beginCouncilMultisigUpdate(newTCommunityMultisig.address)

          await increaseTime(43200) // +12h contract governance delay

          tx = await riskManagerV2
            .connect(owner)
            .finalizeCouncilMultisigUpdate()
        })

        it("should update the council multisig", async () => {
          expect(await riskManagerV2.councilMultisig()).to.be.equal(
            newTCommunityMultisig.address
          )
        })

        it("should emit CouncilMultisigUpdated event", async () => {
          await expect(tx)
            .to.emit(riskManagerV2, "CouncilMultisigUpdated")
            .withArgs(newTCommunityMultisig.address)
        })

        it("should reset the governance delay timer", async () => {
          await expect(
            riskManagerV2.getRemainingCouncilMultisigUpdateTime()
          ).to.be.revertedWith("Change not initiated")
        })
      }
    )

    context("when the governance delay has not passed", () => {
      it("should revert", async () => {
        await riskManagerV2
          .connect(owner)
          .beginCouncilMultisigUpdate(newTCommunityMultisig.address)

        await increaseTime(39600) // +11h

        await expect(
          riskManagerV2.connect(owner).finalizeCouncilMultisigUpdate()
        ).to.be.revertedWith("Governance delay has not elapsed")
      })
    })

    context("when the caller is not the owner", () => {
      it("should revert", async () => {
        await expect(
          riskManagerV2.connect(thirdParty).finalizeCouncilMultisigUpdate()
        ).to.be.revertedWith("Ownable: caller is not the owner")
      })
    })

    context("when the update process is not initialized", () => {
      it("should revert", async () => {
        await expect(
          riskManagerV2.connect(owner).finalizeCouncilMultisigUpdate()
        ).to.be.revertedWith("Change not initiated")
      })
    })
  })
})
