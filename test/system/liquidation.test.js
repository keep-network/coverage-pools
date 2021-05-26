const { expect } = require("chai")
const { BigNumber } = ethers
const {
  to1e18,
  impersonateAccount,
  resetFork,
} = require("../helpers/contract-test-helpers")
const Auction = require("../../artifacts/contracts/Auction.sol/Auction.json")

const describeFn =
  process.env.NODE_ENV === "system-test" ? describe : describe.skip

// This system test scenario checks the liquidation happy path. It is meant
// to be executed on Hardhat Network with mainnet forking enabled. At the start,
// the fork is being reset to the specific starting block which determines the
// initial test state. This test uses the real tBTC token contract and a
// deposit (https://allthekeeps.com/deposit/0x55d8b1dd88e60d12c81b5479186c15d07555db9d)
// which is ready to be liquidated at the starting block. The bidder which
// takes the offer is also a real account with actual tBTC balance. At the
// end of the scenario, the risk manager should liquidate the deposit successfully,
// and 66% of the deposit's bonded amount should land on the signer processor.
describeFn("System -- liquidation happy path", () => {
  const startingBlock = 12368838
  const tbtcTokenAddress = "0x8daebade922df735c38c80c7ebd708af50815faa"
  const depositAddress = "0x55d8b1dd88e60d12c81b5479186c15d07555db9d"
  const bidderAddress = "0xa0216ED2202459068a750bDf74063f677613DA34"
  const auctionLength = 86400 // 24h
  // deposit lot size is 5 BTC
  const lotSize = to1e18(5)
  // signers have bonded 290.81 ETH
  const bondedAmount = BigNumber.from("290810391624000000000")
  // 66% of the deposit is exposed on auction in the liquidation moment
  const bondedAmountPercentage = BigNumber.from("66")

  let tbtcToken
  let signerBondsSwapStrategy
  let coveragePool
  let riskManagerV1
  let tbtcDeposit

  let bidder

  before(async () => {
    await resetFork(startingBlock)

    tbtcToken = await ethers.getContractAt("IERC20", tbtcTokenAddress)

    const SignerBondsSwapStrategy = await ethers.getContractFactory(
      "SignerBondsEscrow"
    )
    signerBondsSwapStrategy = await SignerBondsSwapStrategy.deploy()
    await signerBondsSwapStrategy.deployed()

    const Auction = await ethers.getContractFactory("Auction")

    const masterAuction = await Auction.deploy()
    await masterAuction.deployed()

    const CoveragePoolStub = await ethers.getContractFactory("CoveragePoolStub")
    coveragePool = await CoveragePoolStub.deploy()
    await coveragePool.deployed()

    const RiskManagerV1 = await ethers.getContractFactory("RiskManagerV1")
    riskManagerV1 = await RiskManagerV1.deploy(
      tbtcToken.address,
      coveragePool.address,
      signerBondsSwapStrategy.address,
      masterAuction.address,
      auctionLength
    )
    await riskManagerV1.deployed()

    tbtcDeposit = await ethers.getContractAt("IDepositStub", depositAddress)

    bidder = await impersonateAccount(bidderAddress)
  })

  describe("when auction has been fully filled", () => {
    let auction
    let tx
    let bidderInitialBalance

    before(async () => {
      await tbtcDeposit.notifyRedemptionSignatureTimedOut()
      await riskManagerV1.notifyLiquidation(tbtcDeposit.address)

      const auctionAddress = await riskManagerV1.depositToAuction(
        tbtcDeposit.address
      )
      auction = new ethers.Contract(auctionAddress, Auction.abi, bidder)
      await tbtcToken.connect(bidder).approve(auction.address, lotSize)
      bidderInitialBalance = await tbtcToken.balanceOf(bidder.address)
      tx = await auction.takeOffer(lotSize)
    })

    it("should close auction", async () => {
      expect(await auction.isOpen()).to.be.false
    })

    it("should liquidate the deposit", async () => {
      // Auction bidder has spend their TBTC.
      const bidderCurrentBalance = await tbtcToken.balanceOf(bidder.address)
      expect(bidderInitialBalance.sub(bidderCurrentBalance)).to.equal(lotSize)

      // Deposit has been liquidated.
      expect(await tbtcDeposit.currentState()).to.equal(11) // LIQUIDATED
    })

    it("should swap signer bonds", async () => {
      // No funds should last on the risk manager contract.
      await expect(tx).to.changeEtherBalance(riskManagerV1, 0)

      // All funds should be moved to the signer bonds processor contract.
      await expect(tx).to.changeEtherBalance(
        signerBondsSwapStrategy,
        bondedAmount.mul(bondedAmountPercentage).div(100)
      )
    })

    it("should consume a reasonable amount of gas", async () => {
      await expect(parseInt(tx.gasLimit)).to.be.lessThan(435000)

      const txReceipt = await ethers.provider.getTransactionReceipt(tx.hash)
      await expect(parseInt(txReceipt.gasUsed)).to.be.lessThan(215000)
    })
  })
})