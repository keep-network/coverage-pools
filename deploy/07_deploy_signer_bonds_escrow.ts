import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { getNamedAccounts, deployments } = hre

  const { deploy } = deployments
  const { deployer } = await getNamedAccounts()

  await deploy("SignerBondsManualSwap", {
    from: deployer,
    log: true,
  })
}

export default func

func.tags = ["SignerBondsManualSwap"]
