const { contracts } = require("@keep-network/common.js")
const { readExternalContractAddress } = contracts
const AssetPool = artifacts.require("./AssetPool.sol")
const UnderwriterToken = artifacts.require("./UnderwriterToken.sol")

module.exports = async function (deployer, network, accounts) {
  const rewardManager = accounts[0]
  const KeepTokenAddress = readExternalContractAddress(
    "@keep-network/keep-core",
    "KeepToken",
    deployer
  )

  await deployer.deploy(UnderwriterToken, "Underwriter Token", "COV")
  const underwriterToken = await UnderwriterToken.deployed()

  await deployer.deploy(
    AssetPool,
    KeepTokenAddress,
    underwriterToken.address,
    rewardManager
  )
}
