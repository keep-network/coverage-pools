const { expect } = require("chai")
const {
  to1e18,
  lastBlockNumber,
  lastBlockTime,
  ZERO_ADDRESS,
} = require("./helpers/contract-test-helpers")

describe("UnderwriterToken", () => {
  const initialBalance = to1e18(1000000)
  let underwriterToken
  let deployer
  let delegatee
  let delegatee2

  beforeEach(async () => {
    ;[
      deployer,
      tokenHolder,
      tokenRecipient,
      delegatee,
      delegatee2,
      thirdParty,
    ] = await ethers.getSigners()

    const UnderwriterToken = await ethers.getContractFactory("UnderwriterToken")
    underwriterToken = await UnderwriterToken.deploy("Underwriter Token", "COV")
    await underwriterToken.deployed()

    await underwriterToken
      .connect(deployer)
      .mint(tokenHolder.address, initialBalance)
  })

  const describeDelegate = (getDelegator, doDelegate) => {
    context("when delegated to someone else", () => {
      let delegator
      let tx

      beforeEach(async () => {
        delegator = getDelegator()
        tx = await doDelegate(delegatee.address)
      })

      it("should update current votes", async () => {
        expect(await underwriterToken.getVotes(delegator.address)).to.equal(0)
        expect(await underwriterToken.getVotes(delegatee.address)).to.equal(
          initialBalance
        )
      })

      it("should update delegatee address", async () => {
        expect(await underwriterToken.delegates(delegator.address)).to.equal(
          delegatee.address
        )
      })

      it("should emit DelegateChanged event", async () => {
        await expect(tx)
          .to.emit(underwriterToken, "DelegateChanged")
          .withArgs(delegator.address, ZERO_ADDRESS, delegatee.address)
      })

      it("should emit DelegateVotesChanged", async () => {
        await expect(tx)
          .to.emit(underwriterToken, "DelegateVotesChanged")
          .withArgs(delegatee.address, 0, initialBalance)
      })
    })

    context("when self-delegated", () => {
      let delegator
      let tx

      beforeEach(async () => {
        delegator = getDelegator()
        tx = await doDelegate(delegator.address)
      })

      it("should update current votes", async () => {
        expect(await underwriterToken.getVotes(delegator.address)).to.equal(
          initialBalance
        )
      })

      it("should update delegatee address", async () => {
        expect(await underwriterToken.delegates(delegator.address)).to.equal(
          delegator.address
        )
      })

      it("should emit DelegateChanged event", async () => {
        await expect(tx)
          .to.emit(underwriterToken, "DelegateChanged")
          .withArgs(delegator.address, ZERO_ADDRESS, delegator.address)
      })

      it("should emit DelegateVotesChanged", async () => {
        await expect(tx)
          .to.emit(underwriterToken, "DelegateVotesChanged")
          .withArgs(delegator.address, 0, initialBalance)
      })
    })

    context("when delegated multiple times", () => {
      let delegator
      let block1
      let block2
      let block3
      let block4

      beforeEach(async () => {
        delegator = getDelegator()
        await doDelegate(delegatee.address)
        block1 = await lastBlockNumber()
        await doDelegate(delegatee2.address)
        block2 = await lastBlockNumber()
        await doDelegate(delegatee.address)
        block3 = await lastBlockNumber()
        await doDelegate(delegator.address)
        block4 = await lastBlockNumber()
        await doDelegate(delegatee2.address)
      })

      it("should update current votes", async () => {
        expect(await underwriterToken.getVotes(delegator.address)).to.equal(0)
        expect(await underwriterToken.getVotes(delegatee.address)).to.equal(0)
        expect(await underwriterToken.getVotes(delegatee2.address)).to.equal(
          initialBalance
        )
      })

      it("should keep track of prior votes", async () => {
        expect(
          await underwriterToken.getPastVotes(delegator.address, block1)
        ).to.equal(0)
        expect(
          await underwriterToken.getPastVotes(delegatee.address, block1)
        ).to.equal(initialBalance)
        expect(
          await underwriterToken.getPastVotes(delegatee2.address, block1)
        ).to.equal(0)

        expect(
          await underwriterToken.getPastVotes(delegator.address, block2)
        ).to.equal(0)
        expect(
          await underwriterToken.getPastVotes(delegatee.address, block2)
        ).to.equal(0)
        expect(
          await underwriterToken.getPastVotes(delegatee2.address, block2)
        ).to.equal(initialBalance)

        expect(
          await underwriterToken.getPastVotes(delegator.address, block3)
        ).to.equal(0)
        expect(
          await underwriterToken.getPastVotes(delegatee.address, block3)
        ).to.equal(initialBalance)
        expect(
          await underwriterToken.getPastVotes(delegatee2.address, block3)
        ).to.equal(0)

        expect(
          await underwriterToken.getPastVotes(delegator.address, block4)
        ).to.equal(initialBalance)
        expect(
          await underwriterToken.getPastVotes(delegatee.address, block4)
        ).to.equal(0)
        expect(
          await underwriterToken.getPastVotes(delegatee2.address, block4)
        ).to.equal(0)
      })
    })
  }

  describe("delegate", () => {
    describeDelegate(
      () => {
        return tokenHolder
      },
      async (delegatee) => {
        return await underwriterToken.connect(tokenHolder).delegate(delegatee)
      }
    )
  })

  describe("delegateBySig", async () => {
    let yesterday
    let tomorrow

    let delegator

    beforeEach(async () => {
      const lastBlockTimestamp = await lastBlockTime()
      yesterday = lastBlockTimestamp - 86400 // -1 day
      tomorrow = lastBlockTimestamp + 86400 // +1 day

      // Hardhat creates SignerWithAddress instance that does not give access
      // to private key. We need an access to private key so that we can construct
      // ethers.utils.SigningKey as explained later.
      delegator = await ethers.Wallet.createRandom()
      await underwriterToken
        .connect(deployer)
        .mint(delegator.address, initialBalance)
    })

    describeDelegate(
      () => {
        return delegator
      },
      async (delegatee) => {
        const signature = await getDelegation(delegatee, tomorrow)
        return await underwriterToken.delegateBySig(
          delegator.address,
          delegatee,
          tomorrow,
          signature.v,
          signature.r,
          signature.s
        )
      }
    )

    context("when delegation order expired", () => {
      it("should revert", async () => {
        const signature = await getDelegation(delegatee.address, yesterday)

        await expect(
          underwriterToken.delegateBySig(
            delegator.address,
            delegatee.address,
            yesterday,
            signature.v,
            signature.r,
            signature.s
          )
        ).to.be.revertedWith("Delegation expired")
      })
    })

    context("when delegation order has an invalid signature", () => {
      it("should revert", async () => {
        const signature = await getDelegation(delegatee.address, tomorrow)

        await expect(
          underwriterToken.delegateBySig(
            delegator.address,
            delegatee.address,
            tomorrow,
            signature.v,
            signature.s, // not r but s
            signature.s
          )
        ).to.be.revertedWith("Invalid signature")
      })
    })

    const getDelegation = async (delegatee, deadline) => {
      // We use ethers.utils.SigningKey for a Wallet instead of
      // Signer.signMessage to do not add '\x19Ethereum Signed Message:\n'
      // prefix to the signed message. The '\x19` protection (see EIP191 for
      // more details on '\x19' rationale and format) is already included in
      // Delegation signed message and '\x19Ethereum Signed Message:\n'
      // should not be used there.
      const signingKey = new ethers.utils.SigningKey(delegator.privateKey)

      const domainSeparator = await underwriterToken.DOMAIN_SEPARATOR()
      const delegationTypehash = await underwriterToken.DELEGATION_TYPEHASH()
      const nonce = await underwriterToken.nonce(delegator.address)

      const delegationDigest = ethers.utils.keccak256(
        ethers.utils.solidityPack(
          ["bytes1", "bytes1", "bytes32", "bytes32"],
          [
            "0x19",
            "0x01",
            domainSeparator,
            ethers.utils.keccak256(
              ethers.utils.defaultAbiCoder.encode(
                ["bytes32", "address", "uint256", "uint256"],
                [delegationTypehash, delegatee, nonce, deadline]
              )
            ),
          ]
        )
      )

      return ethers.utils.splitSignature(
        await signingKey.signDigest(delegationDigest)
      )
    }
  })
})
