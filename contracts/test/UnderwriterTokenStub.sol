// SPDX-License-Identifier: MIT
pragma solidity <0.9.0;

import "../UnderwriterToken.sol";

contract UnderwriterTokenStub is UnderwriterToken {
    function mint(address owner, uint256 amount) public {
        _mint(owner, amount);
    }

    function burn(address owner, uint256 amount) public {
        _burn(owner, amount);
    }
}
