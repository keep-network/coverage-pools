import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { getNamedAccounts, deployments } = hre

  const { getOrNull, deploy, log } = deployments
  const { deployer } = await getNamedAccounts()

  const KeepToken = await getOrNull("KeepToken")

  if (KeepToken) {
    log(`using external KeepToken at ${KeepToken.address}`)
  } else if (hre.network.name !== "hardhat") {
    throw new Error("deployed KeepToken contract not found")
  } else {
    log(`deploying KeepToken stub`)

    await deploy("KeepToken", {
      contract: "TestToken",
      from: deployer,
      log: true,
    })
  }
}

export default func

func.tags = ["KeepToken"]
