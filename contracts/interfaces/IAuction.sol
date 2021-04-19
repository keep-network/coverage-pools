// SPDX-License-Identifier: MIT

pragma solidity <0.9.0;

interface IAuction {
    /// @notice Takes an offer from an auction buyer.
    /// @dev There are two possible ways to take an offer from a buyer. The first
    ///      one is to buy entire auction with the amount desired for this auction.
    ///      The other way is to buy a portion of an auction. In this case an
    ///      auction depleting rate is increased.
    function takeOffer(uint256 amount) external;

    /// @notice How much of the collateral pool can currently be purchased at
    ///         auction, across all assets. 
    /// @return The ratio of the collateral pool currently on offer and divisor
    ///         for precision purposes.
    function onOffer() external view returns (uint256, uint256);
}
