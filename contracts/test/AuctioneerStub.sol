// SPDX-License-Identifier: MIT

pragma solidity <0.9.0;

import "../Auctioneer.sol";

contract AuctioneerStub is Auctioneer {
    fallback() external payable {}
}
