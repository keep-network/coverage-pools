pragma solidity <0.9.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract TestToken is ERC20 {
  string public constant NAME = "Test Token";
  string public constant SYMBOL = "TT";

  constructor() ERC20(NAME, SYMBOL) {}
  /// @dev             Mints an amount of the token and assigns it to an account.
  ///                  Uses the internal _mint function. Anyone can call
  /// @param _account  The account that will receive the created tokens.
  /// @param _amount   The amount of tokens that will be created.
  function mint(address _account, uint256 _amount) public returns (bool) {
      // NOTE: this is a public function with unchecked minting.
      _mint(_account, _amount);
      return true;
  }
}