module.exports = async ({ getNamedAccounts, deployments }) => {
  const { getOrNull, deploy, log } = deployments
  const { deployer } = await getNamedAccounts()

  const TBTCToken = await getOrNull("TBTCToken")

  if (TBTCToken) {
    log(`using external TBTCToken at ${TBTCToken.address}`)
  } else if (hre.network.name !== "hardhat") {
    throw new Error("deployed TBTCToken contract not found")
  } else {
    log(`deploying TBTCToken stub`)

    await deploy("TBTCToken", {
      contract: "TestToken",
      from: deployer,
      log: true,
    })
  }
}

module.exports.tags = ["TBTCToken"]
