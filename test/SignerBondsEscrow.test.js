const chai = require("chai")
const expect = chai.expect

const { ZERO_ADDRESS } = require("./helpers/contract-test-helpers")

describe("SignerBondsEscrow", () => {
  let governance
  let recipient
  let signerBondsEscrow
  let riskManagerV1

  beforeEach(async () => {
    governance = await ethers.getSigner(0)
    recipient = await ethers.getSigner(1)

    const SignerBondsEscrow = await ethers.getContractFactory(
      "SignerBondsEscrow"
    )
    signerBondsEscrow = await SignerBondsEscrow.deploy()
    await signerBondsEscrow.deployed()

    // We must use a contract where `withdrawSignerBonds` method exists and
    // sends real funds to the strategy contract. Constructor parameters
    // are not relevant at all.
    const fakeAddress = "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    const RiskManagerV1Stub = await ethers.getContractFactory(
      "RiskManagerV1Stub"
    )
    riskManagerV1 = await RiskManagerV1Stub.deploy(
      fakeAddress,
      fakeAddress,
      fakeAddress,
      signerBondsEscrow.address,
      fakeAddress,
      86400,
      75
    )
    await riskManagerV1.deployed()

    // Simulate that risk manager has withdrawable signer bonds.
    await governance.sendTransaction({
      to: riskManagerV1.address,
      value: ethers.utils.parseEther("20"),
    })
  })

  describe("swapSignerBonds", () => {
    let tx

    beforeEach(async () => {
      tx = await signerBondsEscrow
        .connect(governance)
        .swapSignerBonds(riskManagerV1.address, ethers.utils.parseEther("10"))
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
            .connect(governance)
            .swapSignerBonds(
              riskManagerV1.address,
              ethers.utils.parseEther("10")
            )

          tx = await signerBondsEscrow
            .connect(governance)
            .withdraw(recipient.address)
        })

        it("transfer all funds to the recipient account", async () => {
          await expect(tx).to.changeEtherBalance(
            signerBondsEscrow,
            ethers.utils.parseEther("10").mul(-1)
          )
          await expect(tx).to.changeEtherBalance(
            recipient,
            ethers.utils.parseEther("10")
          )
        })
      }
    )

    context("when the caller is not the governance", () => {
      it("should revert", async () => {
        await expect(
          signerBondsEscrow.connect(recipient).withdraw(recipient.address)
        ).to.be.revertedWith("Ownable: caller is not the owner")
      })
    })

    context("when the target address is zero", () => {
      it("should revert", async () => {
        await expect(
          signerBondsEscrow.connect(governance).withdraw(ZERO_ADDRESS)
        ).to.be.revertedWith("Invalid recipient address")
      })
    })

    context("when there are no available funds", () => {
      it("should not transfer any funds", async () => {
        const tx = await signerBondsEscrow
          .connect(governance)
          .withdraw(recipient.address)
        await expect(tx).to.changeEtherBalance(signerBondsEscrow, 0)
        await expect(tx).to.changeEtherBalance(recipient, 0)
      })
    })
  })
})
