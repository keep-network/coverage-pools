module.exports = {
  networks: {
    local: {
      host: "localhost",
      port: 8545,
      network_id: "*",
      websockets: true,
    },
  },
  compilers: {
    solc: {
      version: "0.7.6", // Fetch exact version from solc-bin (default: truffle's version)
    },
  },
}
