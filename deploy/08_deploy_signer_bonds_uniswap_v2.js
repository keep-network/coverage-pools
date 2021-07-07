module.exports = async ({ getNamedAccounts, deployments }) => {
  const { deploy } = deployments
  const { deployer } = await getNamedAccounts()
  const UniswapV2Router = await deployments.get("UniswapV2Router")
  const CoveragePool = await deployments.get("CoveragePool")

  await deploy("SignerBondsUniswapV2", {
    from: deployer,
    args: [UniswapV2Router.address, CoveragePool.address],
    log: true,
  })
}

module.exports.tags = ["SignerBondsUniswapV2"]
module.exports.dependencies = ["UniswapV2Router", "CoveragePool"]
