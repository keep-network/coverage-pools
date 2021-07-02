const chai = require("chai")
const expect = chai.expect

const { ZERO_ADDRESS } = require("./helpers/contract-test-helpers")

describe("SignerBondsManualSwap", () => {
  let governance
  let recipient
  let signerBondsManualSwap
  let riskManagerV1

  beforeEach(async () => {
    governance = (await ethers.getSigners())[0]
    recipient = (await ethers.getSigners())[1]

    const SignerBondsManualSwap = await ethers.getContractFactory(
      "SignerBondsManualSwap"
    )
    signerBondsManualSwap = await SignerBondsManualSwap.deploy()
    await signerBondsManualSwap.deployed()

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
      signerBondsManualSwap.address,
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

  describe("withdrawSignerBonds", () => {
    context(
      "when the caller is the governance, recipient address is non-zero, " +
        "and amount is correct",
      () => {
        let tx

        beforeEach(async () => {
          tx = await signerBondsManualSwap
            .connect(governance)
            .withdrawSignerBonds(
              riskManagerV1.address,
              ethers.utils.parseEther("10"),
              recipient.address
            )
        })

        it("transfer all funds to the recipient account", async () => {
          await expect(tx).to.changeEtherBalance(
            riskManagerV1,
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
          signerBondsManualSwap
            .connect(recipient)
            .withdrawSignerBonds(
              riskManagerV1.address,
              ethers.utils.parseEther("10"),
              recipient.address
            )
        ).to.be.revertedWith("Ownable: caller is not the owner")
      })
    })

    context("when amount is zero", () => {
      it("should revert", async () => {
        await expect(
          signerBondsManualSwap
            .connect(governance)
            .withdrawSignerBonds(riskManagerV1.address, 0, recipient.address)
        ).to.be.revertedWith("Amount must be greater than 0")
      })
    })

    context("when amount exceeds the risk manager balance", () => {
      it("should revert", async () => {
        await expect(
          signerBondsManualSwap
            .connect(governance)
            .withdrawSignerBonds(
              riskManagerV1.address,
              ethers.utils.parseEther("25"),
              recipient.address
            )
        ).to.be.revertedWith("Amount exceeds risk manager balance")
      })
    })

    context("when the recipient address is zero", () => {
      it("should revert", async () => {
        await expect(
          signerBondsManualSwap
            .connect(governance)
            .withdrawSignerBonds(
              riskManagerV1.address,
              ethers.utils.parseEther("10"),
              ZERO_ADDRESS
            )
        ).to.be.revertedWith("Invalid recipient address")
      })
    })
  })
})
