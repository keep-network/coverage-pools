import { HardhatUserConfig } from "hardhat/config"

// TODO: Output deployment artifacts to `./artifacts` directory (copy from ./deployments/<network> to ./artifacts)
import "@keep-network/hardhat-helpers"
import "@nomiclabs/hardhat-waffle"
import "@nomiclabs/hardhat-ethers"
import "hardhat-gas-reporter"
import "hardhat-deploy"
import "solidity-coverage"

import { RopstenSecrets, MainnetSecrets } from "./.hardhat/secrets"

const config: HardhatUserConfig = {
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
    ropsten: {
      url: RopstenSecrets.url,
      chainId: 3,
      from: RopstenSecrets.address,
      accounts: [RopstenSecrets.privateKey],
    },
    mainnet: {
      url: MainnetSecrets.url,
      chainId: 1,
      from: MainnetSecrets.address,
      accounts: [MainnetSecrets.privateKey],
    },
  },
  external: {
    contracts: [
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
      // For development environment we expect the local dependencies to be linked
      // with `yarn link` command.
      development: [
        "node_modules/@keep-network/keep-core/artifacts",
        "node_modules/@keep-network/tbtc/artifacts",
      ],
      ropsten: [
        "node_modules/@keep-network/keep-core/artifacts",
        "node_modules/@keep-network/tbtc/artifacts",
        "./external/ropsten",
      ],
    },
  },
  namedAccounts: {
    deployer: {
      default: 0, // take the first account as deployer
      ropsten: RopstenSecrets.address,
      mainnet: MainnetSecrets.address,
    },
    rewardManager: {
      default: 1,
      mainnet: "0xB3726E69Da808A689F2607939a2D9E958724FC2A", // Technical Wallet // TODO: Technical wallet or rewards manager?
    },
    keepCommunityMultiSig: {
      mainnet: "0x19FcB32347ff4656E4E6746b4584192D185d640d",
    },
  },
  mocha: {
    timeout: 30000,
  },
}

export default config
