module.exports = async ({ getNamedAccounts, deployments }) => {
  const { deploy } = deployments
  const { deployer, rewardManager } = await getNamedAccounts()
  const KeepToken = await deployments.get("KeepToken")
  const AssetPool = await deployments.get("AssetPool")

  await deploy("RewardsPool", {
    from: deployer,
    args: [KeepToken.address, AssetPool.address, rewardManager],
    log: true,
  })
}

module.exports.tags = ["RewardsPool"]
module.exports.dependencies = ["KeepToken", "AssetPool"]
