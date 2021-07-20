import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { getNamedAccounts, deployments } = hre
  const { deployer } = await getNamedAccounts()

  await deployments.deploy("UnderwriterToken", {
    from: deployer,
    args: ["covKEEP underwriter token", "covKEEP"],
    log: true,
  })
}

export default func

func.tags = ["UnderwriterToken"]
