require("@nomiclabs/hardhat-waffle")
require("hardhat-gas-reporter")

module.exports = {
  solidity: {
    compilers: [
      {
        version: "0.5.17",
      },
      {
        version: "0.7.6",
      },
    ],
  },
}
