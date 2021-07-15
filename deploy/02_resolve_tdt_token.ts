import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { getNamedAccounts, deployments, helpers } = hre
  const { log } = deployments
  const { deployer } = await getNamedAccounts()

  const TBTCDepositToken = await deployments.getOrNull("TBTCDepositToken")

  if (TBTCDepositToken && helpers.address.isValid(TBTCDepositToken.address)) {
    log(`using external TBTCDepositToken at ${TBTCDepositToken.address}`)
  } else if (hre.network.name !== "hardhat") {
    throw new Error("deployed TBTCDepositToken contract not found")
  } else {
    log(`deploying TBTCDepositToken stub`)

    await deployments.deploy("TBTCDepositToken", {
      contract: "TBTCDepositTokenStub",
      from: deployer,
      log: true,
    })
  }
}

export default func

func.tags = ["TBTCDepositToken"]
