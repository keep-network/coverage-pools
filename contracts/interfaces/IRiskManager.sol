// SPDX-License-Identifier: MIT

pragma solidity <0.9.0;

import "../Auction.sol";

interface IRiskManager {
    function collectCollateral(Auction auction) external;
}
