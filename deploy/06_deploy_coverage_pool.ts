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

  await helpers.ownable.transferOwnership(
    "AssetPool",
    CoveragePool.address,
    deployer
  )

  if (hre.network.tags.etherscan) {
    await hre.ethers.provider.waitForTransaction(CoveragePool.transactionHash, 10, 900000)

    await hre.run("verify:verify", {
      address: CoveragePool.address,
      constructorArguments: [
        AssetPool.address,
      ],
      contract: "contracts/CoveragePool.sol:CoveragePool",
    })
  }
}

export default func

func.tags = ["CoveragePool"]
func.dependencies = ["AssetPool"]
