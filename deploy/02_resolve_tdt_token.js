module.exports = async ({ getNamedAccounts, deployments }) => {
  const { getOrNull, deploy, log } = deployments
  const { deployer } = await getNamedAccounts()

  const TBTCDepositToken = await getOrNull("TBTCDepositToken")

  if (TBTCDepositToken) {
    log(`using external TBTCDepositToken at ${TBTCDepositToken.address}`)
  } else if (hre.network.name !== "hardhat") {
    throw new Error("deployed TBTCDepositToken contract not found")
  } else {
    log(`deploying TBTCDepositToken stub`)

    await deploy("TBTCDepositToken", {
      contract: "TBTCDepositTokenStub",
      from: deployer,
      log: true,
    })
  }
}

module.exports.tags = ["TBTCDepositToken"]
