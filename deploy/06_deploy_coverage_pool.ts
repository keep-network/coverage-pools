import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { getNamedAccounts, deployments, helpers } = hre
  const { read, execute, log } = deployments
  const { deployer } = await getNamedAccounts()

  const AssetPool = await deployments.get("AssetPool")

  const CoveragePool = await deployments.deploy("CoveragePool", {
    from: deployer,
    args: [AssetPool.address],
    log: true,
  })

  if (
    helpers.address.equal(
      await read("AssetPool", "owner"),
      CoveragePool.address
    )
  ) {
    log(`transferring ownership of AssetPool to ${CoveragePool.address}`)

    await execute(
      "AssetPool",
      { from: deployer },
      "transferOwnership",
      CoveragePool.address
    )
  }

  if (
    helpers.address.equal(
      await read("UnderwriterToken", "owner"),
      AssetPool.address
    )
  ) {
    log(`transferring ownership of UnderwriterToken to ${AssetPool.address}`)

    await execute(
      "UnderwriterToken",
      { from: deployer },
      "transferOwnership",
      AssetPool.address
    )
  }
}

export default func

func.tags = ["CoveragePool"]
func.dependencies = ["AssetPool"]
