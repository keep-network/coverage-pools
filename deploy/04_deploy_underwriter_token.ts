import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { getNamedAccounts, deployments } = hre
  const { deployer } = await getNamedAccounts()

  const underwriterToken = await deployments.deploy("UnderwriterToken", {
    from: deployer,
    args: ["covKEEP underwriter token", "covKEEP"],
    log: true,
  })

  if (hre.network.name == "ropsten") {
    await hre.tenderly.persistArtifacts({
      name: "UnderwriterToken",
      address: underwriterToken.address,
    })

    await hre.tenderly.verify({
      name: "UnderwriterToken",
      address: underwriterToken.address,
    })
  }
}

export default func

func.tags = ["UnderwriterToken"]
