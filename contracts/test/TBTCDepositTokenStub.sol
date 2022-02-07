// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "../RiskManagerV1.sol";

contract TBTCDepositTokenStub is ITBTCDepositToken {
    mapping(uint256 => bool) public tokenIds;

    function setExists(uint256 tokenId, bool _exists) external {
        tokenIds[tokenId] = _exists;
    }

    function exists(uint256 tokenId) external view override returns (bool) {
        return tokenIds[tokenId];
    }
}
