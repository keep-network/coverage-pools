const UnderwriterTokenJSON =
  "artifacts/contracts/UnderwriterToken.sol/UnderwriterToken.json"
const AssetPoolJSON = "artifacts/contracts/AssetPool.sol/AssetPool.json"

async function deploy() {
  const keepTokenAddress = getEnv("KEEP_TOKEN_ADDRESS")
  const rewardManager = await ethers.getSigner(0)

  const underwriterToken = await deployContract(
    UnderwriterTokenJSON,
    "Coverage KEEP",
    "covKEEP"
  )

  await deployContract(
    AssetPoolJSON,
    keepTokenAddress,
    underwriterToken.address,
    rewardManager.address
  )
}

async function deployContract(contractJSONPath, ...constructorArgs) {
  const fs = require("fs")
  const contractJSON = JSON.parse(fs.readFileSync(contractJSONPath).toString())
  const contractName = contractJSON.contractName

  console.log(`Deploying ${contractName} contract...`)

  const factory = new ethers.ContractFactory(
    contractJSON.abi,
    contractJSON.bytecode,
    await ethers.getSigner(0)
  )
  const contract = await factory.deploy(...constructorArgs)
  const chainId = contract.deployTransaction.chainId
  const address = contract.address
  const transactionHash = (await contract.deployTransaction.wait())
    .transactionHash

  if (!contractJSON.networks) {
    contractJSON.networks = {}
  }

  contractJSON.networks[chainId] = {
    address,
    transactionHash,
  }

  fs.writeFileSync(contractJSONPath, JSON.stringify(contractJSON, null, 2))

  console.log(
    `Deployed ${contractName} contract ` +
      `at address ${address} with ` +
      `transaction ${transactionHash}\n`
  )

  return contract
}

function getEnv(envName) {
  const value = process.env[envName]

  if (!value) {
    throw new Error(`${envName} env not set`)
  }

  return value
}

deploy()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
