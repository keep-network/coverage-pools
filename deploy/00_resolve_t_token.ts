import { HardhatRuntimeEnvironment, HardhatNetworkConfig } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { getNamedAccounts, deployments, helpers } = hre
  const { log } = deployments
  const { deployer } = await getNamedAccounts()

  const T = await deployments.getOrNull("T")

  if (T && helpers.address.isValid(T.address)) {
    log(`using external T at ${T.address}`)
  } else if (
    hre.network.name !== "hardhat" ||
    (hre.network.config as HardhatNetworkConfig).forking.enabled
  ) {
    throw new Error("deployed T contract not found")
  } else {
    log(`deploying T stub`)

    await deployments.deploy("T", {
      contract: "TestToken",
      from: deployer,
      log: true,
    })
  }
}

export default func

func.tags = ["T"]
