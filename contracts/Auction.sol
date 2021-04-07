// SPDX-License-Identifier: MIT

pragma solidity <0.9.0;

import "./interfaces/IAuctioneer.sol";
import "@openzeppelin/contracts/math/Math.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

/// @title Auction
/// @notice A contract to run a linear falling-price auction against a diverse
///         basket of assets held in a collateral pool. Auctions are taken using
///         a single asset. Over time, a larger and larger portion of the assets
///         are on offer, eventually hitting 100% of the backing collateral
///         pool. Auctions can be partially filled, and are meant to be amenable
///         to flash loans and other atomic constructions to take advantage of
///         arbitrage opportunities within a single block.
/// @dev  Auction contracts are not meant to be deployed directly, and are
///       instead cloned by an auction factory. Auction contracts clean up and
///       self-destruct on close. An auction that has run the entire length will
///       stay open, forever, or until priced fluctuate and it's eventually
///       profitable to close.
contract Auction {
    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    // for precision purposes only
    uint256 constant PORTION_ON_OFFER_DIVISOR = 1000000;

    struct AuctionStorage {
        IERC20 tokenAccepted;
        IAuctioneer auctioneer;
        // the auction price, denominated in tokenAccepted
        uint256 amountOutstanding;
        uint256 startTime;
        uint256 originalStartTime;
        uint256 updatedStartTime;
        uint256 auctionLength;
        // How fast portions of the collateral pool become available on offer.
        // It is needed to calculate the right portion value on offer at the
        // given moment before the auction is over.
        // Auction length once set is constant and what changes is the auction's
        // "start time offset" once the takeOffer() call has been processed for
        // partial fill. The auction's "start time offset" resets every takeOffer().
        // velocityPoolDepletingRate = auctionLength / (auctionLength - startTimeOffset)
        // velocityPoolDepletingRate always starts at 1.0 and then can go up
        // depending on partial offer calls over auction life span to maintain
        // the right ratio between the remaining auction time and the remaining
        // portion of the collateral pool.
        uint256 velocityPoolDepletingRate;
    }

    AuctionStorage public self;

    function amountOutstanding() external view returns (uint256) {
        return self.amountOutstanding;
    }

    function isOpen() external view returns (bool) {
        return self.amountOutstanding > 0;
    }

    /// @notice Initializes auction
    /// @dev At the beginning of an auction, velocity pool depleting rate is
    ///      always 1. It increases over time after a partial auction buy.
    /// @param _auctioneer    the auctioneer contract responsible for seizing
    ///                       funds from the backing collateral pool
    /// @param _tokenAccepted the token with which the auction can be taken
    /// @param _amountDesired the amount denominated in _tokenAccepted. After
    ///                       this amount is received, the auction can close.
    /// @param _auctionLength the amount of time it takes for the auction to get
    ///                       to 100% of all collateral on offer, in seconds.
    function initialize(
        address _auctioneer,
        IERC20 _tokenAccepted,
        uint256 _amountDesired,
        uint256 _auctionLength
    ) public {
        require(self.originalStartTime == 0, "Auction already initialized");
        require(_amountDesired > 0, "Amount desired must be greater than zero");
        self.auctioneer = IAuctioneer(_auctioneer);
        self.tokenAccepted = _tokenAccepted;
        self.amountOutstanding = _amountDesired;
        self.originalStartTime = block.timestamp;
        self.updatedStartTime = block.timestamp;
        self.auctionLength = _auctionLength;
        // When the pool is full, velocity rate is 1
        self.velocityPoolDepletingRate = 1 * PORTION_ON_OFFER_DIVISOR;
    }

    /// @notice Takes an offer from an auction buyer.
    /// @dev There are two possible ways to take an offer from a buyer. The first
    ///      one is to buy entire auction with the amount desired for this auction.
    ///      The other way is to buy a portion of an auction. In this case an
    ///      auction depleting rate is increased.
    /// @param amount the amount the taker is paying, denominated in tokenAccepted
    function takeOffer(uint256 amount) public {
        // TODO frontrunning mitigation
        require(amount > 0, "Can't pay 0 tokens");
        uint256 amountToTransfer = Math.min(amount, self.amountOutstanding);
        uint256 onOffer = _onOffer();
        self.tokenAccepted.safeTransferFrom(
            msg.sender,
            address(self.auctioneer),
            amountToTransfer
        );

        uint256 portionToSeize =
            onOffer.mul(amountToTransfer).div(self.amountOutstanding);

        if (!_isAuctionOver() && amountToTransfer != self.amountOutstanding) {
            uint256 ratioAmountPaid =
                PORTION_ON_OFFER_DIVISOR.mul(amountToTransfer).div(
                    self.amountOutstanding
                );
            uint256 localStartTimeOffset =
                (block.timestamp.sub(self.updatedStartTime))
                    .mul(ratioAmountPaid)
                    .div(PORTION_ON_OFFER_DIVISOR);
            self.updatedStartTime = self.updatedStartTime.add(
                localStartTimeOffset
            ); // update the auction start time "forward"
            uint256 globalStartTimeOffset =
                self.updatedStartTime.sub(self.originalStartTime);
            self.velocityPoolDepletingRate = PORTION_ON_OFFER_DIVISOR
                .mul(self.auctionLength)
                .div(self.auctionLength.sub(globalStartTimeOffset));
        }

        self.amountOutstanding = self.amountOutstanding.sub(amountToTransfer);

        // inform auctioneer of proceeds and winner. the auctioneer seizes funds
        // from the collateral pool in the name of the winner, and controls all
        // proceeds
        self.auctioneer.offerTaken(
            msg.sender,
            self.tokenAccepted,
            amountToTransfer,
            portionToSeize
        );

        if (self.amountOutstanding == 0) {
            harikari();
        }
    }

    /// @notice How much of the collateral pool can currently be purchased at
    ///         auction, across all assets.
    /// @dev _onOffer().div(PORTION_ON_OFFER_DIVISOR) returns a portion of the
    ///      collateral pool. Ex. if 35% available of the collateral pool,
    ///      then _onOffer().div(PORTION_ON_OFFER_DIVISOR) returns 0.35
    /// @return the ratio of the collateral pool currently on offer
    function onOffer() public view returns (uint256, uint256) {
        return (_onOffer(), PORTION_ON_OFFER_DIVISOR);
    }

    function _onOffer() internal view returns (uint256) {
        // when the auction is over, entire pool is on offer
        if (_isAuctionOver()) {
            // Down the road, for determining a portion on offer, a value returned
            // by this function will be divided by PORTION_ON_OFFER_DIVISOR. To
            // return the entire pool, we need to return just this divisor in order
            // to get 1.0 ie. PORTION_ON_OFFER_DIVISOR / PORTION_ON_OFFER_DIVISOR = 1.0
            return PORTION_ON_OFFER_DIVISOR;
        }

        return
            (block.timestamp.sub(self.updatedStartTime))
                .mul(self.velocityPoolDepletingRate)
                .div(self.auctionLength);
    }

    function _isAuctionOver() internal view returns (bool) {
        return
            block.timestamp >= self.originalStartTime.add(self.auctionLength);
    }

    /// @dev Delete all storage and destroy the contract. Should only be called
    ///      after an auction has closed.
    function harikari() internal {
        address payable addr = address(uint160(address(self.auctioneer)));
        selfdestruct(addr);
        delete self;
    }
}
