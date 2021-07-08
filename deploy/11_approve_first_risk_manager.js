module.exports = async function ({ getNamedAccounts, deployments }) {
  const { read, execute, log } = deployments
  const { deployer } = await getNamedAccounts()
  const RiskManagerV1 = await deployments.get("RiskManagerV1")

  const isRiskManagerApproved = await read(
    "CoveragePool",
    "approvedRiskManagers",
    RiskManagerV1.address
  )

  if (!isRiskManagerApproved) {
    log(`approving first risk manager ${RiskManagerV1.address}`)

    await execute(
      "CoveragePool",
      { from: deployer },
      "approveFirstRiskManager",
      RiskManagerV1.address
    )
  } else {
    log(`risk manager ${RiskManagerV1.address} is already approved`)
  }
}

module.exports.tags = ["RiskManagerV1"]
module.exports.runAtTheEnd = true
