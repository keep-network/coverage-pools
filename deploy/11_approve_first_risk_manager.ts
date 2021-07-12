import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { getNamedAccounts, deployments } = hre

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

export default func

func.tags = ["RiskManagerV1"]
func.runAtTheEnd = true
