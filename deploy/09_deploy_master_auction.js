module.exports = async ({ getNamedAccounts, deployments }) => {
  const { deploy } = deployments
  const { deployer } = await getNamedAccounts()

  await deploy("MasterAuction", {
    contract: "Auction",
    from: deployer,
    log: true,
  })
}

module.exports.tags = ["MasterAuction"]
