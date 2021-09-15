import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { getNamedAccounts, deployments } = hre
  const { deployer } = await getNamedAccounts()

  const UniswapV2Router = await deployments.get("UniswapV2Router")
  const CoveragePool = await deployments.get("CoveragePool")

  const SignerBondsUniswapV2 = await deployments.deploy("SignerBondsUniswapV2", {
    from: deployer,
    args: [UniswapV2Router.address, CoveragePool.address],
    log: true,
  })

  if (hre.network.tags.etherscan) {
    await hre.ethers.provider.waitForTransaction(SignerBondsUniswapV2.transactionHash, 10, 900000)

    await hre.run("verify:verify", {
      address: SignerBondsUniswapV2.address,
      constructorArguments: [
        UniswapV2Router.address,
        CoveragePool.address,
      ],
      contract: "contracts/SignerBondsUniswapV2.sol:SignerBondsUniswapV2",
    })
  }
}

export default func

func.tags = ["SignerBondsUniswapV2"]
func.dependencies = ["UniswapV2Router", "CoveragePool"]
