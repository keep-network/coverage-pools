const { expect } = require("chai")
const {
  to1e18,
  pastEvents,
  ZERO_ADDRESS,
} = require("./helpers/contract-test-helpers")

describe("UnderwriterToken", () => {
  // default Hardhat's networks blockchain, see https://hardhat.org/config/
  const hardhatNetworkId = 31337

  const initialSupply = to1e18(100)

  let initialHolder
  let recipient
  let anotherAccount

  let token

  beforeEach(async () => {
    const UnderwriterToken = await ethers.getContractFactory(
      "UnderwriterTokenStub"
    )
    token = await UnderwriterToken.deploy()
    await token.deployed()
    await token.initialize()

    initialHolder = await ethers.getSigner(0)
    await token.mint(initialHolder.address, initialSupply)

    recipient = await ethers.getSigner(1)
    anotherAccount = await ethers.getSigner(2)
  })

  it("has a name", async () => {
    expect(await token.name()).to.equal("Underwriter Token")
  })

  it("has a symbol", async () => {
    expect(await token.symbol()).to.equal("COV")
  })

  it("has 18 decimals", async () => {
    expect(await token.decimals()).to.equal(18)
  })

  describe("initialization", async () => {
    it("should happen only one time", async () => {
      await expect(token.initialize()).to.be.revertedWith(
        "Token already initialized"
      )
    })
  })

  describe("total supply", () => {
    it("returns the total amount of tokens", async () => {
      expect(await token.totalSupply()).to.equal(initialSupply)
    })
  })

  describe("permit typehash", () => {
    it("is keccak256 of EIP2612 Permit message", async () => {
      const expected = ethers.utils.keccak256(
        ethers.utils.toUtf8Bytes(
          "Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"
        )
      )
      expect(await token.PERMIT_TYPEHASH()).to.equal(expected)
    })
  })

  describe("domain separator", () => {
    it("is keccak256 of EIP712 domain struct", async () => {
      const keccak256 = ethers.utils.keccak256
      const defaultAbiCoder = ethers.utils.defaultAbiCoder
      const toUtf8Bytes = ethers.utils.toUtf8Bytes

      const expected = keccak256(
        defaultAbiCoder.encode(
          ["bytes32", "bytes32", "bytes32", "uint256", "address"],
          [
            keccak256(
              toUtf8Bytes(
                "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
              )
            ),
            keccak256(toUtf8Bytes("Underwriter Token")),
            keccak256(toUtf8Bytes("1")),
            hardhatNetworkId,
            token.address,
          ]
        )
      )
      expect(await token.DOMAIN_SEPARATOR()).to.equal(expected)
    })
  })

  describe("balanceOf", () => {
    describe("when the requested account has no tokens", () => {
      it("returns zero", async () => {
        expect(await token.balanceOf(anotherAccount.address)).to.equal(0)
      })
    })

    describe("when the requested account has some tokens", () => {
      it("returns the total amount of tokens", async () => {
        expect(await token.balanceOf(initialHolder.address)).to.equal(
          initialSupply
        )
      })
    })
  })

  describe("transfer", () => {
    describe("when the recipient is not the zero address", () => {
      describe("when the sender does not have enough balance", () => {
        const amount = initialSupply.add(1)

        it("reverts", async () => {
          await expect(
            token.connect(initialHolder).transfer(recipient.address, amount)
          ).to.be.revertedWith("Transfer amount exceeds balance")
        })
      })

      describe("when the sender transfers all balance", () => {
        const amount = initialSupply

        it("transfers the requested amount", async () => {
          await token.connect(initialHolder).transfer(recipient.address, amount)

          expect(await token.balanceOf(initialHolder.address)).to.equal(0)

          expect(await token.balanceOf(recipient.address)).to.equal(amount)
        })

        it("emits a transfer event", async () => {
          const tx = await token
            .connect(initialHolder)
            .transfer(recipient.address, amount)
          const receipt = await tx.wait()
          const events = pastEvents(receipt, token, "Transfer")

          expect(events.length).to.equal(1)
          expect(events[0].args["from"]).to.equal(initialHolder.address)
          expect(events[0].args["to"]).to.equal(recipient.address)
          expect(events[0].args["value"]).equal(amount)
        })
      })

      describe("when the sender transfers zero tokens", () => {
        const amount = ethers.BigNumber.from(0)

        it("transfers the requested amount", async () => {
          await token.connect(initialHolder).transfer(recipient.address, amount)

          expect(await token.balanceOf(initialHolder.address)).to.equal(
            initialSupply
          )

          expect(await token.balanceOf(recipient.address)).to.equal(0)
        })

        it("emits a transfer event", async () => {
          const tx = await token
            .connect(initialHolder)
            .transfer(recipient.address, amount)
          const receipt = await tx.wait()
          const events = pastEvents(receipt, token, "Transfer")

          expect(events.length).to.equal(1)
          expect(events[0].args["from"]).to.equal(initialHolder.address)
          expect(events[0].args["to"]).to.equal(recipient.address)
          expect(events[0].args["value"]).equal(amount)
        })
      })
    })

    describe("when the recipient is the zero address", () => {
      it("reverts", async () => {
        await expect(
          token.connect(initialHolder).transfer(ZERO_ADDRESS, initialSupply)
        ).to.be.revertedWith("Transfer to the zero address")
      })
    })
  })

  describe("transfer from", () => {
    describe("when the token owner is not the zero address", () => {
      describe("when the recipient is not the zero address", () => {
        describe("when the spender has enough approved balance", () => {
          const allowance = initialSupply
          beforeEach(async function () {
            await token
              .connect(initialHolder)
              .approve(anotherAccount.address, allowance)
          })

          describe("when the token owner has enough balance", () => {
            const amount = initialSupply

            it("transfers the requested amount", async () => {
              await token
                .connect(anotherAccount)
                .transferFrom(initialHolder.address, recipient.address, amount)

              expect(await token.balanceOf(initialHolder.address)).to.equal(0)

              expect(await token.balanceOf(recipient.address)).to.equal(amount)
            })

            it("decreases the spender allowance", async () => {
              await token
                .connect(anotherAccount)
                .transferFrom(initialHolder.address, recipient.address, amount)

              expect(
                await token.allowance(
                  initialHolder.address,
                  anotherAccount.address
                )
              ).to.equal(0)
            })

            it("emits a transfer event", async () => {
              const tx = await token
                .connect(anotherAccount)
                .transferFrom(initialHolder.address, recipient.address, amount)
              const receipt = await tx.wait()
              const events = pastEvents(receipt, token, "Transfer")

              expect(events.length).to.equal(1)
              expect(events[0].args["from"]).to.equal(initialHolder.address)
              expect(events[0].args["to"]).to.equal(recipient.address)
              expect(events[0].args["value"]).to.equal(amount)
            })

            it("emits an approval event", async () => {
              const tx = await token
                .connect(anotherAccount)
                .transferFrom(initialHolder.address, recipient.address, amount)
              const receipt = await tx.wait()
              const events = pastEvents(receipt, token, "Approval")

              expect(events.length).to.equal(1)
              expect(events[0].args["owner"]).to.equal(initialHolder.address)
              expect(events[0].args["spender"]).to.equal(anotherAccount.address)
              expect(events[0].args["value"]).to.equal(allowance.sub(amount))
            })
          })

          describe("when the token owner does not have enough balance", () => {
            const amount = initialSupply

            beforeEach(async () => {
              await token
                .connect(initialHolder)
                .transfer(anotherAccount.address, 1)
            })

            it("reverts", async () => {
              await expect(
                token
                  .connect(anotherAccount)
                  .transferFrom(
                    initialHolder.address,
                    recipient.address,
                    amount
                  )
              ).to.be.revertedWith("Transfer amount exceeds balance")
            })
          })
        })

        describe("when the spender does not have enough approved balance", () => {
          const allowance = initialSupply.sub(1)

          beforeEach(async () => {
            await token
              .connect(initialHolder)
              .approve(anotherAccount.address, allowance)
          })

          describe("when the token owner has enough balance", () => {
            const amount = initialSupply

            it("reverts", async () => {
              await expect(
                token
                  .connect(anotherAccount)
                  .transferFrom(
                    initialHolder.address,
                    recipient.address,
                    amount
                  )
              ).to.be.revertedWith("Transfer amount exceeds allowance")
            })
          })

          describe("when the token owner does not have enough balance", () => {
            const amount = initialSupply

            beforeEach(async () => {
              await token
                .connect(initialHolder)
                .transfer(anotherAccount.address, 1)
            })

            it("reverts", async () => {
              await expect(
                token
                  .connect(anotherAccount)
                  .transferFrom(
                    initialHolder.address,
                    recipient.address,
                    amount
                  )
              ).to.be.revertedWith("Transfer amount exceeds allowance")
            })
          })

          describe("when the token owner is the zero address", () => {
            const allowance = initialSupply

            it("reverts", async () => {
              await expect(
                token
                  .connect(anotherAccount)
                  .transferFrom(ZERO_ADDRESS, recipient.address, allowance)
              ).to.be.revertedWith("Transfer amount exceeds allowance")
            })
          })
        })
      })

      describe("when the recipient is the zero address", () => {
        const allowance = initialSupply

        beforeEach(async () => {
          await token
            .connect(initialHolder)
            .approve(anotherAccount.address, allowance)
        })

        it("reverts", async () => {
          await expect(
            token
              .connect(anotherAccount)
              .transferFrom(initialHolder.address, ZERO_ADDRESS, allowance)
          ).to.be.revertedWith("Transfer to the zero address")
        })
      })
    })
  })

  describe("approve", () => {
    describe("when the spender is not the zero address", () => {
      describe("when the sender has enough balance", () => {
        const allowance = initialSupply

        it("emits an approval event", async () => {
          const tx = await token
            .connect(initialHolder)
            .approve(anotherAccount.address, allowance)
          const receipt = await tx.wait()
          const events = pastEvents(receipt, token, "Approval")

          expect(events.length).to.equal(1)
          expect(events[0].args["owner"]).to.equal(initialHolder.address)
          expect(events[0].args["spender"]).to.equal(anotherAccount.address)
          expect(events[0].args["value"]).to.equal(allowance)
        })

        describe("when there was no approved amount before", () => {
          it("approves the requested amount", async () => {
            await token
              .connect(initialHolder)
              .approve(anotherAccount.address, allowance)

            expect(
              await token.allowance(
                initialHolder.address,
                anotherAccount.address
              )
            ).to.equal(allowance)
          })
        })

        describe("when the spender had an approved amount", () => {
          beforeEach(async () => {
            await token
              .connect(initialHolder)
              .approve(anotherAccount.address, allowance)
          })

          it("approves the requested amount and replaces the previous one", async () => {
            const newAllowance = to1e18(100)

            await token
              .connect(initialHolder)
              .approve(anotherAccount.address, newAllowance)
            expect(
              await token.allowance(
                initialHolder.address,
                anotherAccount.address
              )
            ).to.equal(newAllowance)
          })
        })
      })

      describe("when the sender does not have enough balance", () => {
        const allowance = initialSupply.add(1)

        it("emits an approval event", async () => {
          const tx = await token
            .connect(initialHolder)
            .approve(anotherAccount.address, allowance)
          const receipt = await tx.wait()
          const events = pastEvents(receipt, token, "Approval")

          expect(events.length).to.equal(1)
          expect(events[0].args["owner"]).to.equal(initialHolder.address)
          expect(events[0].args["spender"]).to.equal(anotherAccount.address)
          expect(events[0].args["value"]).to.equal(allowance)
        })

        describe("when there was no approved amount before", () => {
          it("approves the requested amount", async () => {
            await token
              .connect(initialHolder)
              .approve(anotherAccount.address, allowance)

            expect(
              await token.allowance(
                initialHolder.address,
                anotherAccount.address
              )
            ).to.equal(allowance)
          })
        })

        describe("when the spender had an approved amount", () => {
          beforeEach(async () => {
            await token
              .connect(initialHolder)
              .approve(anotherAccount.address, to1e18(1))
          })

          it("approves the requested amount and replaces the previous one", async () => {
            await token
              .connect(initialHolder)
              .approve(anotherAccount.address, allowance)
            expect(
              await token.allowance(
                initialHolder.address,
                anotherAccount.address
              )
            ).to.equal(allowance)
          })
        })
      })
    })

    describe("when the spender is the zero address", () => {
      const allowance = initialSupply
      it("reverts", async () => {
        await expect(
          token.connect(initialHolder).approve(ZERO_ADDRESS, allowance)
        ).to.be.revertedWith("Approve to the zero address")
      })
    })
  })

  describe("_mint", () => {
    const amount = to1e18(50)
    it("rejects a zero account", async () => {
      await expect(token.mint(ZERO_ADDRESS, amount)).to.be.revertedWith(
        "Mint to the zero address"
      )
    })

    describe("for a non zero account", () => {
      let mintTx
      beforeEach("minting", async () => {
        mintTx = await token.mint(anotherAccount.address, amount)
      })

      it("increments totalSupply", async () => {
        const expectedSupply = initialSupply.add(amount)
        expect(await token.totalSupply()).to.equal(expectedSupply)
      })

      it("increments recipient balance", async () => {
        expect(await token.balanceOf(anotherAccount.address)).to.equal(amount)
      })

      it("emits Transfer event", async () => {
        const receipt = await mintTx.wait()
        const events = pastEvents(receipt, token, "Transfer")
        expect(events.length).to.equal(1)
        expect(events[0].args["from"]).to.equal(ZERO_ADDRESS)
        expect(events[0].args["to"]).to.equal(anotherAccount.address)
        expect(events[0].args["value"]).to.equal(amount)
      })
    })
  })

  describe("_burn", () => {
    it("rejects a zero account", async () => {
      await expect(token.burn(ZERO_ADDRESS, to1e18(1))).to.be.revertedWith(
        "Burn from the zero address"
      )
    })

    describe("for a non zero account", () => {
      it("rejects burning more than balance", async () => {
        await expect(
          token.burn(initialHolder.address, initialSupply.add(1))
        ).to.be.revertedWith("Burn amount exceeds balance")
      })

      const describeBurn = (description, amount) => {
        describe(description, () => {
          let burnTx
          beforeEach("burning", async () => {
            burnTx = await token.burn(initialHolder.address, amount)
          })

          it("decrements totalSupply", async () => {
            const expectedSupply = initialSupply.sub(amount)
            expect(await token.totalSupply()).to.equal(expectedSupply)
          })

          it("decrements initialHolder balance", async () => {
            const expectedBalance = initialSupply.sub(amount)
            expect(await token.balanceOf(initialHolder.address)).to.equal(
              expectedBalance
            )
          })

          it("emits Transfer event", async () => {
            const receipt = await burnTx.wait()
            const events = pastEvents(receipt, token, "Transfer")
            expect(events.length).to.equal(1)
            expect(events[0].args["from"]).to.equal(initialHolder.address)
            expect(events[0].args["to"]).to.equal(ZERO_ADDRESS)
            expect(events[0].args["value"]).to.equal(amount)
          })
        })
      }

      describeBurn("for entire balance", initialSupply)
      describeBurn("for less amount than balance", initialSupply.sub(1))
    })
  })

  describe("permit", () => {
    // FIXME replace hardcoded timestamps with a call to chain to get the
    // FIXME last block's timestamp; getting latestTime with
    // FIXME provider.getBlockNumber() and provider.getBlock is currently
    // FIXME very time consuming
    const timestamp2020 = 1577836633 // Jan 1, 2020
    const timestamp2025 = 1735689433 // Jan 1, 2025

    const permittingHolderBalance = to1e18(650000)
    let permittingHolder

    beforeEach(async () => {
      permittingHolder = await ethers.Wallet.createRandom()
      await token.mint(permittingHolder.address, permittingHolderBalance)
    })

    const getApproval = async (amount, spender, deadline) => {
      // We use ethers.utils.SigningKey for a Wallet instead of
      // Signer.signMessage to do not add '\x19Ethereum Signed Message:\n'
      // prefix to the signed message. The '\x19` protection (see EIP191 for
      // more details on '\x19' rationale and format) is already included in
      // EIP2612 permit signed message and '\x19Ethereum Signed Message:\n'
      // should not be used there.
      const signingKey = new ethers.utils.SigningKey(
        permittingHolder.privateKey
      )

      const domainSeparator = await token.DOMAIN_SEPARATOR()
      const permitTypehash = await token.PERMIT_TYPEHASH()
      const nonce = await token.nonces(permittingHolder.address)

      const approvalDigest = ethers.utils.keccak256(
        ethers.utils.solidityPack(
          ["bytes1", "bytes1", "bytes32", "bytes32"],
          [
            "0x19",
            "0x01",
            domainSeparator,
            ethers.utils.keccak256(
              ethers.utils.defaultAbiCoder.encode(
                [
                  "bytes32",
                  "address",
                  "address",
                  "uint256",
                  "uint256",
                  "uint256",
                ],
                [
                  permitTypehash,
                  permittingHolder.address,
                  spender,
                  amount,
                  nonce,
                  deadline,
                ]
              )
            ),
          ]
        )
      )

      return ethers.utils.splitSignature(
        await signingKey.signDigest(approvalDigest)
      )
    }

    describe("when permission expired", () => {
      it("reverts", async () => {
        const deadline = timestamp2020
        const signature = await getApproval(
          permittingHolderBalance,
          anotherAccount.address,
          deadline
        )

        await expect(
          token
            .connect(anotherAccount)
            .permit(
              permittingHolder.address,
              anotherAccount.address,
              permittingHolderBalance,
              deadline,
              signature.v,
              signature.r,
              signature.s
            )
        ).to.be.revertedWith("Permission expired")
      })
    })

    describe("when permission has an invalid signature", () => {
      it("reverts", async () => {
        const deadline = timestamp2025
        const signature = await getApproval(
          permittingHolderBalance,
          anotherAccount.address,
          deadline
        )

        await expect(
          token.connect(anotherAccount).permit(
            anotherAccount.address, // does not match the signature
            anotherAccount.address,
            permittingHolderBalance,
            deadline,
            signature.v,
            signature.r,
            signature.s
          )
        ).to.be.revertedWith("Invalid signature")
      })
    })

    describe("when the spender is not the zero address", () => {
      describe("when the sender has enough balance", () => {
        const allowance = permittingHolderBalance
        it("emits an approval event", async () => {
          const deadline = timestamp2025
          const signature = await getApproval(
            allowance,
            anotherAccount.address,
            deadline
          )

          const tx = await token
            .connect(anotherAccount)
            .permit(
              permittingHolder.address,
              anotherAccount.address,
              allowance,
              deadline,
              signature.v,
              signature.r,
              signature.s
            )
          const receipt = await tx.wait()
          const events = pastEvents(receipt, token, "Approval")

          expect(events.length).to.equal(1)
          expect(events[0].args["owner"]).to.equal(permittingHolder.address)
          expect(events[0].args["spender"]).to.equal(anotherAccount.address)
          expect(events[0].args["value"]).to.equal(allowance)
        })

        describe("when there was no approved amount before", () => {
          it("approves the requested amount", async () => {
            const deadline = timestamp2025
            const signature = await getApproval(
              allowance,
              anotherAccount.address,
              deadline
            )

            await token
              .connect(anotherAccount)
              .permit(
                permittingHolder.address,
                anotherAccount.address,
                allowance,
                deadline,
                signature.v,
                signature.r,
                signature.s
              )

            expect(
              await token.allowance(
                permittingHolder.address,
                anotherAccount.address
              )
            ).to.equal(allowance)
          })
        })

        describe("when the spender had an approved amount", () => {
          beforeEach(async () => {
            const deadline = timestamp2025
            const initialAllowance = allowance.sub(10)
            const signature = await getApproval(
              initialAllowance,
              anotherAccount.address,
              deadline
            )

            await token
              .connect(anotherAccount)
              .permit(
                permittingHolder.address,
                anotherAccount.address,
                initialAllowance,
                deadline,
                signature.v,
                signature.r,
                signature.s
              )
          })

          it("approves the requested amount and replaces the previous one", async () => {
            const deadline = timestamp2025
            const signature = await getApproval(
              allowance,
              anotherAccount.address,
              deadline
            )

            await token
              .connect(anotherAccount)
              .permit(
                permittingHolder.address,
                anotherAccount.address,
                allowance,
                deadline,
                signature.v,
                signature.r,
                signature.s
              )

            expect(
              await token.allowance(
                permittingHolder.address,
                anotherAccount.address
              )
            ).to.equal(allowance)
          })
        })
      })

      describe("when the sender does not have enough balance", () => {
        const allowance = permittingHolderBalance.add(1)
        it("emits an approval event", async () => {
          const deadline = timestamp2025
          const signature = await getApproval(
            allowance,
            anotherAccount.address,
            deadline
          )

          const tx = await token
            .connect(anotherAccount)
            .permit(
              permittingHolder.address,
              anotherAccount.address,
              allowance,
              deadline,
              signature.v,
              signature.r,
              signature.s
            )
          const receipt = await tx.wait()
          const events = pastEvents(receipt, token, "Approval")

          expect(events.length).to.equal(1)
          expect(events[0].args["owner"]).to.equal(permittingHolder.address)
          expect(events[0].args["spender"]).to.equal(anotherAccount.address)
          expect(events[0].args["value"]).to.equal(allowance)
        })

        describe("when there was no approved amount before", () => {
          it("approves the requested amount", async () => {
            const deadline = timestamp2025
            const signature = await getApproval(
              allowance,
              anotherAccount.address,
              deadline
            )

            await token
              .connect(anotherAccount)
              .permit(
                permittingHolder.address,
                anotherAccount.address,
                allowance,
                deadline,
                signature.v,
                signature.r,
                signature.s
              )

            expect(
              await token.allowance(
                permittingHolder.address,
                anotherAccount.address
              )
            ).to.equal(allowance)
          })
        })

        describe("when the spender had an approved amount", () => {
          beforeEach(async () => {
            const deadline = timestamp2025
            const initialAllowance = allowance.sub(10)
            const signature = await getApproval(
              initialAllowance,
              anotherAccount.address,
              deadline
            )

            await token
              .connect(anotherAccount)
              .permit(
                permittingHolder.address,
                anotherAccount.address,
                initialAllowance,
                deadline,
                signature.v,
                signature.r,
                signature.s
              )
          })

          it("approves the requested amount and replaces the previous one", async () => {
            const deadline = timestamp2025
            const signature = await getApproval(
              allowance,
              anotherAccount.address,
              deadline
            )

            await token
              .connect(anotherAccount)
              .permit(
                permittingHolder.address,
                anotherAccount.address,
                allowance,
                deadline,
                signature.v,
                signature.r,
                signature.s
              )

            expect(
              await token.allowance(
                permittingHolder.address,
                anotherAccount.address
              )
            ).to.equal(allowance)
          })
        })
      })
    })

    describe("when the spender is the zero address", () => {
      const allowance = permittingHolderBalance
      it("reverts", async () => {
        const deadline = timestamp2025
        const signature = await getApproval(allowance, ZERO_ADDRESS, deadline)

        await expect(
          token
            .connect(anotherAccount)
            .permit(
              permittingHolder.address,
              ZERO_ADDRESS,
              allowance,
              deadline,
              signature.v,
              signature.r,
              signature.s
            )
        ).to.be.revertedWith("Approve to the zero address")
      })
    })

    describe("when given never expiring permit", () => {
      // uint(-1)
      const allowance = ethers.BigNumber.from(
        "115792089237316195423570985008687907853269984665640564039457584007913129639935"
      )

      beforeEach(async () => {
        const deadline = timestamp2025
        const signature = await getApproval(
          allowance,
          anotherAccount.address,
          deadline
        )

        await token
          .connect(anotherAccount)
          .permit(
            permittingHolder.address,
            anotherAccount.address,
            allowance,
            deadline,
            signature.v,
            signature.r,
            signature.s
          )
      })
      it("does not reduce approved amount", async () => {
        expect(
          await token.allowance(
            permittingHolder.address,
            anotherAccount.address
          )
        ).to.equal(allowance)

        await token
          .connect(anotherAccount)
          .transferFrom(
            permittingHolder.address,
            recipient.address,
            to1e18(100)
          )

        expect(
          await token.allowance(
            permittingHolder.address,
            anotherAccount.address
          )
        ).to.equal(allowance)
      })
    })
  })
})
