module.exports = async ({ getNamedAccounts, deployments }) => {
  const uniswapV2RouterAddress = process.env.UNISWAP_V2_ROUTER_ADDRESS
  const { deploy, save, log } = deployments
  const { deployer } = await getNamedAccounts()

  if (uniswapV2RouterAddress) {
    log(
      `using externally provided UniswapV2Router address ${uniswapV2RouterAddress}`
    )

    // Save as simple deployment just to make it accessible for next scripts.
    await save("UniswapV2Router", { address: uniswapV2RouterAddress })
  } else if (!hre.network.tags.local) {
    throw new Error("The UniswapV2Router contract address is required!")
  } else {
    log(`using UniswapV2Router stub`)

    await deploy("UniswapV2Router", {
      contract: "UniswapV2RouterStub",
      from: deployer,
      log: true,
    })
  }
}

module.exports.tags = ["UniswapV2Router"]
