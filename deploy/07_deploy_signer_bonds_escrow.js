module.exports = async ({ getNamedAccounts, deployments }) => {
  const { deploy } = deployments
  const { deployer } = await getNamedAccounts()

  await deploy("SignerBondsManualSwap", {
    from: deployer,
    log: true,
  })
}

module.exports.tags = ["SignerBondsManualSwap"]
