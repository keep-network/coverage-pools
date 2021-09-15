import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { getNamedAccounts, deployments } = hre
  const { deployer } = await getNamedAccounts()

  const SignerBondsManualSwap = await deployments.deploy("SignerBondsManualSwap", {
    from: deployer,
    log: true,
  })

  if (hre.network.tags.etherscan) {
    await hre.ethers.provider.waitForTransaction(SignerBondsManualSwap.transactionHash, 10, 900000)

    await hre.run("verify:verify", {
      address: SignerBondsManualSwap.address,
      contract: "contracts/SignerBondsManualSwap.sol:SignerBondsManualSwap",
    })
  }
}

export default func

func.tags = ["SignerBondsManualSwap"]
