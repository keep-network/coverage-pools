// SPDX-License-Identifier: MIT

pragma solidity <0.9.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IAuctioneer {
    function offerTaken(
        address taker,
        IERC20 tokenPaid,
        uint256 tokenAmountPaid,
        uint256 portionOfPool
    ) external;
}