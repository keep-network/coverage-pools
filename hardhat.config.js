require("@nomiclabs/hardhat-waffle")
require("hardhat-gas-reporter")
require("hardhat-deploy")

module.exports = {
  solidity: {
    version: "0.7.6",
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
    },
    local: {
      url: "http://localhost:8545",
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
}
