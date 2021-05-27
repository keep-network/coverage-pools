const chai = require("chai")

const expect = chai.expect
const { to1ePrecision, to1e18 } = require("./helpers/contract-test-helpers")

const { deployMockContract } = require("@ethereum-waffle/mock-contract")
const AuctionJSON = require("../artifacts/contracts/Auction.sol/Auction.json")
const CoveragePoolJSON = require("../artifacts/contracts/CoveragePool.sol/CoveragePool.json")

const { BigNumber } = ethers

describe("AuctionBidder", () => {
  let owner

  let mockAuction
  let mockCoveragePool
  let auctionBidder

  before(async () => {
    owner = await ethers.getSigner(0)
    bidder = await ethers.getSigner(1)

    mockAuction = await deployMockContract(owner, AuctionJSON.abi)
    mockCoveragePool = await deployMockContract(owner, CoveragePoolJSON.abi)

    const AuctionBidder = await ethers.getContractFactory("AuctionBidder")
    auctionBidder = await AuctionBidder.deploy(mockCoveragePool.address)
  })

  describe("takeOfferWithMin", () => {
    const divisor = 1000
    const amountOnOffer = 100 // 100 / 1000 * 100% = 10%

    const amount = to1ePrecision(5, 17)
    const auctionAmountOutstanding = to1e18(1)

    // 100 * (5 * 10**17) / (1 * 10**18) = 50
    const portionToSeize = 50 // out of 100

    const minAmountToSeize = to1ePrecision(5, 10)

    beforeEach(async () => {
      await mockAuction.mock.amountOutstanding.returns(auctionAmountOutstanding)
      await mockAuction.mock.onOffer.returns(amountOnOffer, divisor) // 10% of the cov pool
    })

    context(
      "when an amount to be seized is equal to a minimal desired amount to seize",
      () => {
        it("should take an offer", async () => {
          const amountToSeize = to1ePrecision(5, 10) // 5 * 10**10

          await mockCoveragePool.mock.amountToSeize
            .withArgs(portionToSeize)
            .returns(amountToSeize)

          // This is a workouround until Hardhat starts supporting Waffle's
          // https://ethereum-waffle.readthedocs.io/en/latest/matchers.html#called-on-contract
          // https://github.com/nomiclabs/hardhat/issues/1135
          await mockAuction.mock.takeOffer
            .withArgs(amount)
            .revertsWithReason("takeOffer should be invoked")

          // Reverting here is just to check if takeOffer(amount) was called
          await expect(
            auctionBidder
              .connect(bidder)
              .takeOfferWithMin(mockAuction.address, amount, minAmountToSeize)
          ).to.be.revertedWith("takeOffer should be invoked")
        })
      }
    )

    context(
      "when an amount to be seized is greater than minimal desired amount to seize",
      () => {
        it("should take an offer", async () => {
          const amountToSeize = to1ePrecision(5, 10).add(BigNumber.from("1"))

          await mockCoveragePool.mock.amountToSeize
            .withArgs(portionToSeize)
            .returns(amountToSeize)

          // This is a workouround until Hardhat starts supporting Waffle's
          // https://ethereum-waffle.readthedocs.io/en/latest/matchers.html#called-on-contract
          // https://github.com/nomiclabs/hardhat/issues/1135
          await mockAuction.mock.takeOffer
            .withArgs(amount)
            .revertsWithReason("takeOffer should be invoked")

          // Reverting here is just to check if takeOffer(amount) was called
          await expect(
            auctionBidder
              .connect(bidder)
              .takeOfferWithMin(mockAuction.address, amount, minAmountToSeize)
          ).to.be.revertedWith("takeOffer should be invoked")
        })
      }
    )

    context(
      "when an amount to be seized is lower than minimal desired amount to seize",
      () => {
        it("should revert", async () => {
          const amountToSeize = to1ePrecision(5, 10).sub(BigNumber.from("1"))

          await mockCoveragePool.mock.amountToSeize
            .withArgs(portionToSeize)
            .returns(amountToSeize)

          await expect(
            auctionBidder
              .connect(bidder)
              .takeOfferWithMin(mockAuction.address, amount, minAmountToSeize)
          ).to.be.revertedWith(
            "Can't fulfill offer with a minimal amount to seize"
          )
        })
      }
    )
  })
})
