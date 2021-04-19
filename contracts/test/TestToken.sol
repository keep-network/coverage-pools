// SPDX-License-Identifier: MIT

pragma solidity <0.9.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract TestToken is ERC20 {
    string public constant NAME = "Test Token";
    string public constant SYMBOL = "TT";

    /* solhint-disable-next-line no-empty-blocks */
    constructor() public ERC20(NAME, SYMBOL) {}

    function mint(address _account, uint256 _amount) public {
        _mint(_account, _amount);
    }
}
