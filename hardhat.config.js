require("@nomiclabs/hardhat-waffle")
require("@nomiclabs/hardhat-ethers")
require("hardhat-gas-reporter")
require("hardhat-deploy")
require("solidity-coverage")

module.exports = {
  solidity: {
    compilers: [
      {
        version: "0.8.4",
      },
    ],
  },
  paths: {
    artifacts: "./build",
  },
  networks: {
    hardhat: {
      forking: {
        // forking is enabled only if FORKING_URL env is provided
        enabled: !!process.env.FORKING_URL,
        // URL should point to a node with archival data (Alchemy recommended)
        url: process.env.FORKING_URL || "",
        // latest block is taken if FORKING_BLOCK env is not provided
        blockNumber:
          process.env.FORKING_BLOCK && parseInt(process.env.FORKING_BLOCK),
      },
      tags: ["local"],
    },
    development: {
      url: "http://localhost:8545",
      tags: ["local"],
    },
  },
  namedAccounts: {
    deployer: {
      default: 0, // take the first account as deployer
    },
    rewardManager: {
      default: 1,
    },
  },
  mocha: {
    timeout: 30000,
  },
}
