import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { getNamedAccounts, deployments, helpers } = hre
  const { deployer } = await getNamedAccounts()

  const T = await deployments.get("T")

  const BatchedPhasedEscrow = await deployments.deploy("BatchedPhasedEscrow", {
    contract: "BatchedPhasedEscrow",
    from: deployer,
    args: [T.address],
    log: true,
    waitConfirmations: 1,
  })

  if (hre.network.tags.etherscan) {
    await helpers.etherscan.verify(BatchedPhasedEscrow)
  }

  if (hre.network.tags.tenderly) {
    await hre.tenderly.verify({
      name: "BatchedPhasedEscrow",
      address: BatchedPhasedEscrow.address,
    })
  }
}

export default func

func.tags = ["BatchedPhasedEscrow"]
func.dependencies = ["T"]
func.skip = async function (hre: HardhatRuntimeEnvironment): Promise<boolean> {
  return hre.network.name !== "mainnet"
}
