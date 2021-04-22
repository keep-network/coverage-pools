// SPDX-License-Identifier: MIT

pragma solidity <0.9.0;

import "../Auctioneer.sol";

contract AuctioneerStub is Auctioneer {
    /// @dev This fallback function is needed by the `impersonateContract`
    ///      test helper function.
    fallback() external payable {}
}
