import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { getNamedAccounts, deployments, helpers } = hre
  const { log } = deployments
  const { deployer } = await getNamedAccounts()

  const UniswapV2Router = await deployments.getOrNull("UniswapV2Router")

  if (UniswapV2Router && helpers.address.isValid(UniswapV2Router.address)) {
    log(`using external UniswapV2Router at ${UniswapV2Router.address}`)
  } else if (!hre.network.tags.local) {
    throw new Error("deployed UniswapV2Router contract not found")
  } else {
    // For any network tagged as `local` we want to deploy a stub if external
    // artifact is not found.
    log(`deploying UniswapV2Router stub`)

    await deployments.deploy("UniswapV2Router", {
      contract: "UniswapV2RouterStub",
      from: deployer,
      log: true,
    })
  }
}

export default func

func.tags = ["UniswapV2Router"]
