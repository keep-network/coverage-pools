module.exports = async ({ getNamedAccounts, deployments }) => {
  const { deploy } = deployments
  const { deployer } = await getNamedAccounts()

  await deploy("UnderwriterToken", {
    from: deployer,
    args: ["Coverage KEEP", "covKEEP"],
    log: true,
  })
}

module.exports.tags = ["UnderwriterToken"]
