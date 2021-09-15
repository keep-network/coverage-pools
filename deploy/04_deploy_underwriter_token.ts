import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { getNamedAccounts, deployments } = hre
  const { deployer } = await getNamedAccounts()

  const UnderwriterToken = await deployments.deploy("UnderwriterToken", {
    from: deployer,
    args: ["covKEEP underwriter token", "covKEEP"],
    log: true,
  })

  if (hre.network.tags.etherscan) {
    await hre.ethers.provider.waitForTransaction(UnderwriterToken.transactionHash, 10, 900000)

    await hre.run("verify:verify", {
      address: UnderwriterToken.address,
      constructorArguments: [
        "covKEEP underwriter token",
        "covKEEP",
      ],
      contract: "contracts/UnderwriterToken.sol:UnderwriterToken",
    })
  }
}

export default func

func.tags = ["UnderwriterToken"]
