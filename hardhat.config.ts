import { HardhatUserConfig } from 'hardhat/config'
import 'hardhat-typechain'

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: '0.8.0',
      },
      {
        version: '0.7.6',
      },
    ],
  },
  typechain: {
    target: 'ethers-v5',
  },
}

export default config
