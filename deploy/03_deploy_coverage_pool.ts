import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { getNamedAccounts, deployments, helpers } = hre
  const { deployer } = await getNamedAccounts()

  const AssetPool = await deployments.get("AssetPool")

  const CoveragePool = await deployments.deploy("CoveragePool", {
    from: deployer,
    args: [AssetPool.address],
    log: true,
    waitConfirmations: 1,
  })

  await helpers.ownable.transferOwnership(
    "AssetPool",
    CoveragePool.address,
    deployer
  )

  if (hre.network.tags.etherscan) {
    await helpers.etherscan.verify(CoveragePool)
  }

  if (hre.network.tags.tenderly) {
    await hre.tenderly.verify({
      name: "CoveragePool",
      address: CoveragePool.address,
    })
  }
}

export default func

func.tags = ["CoveragePool"]
func.dependencies = ["AssetPool"]
