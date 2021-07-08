module.exports = async ({ getNamedAccounts, deployments }) => {
  const tbtcDepositTokenAddress = process.env.TBTC_DEPOSIT_TOKEN_ADDRESS
  const { deploy, save, log } = deployments
  const { deployer } = await getNamedAccounts()

  if (tbtcDepositTokenAddress) {
    log(
      `using externally provided TBTCDepositToken address ${tbtcDepositTokenAddress}`
    )

    // Save as simple deployment just to make it accessible for next scripts.
    await save("TBTCDepositToken", { address: tbtcDepositTokenAddress })
  } else if (hre.network.name !== "hardhat") {
    throw new Error("The TBTCDepositToken contract address is required!")
  } else {
    log(`using TBTCDepositToken stub`)

    await deploy("TBTCDepositToken", {
      contract: "TBTCDepositTokenStub",
      from: deployer,
      log: true,
    })
  }
}

module.exports.tags = ["TBTCDepositToken"]
