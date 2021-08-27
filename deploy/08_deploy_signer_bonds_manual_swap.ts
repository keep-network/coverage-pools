import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { getNamedAccounts, deployments } = hre
  const { deployer } = await getNamedAccounts()

  const signerBondsManualSwap = await deployments.deploy(
    "SignerBondsManualSwap",
    {
      from: deployer,
      log: true,
    }
  )

  const tags = hre.network.config.tags
  if (tags.includes("test") || tags.includes("mainnet")) {
    await hre.tenderly.verify({
      name: "SignerBondsManualSwap",
      address: signerBondsManualSwap.address,
    })
  }
}

export default func

func.tags = ["SignerBondsManualSwap"]
