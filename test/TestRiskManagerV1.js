const chai = require("chai")

const expect = chai.expect
const { to1e18, ZERO_ADDRESS } = require("./helpers/contract-test-helpers")

const { deployMockContract } = require("@ethereum-waffle/mock-contract")
const IDeposit = require("../artifacts/contracts/RiskManagerV1.sol/IDeposit.json")

const depositLiquidationInProgressState = 10
const depositLiquidatedState = 11

describe("RiskManagerV1", () => {
  let testToken
  let owner
  let account1
  let auctioneer
  let riskManagerV1
  let mockIDeposit

  before(async () => {
    const TestToken = await ethers.getContractFactory("TestToken")
    testToken = await TestToken.deploy()
    await testToken.deployed()

    const Auctioneer = await ethers.getContractFactory("Auctioneer")
    auctioneer = await Auctioneer.deploy()
    await auctioneer.deployed()

    const RiskManagerV1 = await ethers.getContractFactory("RiskManagerV1")
    riskManagerV1 = await RiskManagerV1.deploy(
      testToken.address,
      auctioneer.address
    )
    await riskManagerV1.deployed()

    await auctioneer.transferOwnership(riskManagerV1.address)

    owner = await ethers.getSigner(0)
    account1 = await ethers.getSigner(1)

    mockIDeposit = await deployMockContract(owner, IDeposit.abi)
  })

  describe("notifyLiquidation", () => {
    context("when deposit is not in liquidation state", () => {
      it("should revert", async () => {
        await mockIDeposit.mock.currentState.returns(4) // Active state

        await expect(
          riskManagerV1.notifyLiquidation(mockIDeposit.address)
        ).to.be.revertedWith("Deposit is not in liquidation state")
      })
    })

    context("when deposit is in liquidation state", () => {
      it("should emit NotifiedLiquidation event", async () => {
        const tx = await notifyLiquidation()

        await expect(tx)
          .to.emit(riskManagerV1, "NotifiedLiquidation")
          .withArgs(account1.address, mockIDeposit.address)
      })

      it("should create an auction and populate auction's map", async () => {
        await notifyLiquidation()

        const createdAuctionAddress = await riskManagerV1.auctionsByDepositsInLiquidation(
          mockIDeposit.address
        )

        expect(createdAuctionAddress).to.be.properAddress
        expect(createdAuctionAddress).to.not.equal(ZERO_ADDRESS)
      })
    })
  })

  describe("notifyLiquidated", () => {
    context("when deposit is not in liquidated state", () => {
      it("should revert", async () => {
        await mockIDeposit.mock.currentState.returns(4) // Active state

        await expect(
          riskManagerV1.notifyLiquidated(mockIDeposit.address)
        ).to.be.revertedWith("Deposit is not in liquidated state")
      })
    })

    context("when deposit is in liquidated state", () => {
      it("should emit notified liquidated event", async () => {
        await notifyLiquidation()

        await mockIDeposit.mock.currentState.returns(depositLiquidatedState)

        await expect(
          riskManagerV1.connect(account1).notifyLiquidated(mockIDeposit.address)
        )
          .to.emit(riskManagerV1, "NotifiedLiquidated")
          .withArgs(account1.address, mockIDeposit.address)
      })

      it("should early close an auction", async () => {
        await notifyLiquidation()

        await mockIDeposit.mock.currentState.returns(depositLiquidatedState)

        const createdAuctionAddress = await riskManagerV1.auctionsByDepositsInLiquidation(
          mockIDeposit.address
        )

        await riskManagerV1
          .connect(account1)
          .notifyLiquidated(mockIDeposit.address)

        expect(
          await riskManagerV1.auctionsByDepositsInLiquidation(
            createdAuctionAddress
          )
        ).to.equal(ZERO_ADDRESS)
        expect(await auctioneer.openAuctions(createdAuctionAddress)).to.be.false
      })
    })
  })

  async function notifyLiquidation() {
    await mockIDeposit.mock.currentState.returns(
      depositLiquidationInProgressState
    )
    await mockIDeposit.mock.lotSizeTbtc.returns(to1e18(1))
    const tx = await riskManagerV1
      .connect(account1)
      .notifyLiquidation(mockIDeposit.address)
    return tx
  }
})
