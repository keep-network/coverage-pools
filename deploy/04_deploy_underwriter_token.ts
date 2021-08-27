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

  const tags = hre.network.config.tags
  if (tags.includes("test") || tags.includes("mainnet")) {
    await hre.tenderly.verify({
      name: "UnderwriterToken",
      address: underwriterToken.address,
    })
  }
}

export default func

func.tags = ["UnderwriterToken"]
