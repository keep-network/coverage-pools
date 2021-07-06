module.exports = async ({ getNamedAccounts, deployments }) => {
  const keepTokenAddress = process.env.KEEP_TOKEN_ADDRESS
  const { deploy, save, log } = deployments
  const { deployer } = await getNamedAccounts()

  if (keepTokenAddress) {
    log(`using externally provided KeepToken address ${keepTokenAddress}`)

    // Save as simple deployment just to make it accessible for next scripts.
    await save("KeepToken", { address: keepTokenAddress })
  } else if (hre.network.name !== "local") {
    throw new Error("The KeepToken contract address is required!")
  } else {
    log(`using KeepToken stub`)

    await deploy("KeepToken", {
      contract: "TestToken",
      from: deployer,
      log: true,
    })
  }
}

module.exports.tags = ["KeepToken"]
