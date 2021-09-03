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
  })

  if (hre.network.tags.tenderly) {
    await hre.tenderly.verify({
      name: "CoveragePool",
      address: CoveragePool.address,
    })
  }

  await helpers.ownable.transferOwnership(
    "AssetPool",
    CoveragePool.address,
    deployer
  )
}

export default func

func.tags = ["CoveragePool"]
func.dependencies = ["AssetPool"]
