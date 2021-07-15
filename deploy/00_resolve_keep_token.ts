import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { getNamedAccounts, deployments, helpers } = hre
  const { log } = deployments
  const { deployer } = await getNamedAccounts()

  const KeepToken = await deployments.getOrNull("KeepToken")

  if (KeepToken && helpers.address.isValid(KeepToken.address)) {
    log(`using external KeepToken at ${KeepToken.address}`)
  } else if (hre.network.name !== "hardhat") {
    throw new Error("deployed KeepToken contract not found")
  } else {
    log(`deploying KeepToken stub`)

    await deployments.deploy("KeepToken", {
      contract: "TestToken",
      from: deployer,
      log: true,
    })
  }
}

export default func

func.tags = ["KeepToken"]
