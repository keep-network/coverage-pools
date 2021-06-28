require("@nomiclabs/hardhat-waffle")
require("hardhat-gas-reporter")
require("solidity-coverage")

module.exports = {
  solidity: {
    compilers: [
      {
        version: "0.8.4",
      },
    ],
  },

  networks: {
    hardhat: {
      forking: {
        // forking is enabled only if FORKING_BLOCK is provided (i.e. resetFork was called)
        enabled: !!process.env.FORKING_BLOCK,
        // URL should point to a node with archival data (Alchemy recommended)
        url: process.env.FORKING_URL || "",
        // latest block is taken if FORKING_BLOCK env is not provided
        blockNumber:
          process.env.FORKING_BLOCK && parseInt(process.env.FORKING_BLOCK),
      },
    },
  },
  mocha: {
    timeout: 30000,
  },
}
