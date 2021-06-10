const { expect } = require("chai")
const {
  to1e18,
  increaseTime,
  to1ePrecision,
} = require("../helpers/contract-test-helpers")
const { deployMockContract } = require("@ethereum-waffle/mock-contract")
const Auction = require("../../artifacts/contracts/Auction.sol/Auction.json")
const ITBTCDepositToken = require("../../artifacts/contracts/RiskManagerV1.sol/ITBTCDepositToken.json")
const { BigNumber } = ethers

describe("Integration -- liquidation", () => {
  const auctionLength = 86400 // 24h
  const lotSize = to1e18(10)
  const bondedAmount = to1e18(150)
  const bondAuctionThreshold = 100
  const precision = to1ePrecision(1, 16) // 0.01

  let tbtcToken
  let collateralToken
  let underwriterToken
  let signerBondsSwapStrategy
  let assetPool
  let coveragePool
  let riskManagerV1
  let tbtcDeposit

  let owner
  let bidder
  let otherBidder
  let thirdParty
  let rewardsManager

  beforeEach(async () => {
    owner = await ethers.getSigner(0)
    bidder = await ethers.getSigner(1)
    otherBidder = await ethers.getSigner(2)
    thirdParty = await ethers.getSigner(3)
    rewardsManager = await ethers.getSigner(4)

    const TestToken = await ethers.getContractFactory("TestToken")
    tbtcToken = await TestToken.deploy()
    await tbtcToken.deployed()

    collateralToken = await TestToken.deploy()
    await collateralToken.deployed()

    // For brevity, use a mock tBTC deposit token contract and simulate
    // all deposits are legit.
    const mockTbtcDepositToken = await deployMockContract(
      owner,
      ITBTCDepositToken.abi
    )
    await mockTbtcDepositToken.mock.exists.returns(true)

    const SignerBondsSwapStrategy = await ethers.getContractFactory(
      "SignerBondsEscrow"
    )
    signerBondsSwapStrategy = await SignerBondsSwapStrategy.deploy()
    await signerBondsSwapStrategy.deployed()

    const UnderwriterToken = await ethers.getContractFactory("UnderwriterToken")
    underwriterToken = await UnderwriterToken.deploy("Coverage KEEP", "covKEEP")
    await underwriterToken.deployed()

    const AssetPool = await ethers.getContractFactory("AssetPool")
    assetPool = await AssetPool.deploy(
      collateralToken.address,
      underwriterToken.address,
      rewardsManager.address
    )
    await assetPool.deployed()

    const CoveragePool = await ethers.getContractFactory("CoveragePool")
    coveragePool = await CoveragePool.deploy(assetPool.address)
    await coveragePool.deployed()
    await assetPool.transferOwnership(coveragePool.address)

    const Auction = await ethers.getContractFactory("Auction")

    const masterAuction = await Auction.deploy()
    await masterAuction.deployed()

    const RiskManagerV1 = await ethers.getContractFactory("RiskManagerV1")
    riskManagerV1 = await RiskManagerV1.deploy(
      tbtcToken.address,
      mockTbtcDepositToken.address,
      coveragePool.address,
      signerBondsSwapStrategy.address,
      masterAuction.address,
      auctionLength,
      bondAuctionThreshold
    )
    await riskManagerV1.deployed()
    await coveragePool.approveFirstRiskManager(riskManagerV1.address)

    const DepositStub = await ethers.getContractFactory("DepositStub")
    tbtcDeposit = await DepositStub.deploy(tbtcToken.address, lotSize)
    await tbtcDeposit.deployed()
    await tbtcDeposit.setAuctionValue(bondedAmount)

    await owner.sendTransaction({
      to: tbtcDeposit.address,
      value: bondedAmount,
    })

    await tbtcToken.mint(bidder.address, lotSize)
    await tbtcToken.mint(otherBidder.address, lotSize)
    await tbtcToken.mint(thirdParty.address, lotSize)
    await collateralToken.mint(assetPool.address, to1e18(100))
  })

  describe("when auction fully filled before auction length elapsed", () => {
    let auction
    let tx

    beforeEach(async () => {
      auction = await prepareAuction()
      increaseTime((auctionLength * 15) / 100) // Wait 15% of auction length
      tx = await auction.connect(bidder).takeOffer(lotSize)
    })

    it("should close auction", async () => {
      expect(await auction.isOpen()).to.be.false
    })

    it("should liquidate the deposit", async () => {
      // Auction bidder has spend their TBTC
      expect(await tbtcToken.balanceOf(bidder.address)).to.equal(0)
      // Deposit has been liquidated
      expect(await tbtcDeposit.currentState()).to.equal(11) // LIQUIDATED
    })

    it("should swap signer bonds", async () => {
      await expect(tx).to.changeEtherBalance(riskManagerV1, 0)
      await expect(tx).to.changeEtherBalance(
        signerBondsSwapStrategy,
        bondedAmount
      )
    })

    it("should transfer collateral tokens to bidder", async () => {
      expect(await collateralToken.balanceOf(bidder.address)).to.be.closeTo(
        to1e18(15),
        precision
      )
      expect(await collateralToken.balanceOf(assetPool.address)).to.be.closeTo(
        to1e18(85),
        precision
      )
    })
  })

  describe("when auction fully filled after auction length elapsed", () => {
    let auction
    let tx

    beforeEach(async () => {
      auction = await prepareAuction()
      increaseTime(auctionLength) // Wait the whole auction length
      tx = await auction.connect(bidder).takeOffer(lotSize)
    })

    it("should close auction", async () => {
      expect(await auction.isOpen()).to.be.false
    })

    it("should liquidate the deposit", async () => {
      // Auction bidder has spend their TBTC
      expect(await tbtcToken.balanceOf(bidder.address)).to.equal(0)
      // Deposit has been liquidated
      expect(await tbtcDeposit.currentState()).to.equal(11) // LIQUIDATED
    })

    it("should swap signer bonds", async () => {
      await expect(tx).to.changeEtherBalance(riskManagerV1, 0)
      await expect(tx).to.changeEtherBalance(
        signerBondsSwapStrategy,
        bondedAmount
      )
    })

    it("should transfer collateral tokens to bidder", async () => {
      expect(await collateralToken.balanceOf(bidder.address)).to.be.equal(
        to1e18(100)
      )
      expect(await collateralToken.balanceOf(assetPool.address)).to.be.equal(0)
    })
  })

  describe("when auction fully filled with multiple take offers", () => {
    let auction
    let tx

    beforeEach(async () => {
      auction = await prepareAuction()
      await tbtcToken.connect(otherBidder).approve(auction.address, lotSize)

      // Step 1: wait 5% of auction length (4320s) and take 40% of amount
      // (4 * 10^18) on auction with bidder (amountToTransfer)

      // Parameters needed for calculation:
      // auctionLength = 86400
      // amountOutstanding = 10 * 10^18 (amount that is left on auction)
      // startTimeOffset = 0 (initial value)
      // velocityPoolDepletingRate = 1.0 (initial value)
      // amountOnOffer = (timeSinceAuctionStart - startTimeOffset)
      //   * velocityPoolDepletingRate / auctionLength =
      //   (4320 - 0) * 1.0 / 86400 = 0.05
      // portionToSeize = amountOnOffer * amountToTransfer / amountOutstanding =
      //   0.05 * (4 * 10^18) / (10 * 10^18 ) = 0.02
      // amountInAssetPool = 100 * 10^18
      // amountToSeize = amountInAssetPool * portionToSeize =
      //   (100 * 10^18) * 0.02 = 2 * 10^18
      // Bidder should receive (2 * 10^18) of collateral tokens
      increaseTime((auctionLength * 5) / 100) // 4320s
      await auction.connect(bidder).takeOffer(lotSize.mul(40).div(100)) // 10 * 10^18 * 40% = 4 * 10^18

      // Update of parameters:
      // timePassed = timeSinceAuctionStart - startTimeOffset = 4320 - 0 = 4320
      //    (time passed since the auction start or the last takeOffer call)
      // ratioAmountPaid = amountToTransfer / amountOutstanding =
      //    (4 * 10^18) / (10 * 10^18) = 0.4
      // startTimeOffset = startTimeOffset + (timePassed * ratioAmountPaid) =
      //    0 + (4320 * 0.4) = 1728
      // amountOutstanding = amountOutstanding - amountToTransfer =
      //    (10 * 10^18) - (4 * 10^18) = 6 * 10^18
      // velocityPoolDepletingRate = auctionLength / (auctionLength - startTimeOffset) =
      //    86400 / (86400 - 1728) = 1.020408

      // Step 2: Wait additional 60% of auction length (51840s) and take 10% of
      // amount on auction (1 * 10^18) with other bidder

      // Parameters needed for calculation:
      // auctionLength = 86400
      // amountOutstanding = 6 * 10^18 (amount that is left on auction)
      // startTimeOffset = 1728
      // velocityPoolDepletingRate = 1.020408
      // amountOnOffer = (timeSinceAuctionStart - startTimeOffset)
      //   * velocityPoolDepletingRate / auctionLength =
      //   (4320 + 51840 - 1728) * 1.020408 / 86400 = 0.642857
      // portionToSeize = amountOnOffer * amountToTransfer / amountOutstanding =
      //   0.642857 * (1 * 10^18) / (6 * 10^18) = 0.1071428
      // amountInAssetPool = 98 * 10^18
      // amountToSeize = amountInAssetPool * portionToSeize =
      //   (98 * 10^18) * 0.1071428 = 10.4999944 * 10^18
      // Other bidder should receive (10.4999944 * 10^18) of collateral tokens
      increaseTime((auctionLength * 60) / 100) // 51840s
      await auction.connect(otherBidder).takeOffer(lotSize.mul(10).div(100)) // 1 * 10^18

      // Update of parameters:
      // timePassed = timeSinceAuctionStart - startTimeOffset
      //    = 4320 + 51840 - 1728 = 54432
      //    (time passed since the auction start or the last takeOffer call)
      // ratioAmountPaid = amountToTransfer / amountOutstanding =
      //    (1 * 10^18) / (6 * 10^18) = 0.166667
      // startTimeOffset = startTimeOffset + (timePassed * ratioAmountPaid) =
      //    1728 + (54432 * 0.166667) = 10800
      // amountOutstanding = amountOutstanding - amountToTransfer =
      //    (6 * 10^18) - (1 * 10^18) = 5 * 10^18
      // velocityPoolDepletingRate = auctionLength /
      //    (auctionLength - startTimeOffset) =
      //    86400 / (86400 - 10800) = 1.142857

      // Step 3: Wait till auction length elapsed (30240s) and take all
      // remaining amount on auction (5 * 10^18) with bidder

      // Parameters needed for calculation:
      // auctionLength = 86400
      // amountOutstanding = 5 * 10^18 (amount that is left on auction)
      // startTimeOffset = 10800
      // velocityPoolDepletingRate = 1.142857
      // amountOnOffer = (timeSinceAuctionStart - startTimeOffset)
      //   * velocityPoolDepletingRate / auctionLength =
      //   (4320 + 51840 + 30240 - 10800) * 1.142857 / 86400 = 1
      // portionToSeize = amountOnOffer * amountToTransfer / amountOutstanding =
      //   1 * (5 * 10^18) / (5 * 10^18) = 1
      // amountInAssetPool = 87.5000056 * 10^18
      // amountToSeize = amountInAssetPool * portionToSeize =
      //   (87.5000056 * 10^18) * 1 = (87.5000056 * 10^18)
      // Bidder should receive (87.5000056 * 10^18) of collateral tokens
      increaseTime((auctionLength * 35) / 100) // 30240s
      tx = await auction.connect(bidder).takeOffer(lotSize.mul(50).div(100))
    })

    it("should transfer collateral tokens to bidders", async () => {
      expect(await collateralToken.balanceOf(bidder.address)).to.be.closeTo(
        BigNumber.from("89500005600000000000"),
        precision
      ) // (87.5000056 + 2) * 10^18
      expect(
        await collateralToken.balanceOf(otherBidder.address)
      ).to.be.closeTo(BigNumber.from("10499994400000000000"), precision) // (10.4999944 * 10^18)
      expect(await collateralToken.balanceOf(assetPool.address)).to.be.equal(0)
    })

    it("should close auction", async () => {
      expect(await auction.isOpen()).to.be.false
    })

    it("should liquidate the deposit", async () => {
      // Auction bidder has spend 90% of their tBTC, so 10% remains
      expect(await tbtcToken.balanceOf(bidder.address)).to.equal(
        lotSize.mul(10).div(100)
      )

      // Other auction bidder has spend 10% of their tBTC, so 90% remains
      expect(await tbtcToken.balanceOf(otherBidder.address)).to.equal(
        lotSize.mul(90).div(100)
      )

      // Deposit has been liquidated
      expect(await tbtcDeposit.currentState()).to.equal(11) // LIQUIDATED
    })

    it("should swap signer bonds", async () => {
      await expect(tx).to.changeEtherBalance(riskManagerV1, 0)
      await expect(tx).to.changeEtherBalance(
        signerBondsSwapStrategy,
        bondedAmount
      )
    })
  })

  describe("when deposit has been liquidated by someone else", () => {
    let auction
    beforeEach(async () => {
      auction = await prepareAuction()
      // simulate deposit state change outside Coverage Pools
      await tbtcToken.connect(thirdParty).approve(tbtcDeposit.address, lotSize)
      await tbtcDeposit.connect(thirdParty).purchaseSignerBondsAtAuction()
    })

    it("should revert", async () => {
      await expect(auction.takeOffer(lotSize.div(2))).to.be.revertedWith(
        "Deposit liquidation is not in progress"
      )
    })
  })

  async function prepareAuction() {
    await tbtcDeposit.notifyUndercollateralizedLiquidation()
    await riskManagerV1.notifyLiquidation(tbtcDeposit.address)

    const auctionAddress = await riskManagerV1.depositToAuction(
      tbtcDeposit.address
    )
    const auction = new ethers.Contract(auctionAddress, Auction.abi, bidder)
    await tbtcToken.connect(bidder).approve(auction.address, lotSize)
    return auction
  }
})
