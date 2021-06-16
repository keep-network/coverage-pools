module.exports = async ({ getNamedAccounts, deployments }) => {
  const { deploy } = deployments
  const { deployer, rewardManager } = await getNamedAccounts()
  const KeepToken = await deployments.get("KeepToken")
  const UnderwriterToken = await deployments.get("UnderwriterToken")

  await deploy("AssetPool", {
    from: deployer,
    args: [KeepToken.address, UnderwriterToken.address, rewardManager],
    log: true,
  })
}

module.exports.tags = ["AssetPool"]
module.exports.dependencies = ["KeepToken", "UnderwriterToken"]
