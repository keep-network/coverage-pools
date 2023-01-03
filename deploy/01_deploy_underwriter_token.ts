import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { getNamedAccounts, deployments, helpers } = hre
  const { deployer } = await getNamedAccounts()

  const underwriterToken = await deployments.deploy("UnderwriterToken", {
    from: deployer,
    args: ["covT underwriter token", "covT"],
    log: true,
    waitConfirmations: 1,
  })

  if (hre.network.tags.etherscan) {
    await helpers.etherscan.verify(underwriterToken)
  }

  if (hre.network.tags.tenderly) {
    await hre.tenderly.verify({
      name: "UnderwriterToken",
      address: underwriterToken.address,
    })
  }
}

export default func

func.tags = ["UnderwriterToken"]
