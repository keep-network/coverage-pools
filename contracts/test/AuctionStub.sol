// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "../interfaces/IAuction.sol";

contract AuctionStub is IAuction {
    uint256 public divisor;
    uint256 public offer;
    uint256 public amountOutstanding;

    event TakeOffer(uint256 amount);

    /// @dev Simulates calling Auction.takeOffer(amount) from the
    ///      AuctionBidder contract.
    function takeOffer(uint256 amount) external override {
        emit TakeOffer(amount);
    }

    function onOffer() external view override returns (uint256, uint256) {
        return (offer, divisor);
    }

    function setOnOffer(uint256 _onOffer) public {
        offer = _onOffer;
    }

    function setDivisor(uint256 _divisor) public {
        divisor = _divisor;
    }

    function setAmountOutstanding(uint256 _amountOutstanding) public {
        amountOutstanding = _amountOutstanding;
    }
}
