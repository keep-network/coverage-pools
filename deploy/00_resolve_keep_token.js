module.exports = async ({ getNamedAccounts, deployments }) => {
  const keepTokenAddress = process.env.KEEP_TOKEN_ADDRESS

  if (keepTokenAddress) {
    const { save, log } = deployments

    log(`using externally provided KeepToken address ${keepTokenAddress}`)

    // Save as simple deployment just to make it accessible for next scripts.
    await save("KeepToken", { address: keepTokenAddress })
  } else {
    const { deploy } = deployments
    const { deployer } = await getNamedAccounts()

    await deploy("KeepToken", {
      contract: "TestToken",
      from: deployer,
      log: true,
    })
  }
}

module.exports.tags = ["KeepToken"]
