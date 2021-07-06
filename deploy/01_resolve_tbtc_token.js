module.exports = async ({ getNamedAccounts, deployments }) => {
  const tbtcTokenAddress = process.env.TBTC_TOKEN_ADDRESS
  const { deploy, save, log } = deployments
  const { deployer } = await getNamedAccounts()

  if (tbtcTokenAddress) {
    log(`using externally provided TBTCToken address ${tbtcTokenAddress}`)

    // Save as simple deployment just to make it accessible for next scripts.
    await save("TBTCToken", { address: tbtcTokenAddress })
  } else if (hre.network.name !== "local") {
    throw new Error("The TBTCToken contract address is required!")
  } else {
    log(`using TBTCToken stub`)

    await deploy("TBTCToken", {
      contract: "TestToken",
      from: deployer,
      log: true,
    })
  }
}

module.exports.tags = ["TBTCToken"]
