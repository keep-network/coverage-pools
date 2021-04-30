function to1ePrecision(n, precision) {
  const decimalMultiplier = ethers.BigNumber.from(10).pow(precision)
  return ethers.BigNumber.from(n).mul(decimalMultiplier)
}

function to1e18(n) {
  const decimalMultiplier = ethers.BigNumber.from(10).pow(18)
  return ethers.BigNumber.from(n).mul(decimalMultiplier)
}

// FIXME Retrieves past events. This is a workaround for a known issue described
// FIXME here: https://github.com/nomiclabs/hardhat/pull/1163
// FIXME The preferred way of getting events would be using listners:
// FIXME https://docs.ethers.io/v5/api/contract/contract/#Contract--events
function pastEvents(receipt, contract, eventName) {
  const events = []

  for (const log of receipt.logs) {
    if (log.address === contract.address) {
      const parsedLog = contract.interface.parseLog(log)
      if (parsedLog.name === eventName) {
        events.push(parsedLog)
      }
    }
  }

  return events
}

async function increaseTime(time) {
  const now = (await ethers.provider.getBlock("latest")).timestamp
  await ethers.provider.send("evm_setNextBlockTimestamp", [now + time])
  await ethers.provider.send("evm_mine")
}

async function impersonateContract(contractAddress, purseSigner) {
  // Make the required call against Hardhat Runtime Environment.
  await hre.network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [contractAddress],
  })

  // Fund contract account using a purse account in order to make transactions
  // using contract's account. Keep in mind the contract must have a receive
  // or fallback method to be funded successfully.
  await purseSigner.sendTransaction({
    to: contractAddress,
    value: ethers.utils.parseEther("1"),
  })

  // Return the contract account's signer.
  return await ethers.getSigner(contractAddress)
}

module.exports.to1ePrecision = to1ePrecision
module.exports.to1e18 = to1e18
module.exports.pastEvents = pastEvents
module.exports.increaseTime = increaseTime
module.exports.impersonateContract = impersonateContract

module.exports.ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"
