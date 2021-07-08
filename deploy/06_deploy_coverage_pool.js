module.exports = async ({ getNamedAccounts, deployments }) => {
  const { deploy, read, execute } = deployments
  const { deployer } = await getNamedAccounts()
  const AssetPool = await deployments.get("AssetPool")

  const CoveragePool = await deploy("CoveragePool", {
    from: deployer,
    args: [AssetPool.address],
    log: true,
  })

  if ((await read("AssetPool", "owner")) !== CoveragePool.address) {
    log(`transferring ownership of AssetPool to ${CoveragePool.address}`)

    await execute(
      "AssetPool",
      { from: deployer },
      "transferOwnership",
      CoveragePool.address
    )
  }

  if ((await read("UnderwriterToken", "owner")) !== AssetPool.address) {
    log(`transferring ownership of UnderwriterToken to ${AssetPool.address}`)

    await execute(
      "UnderwriterToken",
      { from: deployer },
      "transferOwnership",
      AssetPool.address
    )
  }
}

module.exports.tags = ["CoveragePool"]
module.exports.dependencies = ["AssetPool"]
