const { expect } = require("chai")
const { ethers } = require("hardhat")
const { to1e18, ZERO_ADDRESS } = require("./helpers/contract-test-helpers")

describe("BatchedPhasedEscrow", () => {
  let owner
  let tokenHolder
  let drawee
  let updatedOwner
  let updatedDrawee

  let token
  let batchedPhasedEscrow

  let beneficiary1
  let beneficiary2
  let beneficiary3

  beforeEach(async () => {
    owner = await ethers.getSigner(0)
    tokenHolder = await ethers.getSigner(1)
    drawee = await ethers.getSigner(2)
    updatedOwner = await ethers.getSigner(3)
    updatedDrawee = await ethers.getSigner(4)

    const T = await ethers.getContractFactory("T")
    token = await T.deploy()
    await token.deployed()

    await token.connect(owner).mint(tokenHolder.address, to1e18(100000))

    const BatchedPhasedEscrow = await ethers.getContractFactory(
      "BatchedPhasedEscrow"
    )
    batchedPhasedEscrow = await BatchedPhasedEscrow.deploy(token.address)
    await batchedPhasedEscrow.deployed()

    const TestSimpleBeneficiary = await ethers.getContractFactory(
      "TestSimpleBeneficiary"
    )
    beneficiary1 = await TestSimpleBeneficiary.deploy()
    beneficiary2 = await TestSimpleBeneficiary.deploy()
    beneficiary3 = await TestSimpleBeneficiary.deploy()

    await beneficiary1.deployed()
    await beneficiary2.deployed()
    await beneficiary3.deployed()
  })

  describe("receiveApproval", async () => {
    it("fails for an unknown token", async () => {
      // It is another T contract deployment, not the one PhasedEscrow was
      // created with.
      const T = await ethers.getContractFactory("T")
      const unknownToken = await T.deploy()
      await unknownToken.deployed()

      await expect(
        unknownToken
          .connect(tokenHolder)
          .approveAndCall(batchedPhasedEscrow.address, 9991, "0x00")
      ).to.be.revertedWith("Unsupported token")
    })

    it("transfers all approved tokens", async () => {
      const amountApproved = 9993
      await token
        .connect(tokenHolder)
        .approveAndCall(batchedPhasedEscrow.address, amountApproved, "0x00")

      const actualBalance = await token.balanceOf(batchedPhasedEscrow.address)
      expect(actualBalance).to.eq(amountApproved)
    })
  })

  describe("beneficiary approval", async () => {
    it("can be done by owner", async () => {
      await batchedPhasedEscrow
        .connect(owner)
        .approveBeneficiary(beneficiary1.address)
      // ok, no revert
    })

    it("can be done by updated owner", async () => {
      await batchedPhasedEscrow
        .connect(owner)
        .transferOwnership(updatedOwner.address)

      await expect(
        batchedPhasedEscrow
          .connect(owner)
          .approveBeneficiary(beneficiary1.address)
      ).to.be.revertedWith("Ownable: caller is not the owner")
      await batchedPhasedEscrow
        .connect(updatedOwner)
        .approveBeneficiary(beneficiary1.address)
      // ok, no revert
    })

    it("can not be done by non-owner", async () => {
      await expect(
        batchedPhasedEscrow
          .connect(drawee)
          .approveBeneficiary(beneficiary1.address)
      ).to.be.revertedWith("Ownable: caller is not the owner")
    })

    it("can not be done on zero address", async () => {
      await expect(
        batchedPhasedEscrow.connect(owner).approveBeneficiary(ZERO_ADDRESS)
      ).to.be.revertedWith("Beneficiary can not be zero address")
    })

    it("emits an event", async () => {
      const tx = await batchedPhasedEscrow
        .connect(owner)
        .approveBeneficiary(beneficiary1.address)

      await expect(tx)
        .to.emit(batchedPhasedEscrow, "BeneficiaryApproved")
        .withArgs(beneficiary1.address)
    })

    it("maintains beneficiaries as non-approved by default", async () => {
      expect(
        await batchedPhasedEscrow.isBeneficiaryApproved(beneficiary1.address)
      ).to.be.false
      expect(
        await batchedPhasedEscrow.isBeneficiaryApproved(beneficiary2.address)
      ).to.be.false
      expect(
        await batchedPhasedEscrow.isBeneficiaryApproved(beneficiary3.address)
      ).to.be.false
    })

    it("approves a single beneficiary", async () => {
      await batchedPhasedEscrow
        .connect(owner)
        .approveBeneficiary(beneficiary2.address)

      expect(
        await batchedPhasedEscrow.isBeneficiaryApproved(beneficiary1.address)
      ).to.be.false
      expect(
        await batchedPhasedEscrow.isBeneficiaryApproved(beneficiary2.address)
      ).to.be.true
      expect(
        await batchedPhasedEscrow.isBeneficiaryApproved(beneficiary3.address)
      ).to.be.false
    })

    it("approves multiple beneficiaries ", async () => {
      await batchedPhasedEscrow
        .connect(owner)
        .approveBeneficiary(beneficiary1.address)
      await batchedPhasedEscrow
        .connect(owner)
        .approveBeneficiary(beneficiary2.address)

      expect(
        await batchedPhasedEscrow.isBeneficiaryApproved(beneficiary1.address)
      ).to.be.true
      expect(
        await batchedPhasedEscrow.isBeneficiaryApproved(beneficiary2.address)
      ).to.be.true
      expect(
        await batchedPhasedEscrow.isBeneficiaryApproved(beneficiary3.address)
      ).to.be.false
    })
  })

  describe("drawee role", async () => {
    it("is by default assigned to owner", async () => {
      expect(await batchedPhasedEscrow.drawee()).to.equal(owner.address)
    })

    it("can be transferred by owner", async () => {
      await batchedPhasedEscrow.connect(owner).setDrawee(updatedDrawee.address)
      // ok, no revert
    })

    it("can be transferred by updated owner", async () => {
      await batchedPhasedEscrow
        .connect(owner)
        .transferOwnership(updatedOwner.address)

      await expect(
        batchedPhasedEscrow.connect(owner).setDrawee(updatedDrawee.address)
      ).to.be.revertedWith("Ownable: caller is not the owner")
      await batchedPhasedEscrow
        .connect(updatedOwner)
        .setDrawee(updatedDrawee.address)
      // ok, no revert
    })

    it("can not be transferred by non-owner", async () => {
      await expect(
        batchedPhasedEscrow.connect(drawee).setDrawee(updatedDrawee.address)
      ).to.be.revertedWith("Ownable: caller is not the owner")
    })

    it("can be transferred to another account", async () => {
      let tx = await batchedPhasedEscrow
        .connect(owner)
        .setDrawee(drawee.address)

      expect(await batchedPhasedEscrow.drawee()).to.equal(drawee.address)
      await expect(tx)
        .to.emit(batchedPhasedEscrow, "DraweeRoleTransferred")
        .withArgs(owner.address, drawee.address)

      tx = await batchedPhasedEscrow
        .connect(owner)
        .setDrawee(updatedDrawee.address)

      expect(await batchedPhasedEscrow.drawee()).to.equal(updatedDrawee.address)
      await expect(tx)
        .to.emit(batchedPhasedEscrow, "DraweeRoleTransferred")
        .withArgs(drawee.address, updatedDrawee.address)
    })
  })

  describe("batchedWithdraw", async () => {
    let beneficiaries
    let amounts
    let escrowBalance

    beforeEach(async () => {
      beneficiaries = [
        beneficiary1.address,
        beneficiary2.address,
        beneficiary3.address,
      ]

      amounts = [100, 200, 300]
      escrowBalance = 600

      await batchedPhasedEscrow
        .connect(owner)
        .approveBeneficiary(beneficiary1.address)
      await batchedPhasedEscrow
        .connect(owner)
        .approveBeneficiary(beneficiary2.address)
      await batchedPhasedEscrow
        .connect(owner)
        .approveBeneficiary(beneficiary3.address)

      await batchedPhasedEscrow.connect(owner).setDrawee(drawee.address)

      await token
        .connect(tokenHolder)
        .transfer(batchedPhasedEscrow.address, escrowBalance)
    })

    it("can be called by drawee", async () => {
      await batchedPhasedEscrow
        .connect(drawee)
        .batchedWithdraw(beneficiaries, amounts)
      // ok, no revert
    })

    it("can not be called by owner if not drawee", async () => {
      await expect(
        batchedPhasedEscrow
          .connect(owner)
          .batchedWithdraw(beneficiaries, amounts)
      ).to.be.revertedWith("Caller is not the drawee")
    })

    it("can not be called by non-drawee", async () => {
      await expect(
        batchedPhasedEscrow
          .connect(updatedDrawee)
          .batchedWithdraw(beneficiaries, amounts)
      ).to.be.revertedWith("Caller is not the drawee")
    })

    it("reverts when input arrays have different lengths", async () => {
      await expect(
        batchedPhasedEscrow
          .connect(drawee)
          .batchedWithdraw(beneficiaries, [100, 200])
      ).to.be.revertedWith("Mismatched arrays length")
    })

    it("reverts when beneficiary is not IBeneficiaryContract", async () => {
      await expect(
        batchedPhasedEscrow
          .connect(drawee)
          .batchedWithdraw(
            [beneficiary1.address, beneficiary2.address, owner],
            amounts
          )
      ).to.be.reverted
    })

    it("reverts when beneficiary was not approved", async () => {
      const TestSimpleBeneficiary = await ethers.getContractFactory(
        "TestSimpleBeneficiary"
      )
      anotherBeneficiary = await TestSimpleBeneficiary.deploy()
      await anotherBeneficiary.deployed()

      await expect(
        batchedPhasedEscrow
          .connect(drawee)
          .batchedWithdraw(
            [beneficiary1.address, anotherBeneficiary.address],
            [100, 200]
          )
      ).to.be.revertedWith("Beneficiary was not approved")
    })

    it("reverts when there are not enough funds in the escrow", async () => {
      await expect(
        batchedPhasedEscrow
          .connect(drawee)
          .batchedWithdraw(beneficiaries, [100, 200, 301])
      ).to.be.reverted
    })

    it("withdraws specified tokens to beneficiaries", async () => {
      await batchedPhasedEscrow
        .connect(drawee)
        .batchedWithdraw(beneficiaries, amounts)

      for (let i = 0; i < beneficiaries.length; i++) {
        expect(await token.balanceOf(beneficiaries[i])).to.equal(amounts[i])
      }

      expect(await token.balanceOf(batchedPhasedEscrow.address)).to.equal(0)
    })
  })
})
