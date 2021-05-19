const chai = require("chai")
const expect = chai.expect

const { ZERO_ADDRESS } = require("./helpers/contract-test-helpers")

describe("SignerBondsEscrow", () => {
  let governance
  let riskManager
  let signerBondsEscrow

  beforeEach(async () => {
    governance = await ethers.getSigner(0)
    riskManager = await ethers.getSigner(1)

    const SignerBondsEscrow = await ethers.getContractFactory(
      "SignerBondsEscrow"
    )
    signerBondsEscrow = await SignerBondsEscrow.deploy()
    await signerBondsEscrow.deployed()
  })

  describe("swapSignerBonds", () => {
    let tx

    beforeEach(async () => {
      tx = await signerBondsEscrow
        .connect(riskManager)
        .swapSignerBonds({ value: ethers.utils.parseEther("10") })
    })

    it("should add the processed signer bonds to the contract balance", async () => {
      await expect(tx).to.changeEtherBalance(
        signerBondsEscrow,
        ethers.utils.parseEther("10")
      )
    })
  })

  describe("withdraw", () => {
    context(
      "when the caller is the governance, target address is non-zero, " +
        "and there are available funds",
      () => {
        let tx

        beforeEach(async () => {
          await signerBondsEscrow
            .connect(riskManager)
            .swapSignerBonds({ value: ethers.utils.parseEther("10") })

          tx = await signerBondsEscrow
            .connect(governance)
            .withdraw(riskManager.address)
        })

        it("transfer all funds to the target account", async () => {
          await expect(tx).to.changeEtherBalance(
            signerBondsEscrow,
            ethers.utils.parseEther("10").mul(-1)
          )
          await expect(tx).to.changeEtherBalance(
            riskManager,
            ethers.utils.parseEther("10")
          )
        })
      }
    )

    context("when the caller is not the governance", () => {
      it("should revert", async () => {
        await expect(
          signerBondsEscrow.connect(riskManager).withdraw(riskManager.address)
        ).to.be.revertedWith("Ownable: caller is not the governance")
      })
    })

    context("when the target address is zero", () => {
      it("should revert", async () => {
        await expect(
          signerBondsEscrow.connect(governance).withdraw(ZERO_ADDRESS)
        ).to.be.revertedWith("Invalid target address")
      })
    })

    context("when there are no available funds", () => {
      it("should not transfer any funds", async () => {
        const tx = await signerBondsEscrow
          .connect(governance)
          .withdraw(riskManager.address)
        await expect(tx).to.changeEtherBalance(signerBondsEscrow, 0)
        await expect(tx).to.changeEtherBalance(riskManager, 0)
      })
    })
  })
})
