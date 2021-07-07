module.exports = async ({ getNamedAccounts, deployments }) => {
  const { deploy, getArtifact, log, save } = deployments
  const { deployer, rewardManager } = await getNamedAccounts()
  const KeepToken = await deployments.get("KeepToken")
  const UnderwriterToken = await deployments.get("UnderwriterToken")
  const RewardsPool = await getArtifact("RewardsPool")

  const AssetPool = await deploy("AssetPool", {
    from: deployer,
    args: [KeepToken.address, UnderwriterToken.address, rewardManager],
    log: true,
  })

  const assetPool = await ethers.getContractAt("AssetPool", AssetPool.address)
  const rewardsPoolAddress = await assetPool.rewardsPool()

  // The`RewardsPool` contract is created in the `AssetPool` constructor so
  // it's created in the same transaction.
  const receipt = AssetPool.receipt
  receipt.contractAddress = rewardsPoolAddress

  const rewardsPoolDeplymentArtifact = Object.assign(
    {
      address: rewardsPoolAddress,
      receipt,
      transactionHash: AssetPool.transactionHash,
    },
    RewardsPool
  )

  log("The RewardsPool has been deployed in the same transacion as AssetPool.")
  log(
    `The RewardsPool address is: ${rewardsPoolAddress} - saving the RewardsPool deployments info.`
  )

  await save("RewardsPool", rewardsPoolDeplymentArtifact)
}

module.exports.tags = ["AssetPool"]
module.exports.dependencies = ["KeepToken", "UnderwriterToken"]
