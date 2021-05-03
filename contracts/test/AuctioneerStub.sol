// SPDX-License-Identifier: MIT

pragma solidity <0.9.0;

import "../Auctioneer.sol";

contract AuctioneerStub is Auctioneer {
    /// @dev This fallback function is needed by the `impersonateContract`
    ///      test helper function.
    fallback() external payable {}

    function callCreateAuction(
        IERC20 tokenAccepted,
        uint256 amountDesired,
        uint256 auctionLength
    ) public {
        createAuction(tokenAccepted, amountDesired, auctionLength);
    }

    function callEarlyCloseAuction(Auction auction) public {
        earlyCloseAuction(auction);
    }
}
