module.exports = async ({ getNamedAccounts, deployments }) => {
  const { getOrNull, deploy, log } = deployments
  const { deployer } = await getNamedAccounts()

  const UniswapV2Router = await getOrNull("UniswapV2Router")

  if (UniswapV2Router) {
    log(`using external UniswapV2Router at ${UniswapV2Router.address}`)
  } else if (!hre.network.tags.local) {
    throw new Error("deployed UniswapV2Router contract not found")
  } else {
    // For any network tagged as `local` we want to deploy a stub if external
    // artifact is not found.
    log(`deploying UniswapV2Router stub`)

    await deploy("UniswapV2Router", {
      contract: "UniswapV2RouterStub",
      from: deployer,
      log: true,
    })
  }
}

module.exports.tags = ["UniswapV2Router"]
