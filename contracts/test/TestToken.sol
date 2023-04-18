// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "../interfaces/ICollateralToken.sol";
import "@thesis/solidity-contracts/contracts/token/ERC20WithPermit.sol";

/// @title Test ERC-20 token
/// @dev Token with unlimited minting capacity. It does implement DAO-related
///      functions from ICollateralToken but with just a dummy code.
///      Implementation of DAO checkpoints is complex. Even if we used
///      `Checkpoints` contract from `threshold-network` here, it would require
///      implementation for `delegate(address delegator, address delegatee)` and
///      updating checkpoints in `beforeTokenTransfer(address from, address to, uint amount)`
///      of TestToken. Every time DAO related functions need to be tested, please
///      use real token with proper DAO implementation, such as `T`.
contract TestToken is ERC20WithPermit, ICollateralToken {
    mapping(address => address) public delegatee;

    /* solhint-disable-next-line no-empty-blocks */
    constructor() ERC20WithPermit("Test Token", "TT") {}

    function delegate(address _delegatee) external virtual {
        delegatee[msg.sender] = _delegatee;
    }

    function getPastVotes(address, uint256) external pure returns (uint96) {
        return 0;
    }
}
