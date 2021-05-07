// SPDX-License-Identifier: MIT

pragma solidity <0.9.0;

import "../Auctioneer.sol";

contract AuctioneerStub is Auctioneer {
    /// @dev This fallback function is needed by the `impersonateContract`
    ///      test helper function.
    fallback() external payable {}

    function _createAuction(
        IERC20 tokenAccepted,
        uint256 amountDesired,
        uint256 auctionLength
    ) public {
        createAuction(tokenAccepted, amountDesired, auctionLength);
    }

    function _earlyCloseAuction(Auction auction) public {
        earlyCloseAuction(auction);
    }
}
