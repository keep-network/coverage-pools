// SPDX-License-Identifier: MIT

pragma solidity <0.9.0;

import "../Auctioneer.sol";

contract AuctioneerStub is Auctioneer {
    event AuctionEarlyClosed(uint256 transferredAmount);

    constructor(CoveragePool _coveragePool, address _masterAuction)
        Auctioneer(_coveragePool, _masterAuction)
    {}

    /// @dev This fallback function is needed by the `impersonateAccount`
    ///      test helper function.
    receive() external payable {}

    function publicCreateAuction(
        IERC20 tokenAccepted,
        uint256 amountDesired,
        uint256 auctionLength
    ) public {
        createAuction(tokenAccepted, amountDesired, auctionLength);
    }

    function publicEarlyCloseAuction(Auction auction) public {
        uint256 transferredAmount = earlyCloseAuction(auction);
        emit AuctionEarlyClosed(transferredAmount);
    }
}
