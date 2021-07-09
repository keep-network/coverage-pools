module.exports = async ({ getNamedAccounts, deployments }) => {
  const { deploy, read, execute, log } = deployments
  const { deployer } = await getNamedAccounts()
  const AssetPool = await deployments.get("AssetPool")

  const CoveragePool = await deploy("CoveragePool", {
    from: deployer,
    args: [AssetPool.address],
    log: true,
  })

  if (
    ethers.utils.getAddress(await read("AssetPool", "owner")) !==
    ethers.utils.getAddress(CoveragePool.address)
  ) {
    log(`transferring ownership of AssetPool to ${CoveragePool.address}`)

    await execute(
      "AssetPool",
      { from: deployer },
      "transferOwnership",
      CoveragePool.address
    )
  }

  if (
    ethers.utils.getAddress(await read("UnderwriterToken", "owner")) !==
    ethers.utils.getAddress(AssetPool.address)
  ) {
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
