// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

// See https://github.com/keep-network/keep-core/blob/v1.0.1/solidity/contracts/KeepToken.sol
interface tokenRecipient {
    function receiveApproval(
        address _from,
        uint256 _value,
        address _token,
        bytes calldata _extraData
    ) external;
}

contract TestToken is ERC20 {
    string public constant NAME = "Test Token";
    string public constant SYMBOL = "TT";

    /* solhint-disable-next-line no-empty-blocks */
    constructor() ERC20(NAME, SYMBOL) {}

    /// @dev             Mints an amount of the token and assigns it to an account.
    ///                  Uses the internal _mint function. Anyone can call
    /// @param account  The account that will receive the created tokens.
    /// @param amount   The amount of tokens that will be created.
    function mint(address account, uint256 amount) public {
        _mint(account, amount);
    }

    function approveAndCall(
        address spender,
        uint256 value,
        bytes memory extraData
    ) public returns (bool success) {
        if (approve(spender, value)) {
            tokenRecipient(spender).receiveApproval(
                msg.sender,
                value,
                address(this),
                extraData
            );
            return true;
        }
    }
}
