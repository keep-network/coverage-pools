module.exports = async function ({ getNamedAccounts, deployments }) {
  const { execute, log } = deployments
  const { deployer } = await getNamedAccounts()
  const RiskManagerV1 = await deployments.get("RiskManagerV1")

  log(`approving first risk manager ${RiskManagerV1.address}`)

  await execute(
    "CoveragePool",
    { from: deployer },
    "approveFirstRiskManager",
    RiskManagerV1.address
  )
}

module.exports.tags = ["RiskManagerV1"]
module.exports.runAtTheEnd = true
