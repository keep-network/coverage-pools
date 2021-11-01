import { HardhatRuntimeEnvironment, HardhatNetworkConfig } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { getNamedAccounts, deployments, helpers } = hre
  const { log } = deployments
  const { deployer } = await getNamedAccounts()

  const TToken = await deployments.getOrNull("TToken")

  if (TToken && helpers.address.isValid(TToken.address)) {
    log(`using external TToken at ${TToken.address}`)
  } else if (
    hre.network.name !== "hardhat" ||
    (hre.network.config as HardhatNetworkConfig).forking.enabled
  ) {
    throw new Error("deployed TToken contract not found")
  } else {
    log(`deploying TToken stub`)

    await deployments.deploy("TToken", {
      contract: "TestToken",
      from: deployer,
      log: true,
    })
  }
}

export default func

func.tags = ["TToken"]
