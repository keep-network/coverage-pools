module.exports = async ({ getNamedAccounts, deployments }) => {
  const { deploy } = deployments
  const { deployer } = await getNamedAccounts()
  const AssetPool = await deployments.get("AssetPool")
  const UnderwriterToken = await deployments.get("UnderwriterToken")

  const CoveragePool = await deploy("CoveragePool", {
    from: deployer,
    args: [AssetPool.address],
    log: true,
  })

  const assetPool = await ethers.getContractAt("AssetPool", AssetPool.address)
  const underwriterToken = await ethers.getContractAt(
    "UnderwriterToken",
    UnderwriterToken.address
  )

  await assetPool.transferOwnership(CoveragePool.address)
  await underwriterToken.transferOwnership(AssetPool.address)
}

module.exports.tags = ["CoveragePool"]
module.exports.dependencies = ["AssetPool"]
