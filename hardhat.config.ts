import { HardhatUserConfig } from "hardhat/config"

import "@keep-network/hardhat-helpers"
import "@nomiclabs/hardhat-waffle"
import "@nomiclabs/hardhat-ethers"
import "hardhat-gas-reporter"
import "hardhat-deploy"
import "hardhat-dependency-compiler"
import "solidity-coverage"
import "@nomiclabs/hardhat-etherscan"
import "@tenderly/hardhat-tenderly"

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: "0.8.9",
      },
    ],
  },
  paths: {
    artifacts: "./build",
  },
  dependencyCompiler: {
    paths: ["@threshold-network/solidity-contracts/contracts/token/T.sol"],
    keep: true,
  },
  networks: {
    hardhat: {
      forking: {
        // forking is enabled only if FORKING_URL env is provided
        enabled: !!process.env.FORKING_URL,
        // URL should point to a node with archival data (Alchemy recommended)
        url: process.env.FORKING_URL || "",
        // latest block is taken if FORKING_BLOCK env is not provided
        blockNumber: process.env.FORKING_BLOCK
          ? parseInt(process.env.FORKING_BLOCK)
          : undefined,
      },
      tags: ["local"],
    },
    development: {
      url: "http://localhost:8545",
      chainId: 1101,
      tags: ["local"],
    },
    sepolia: {
      url: process.env.CHAIN_API_URL || "",
      chainId: 11155111,
      accounts: process.env.ACCOUNTS_PRIVATE_KEYS
        ? process.env.ACCOUNTS_PRIVATE_KEYS.split(",")
        : undefined,
      tags: ["etherscan", "tenderly"],
    },
    mainnet: {
      url: process.env.CHAIN_API_URL || "",
      chainId: 1,
      accounts: process.env.CONTRACT_OWNER_ACCOUNT_PRIVATE_KEY
        ? [process.env.CONTRACT_OWNER_ACCOUNT_PRIVATE_KEY]
        : undefined,
      tags: ["etherscan", "tenderly"],
    },
  },
  tenderly: {
    username: "thesis",
    project: "",
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY,
  },
  external: {
    contracts: [
      {
        artifacts:
          "node_modules/@threshold-network/solidity-contracts/artifacts",
      },
      {
        artifacts: "node_modules/@keep-network/keep-core/artifacts",
        // Example if we want to use deployment scripts from external package:
        // deploy: "node_modules/@keep-network/keep-core/deploy",
      },
      {
        artifacts: "node_modules/@keep-network/tbtc/artifacts",
      },
    ],
    deployments: {
      // For hardhat environment we can fork the mainnet, so we need to point it
      // to the contract artifacts.
      // hardhat: ["./external/mainnet-v2"],
      // For development environment we expect the local dependencies to be linked
      // with `yarn link` command.
      development: [
        "node_modules/@threshold-network/solidity-contracts/artifacts",
        "node_modules/@keep-network/keep-core/artifacts",
        "node_modules/@keep-network/tbtc/artifacts",
      ],
      sepolia: [
        "node_modules/@threshold-network/solidity-contracts/artifacts",
        "node_modules/@keep-network/keep-core/artifacts",
        "node_modules/@keep-network/tbtc/artifacts",
        "./external/sepolia",
      ],
      mainnet: ["./external/mainnet-v2"],
    },
  },
  namedAccounts: {
    deployer: {
      default: 0, // take the first account as deployer
    },
    rewardManager: {
      default: 1,
      sepolia: 0, // use deployer account
      mainnet: 0, // use deployer account
    },
    thresholdCouncil: {
      default: 2,
      sepolia: 0, // use deployer account
      mainnet: "0x9f6e831c8f8939dc0c830c6e492e7cef4f9c2f5f",
    },
    treasuryGuild: {
      default: 3,
      sepolia: 0, // use deployer account
      mainnet: "0x71E47a4429d35827e0312AA13162197C23287546",
    },
  },
  mocha: {
    timeout: 30000,
  },
}

export default config
