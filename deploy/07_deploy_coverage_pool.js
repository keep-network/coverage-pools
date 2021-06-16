module.exports = async ({ getNamedAccounts, deployments }) => {
  const { deploy } = deployments
  const { deployer } = await getNamedAccounts()
  const AssetPool = await deployments.get("AssetPool")

  await deploy("CoveragePool", {
    from: deployer,
    args: [AssetPool.address],
    log: true,
  })
}

module.exports.tags = ["CoveragePool"]
module.exports.dependencies = ["AssetPool"]
