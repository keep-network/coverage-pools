// SPDX-License-Identifier: MIT

pragma solidity <0.9.0;

import "./Auctioneer.sol";
import "./interfaces/IAuction.sol";
import "./CoveragePoolConstants.sol";
import "@openzeppelin/contracts/math/Math.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

/// @title Wrapper for the Auction contract
contract AuctionWrapper {
    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    struct AuctionStorage {
        IERC20 tokenAccepted;
        Auctioneer auctioneer;
        // the auction price, denominated in tokenAccepted
        uint256 amountOutstanding;
        uint256 startTime;
        uint256 startTimeOffset;
        uint256 auctionLength;
        // How fast portions of the collateral pool become available on offer.
        // It is needed to calculate the right portion value on offer at the
        // given moment before the auction is over.
        // Auction length once set is constant and what changes is the auction's
        // "start time offset" once the takeOffer() call has been processed for
        // partial fill. The auction's "start time offset" is updated every takeOffer().
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
        require(self.startTime == 0, "Auction already initialized");
        require(_amountDesired > 0, "Amount desired must be greater than zero");
        self.auctioneer = Auctioneer(_auctioneer);
        self.tokenAccepted = _tokenAccepted;
        self.amountOutstanding = _amountDesired;
        self.startTime = block.timestamp;
        self.startTimeOffset = 0;
        self.auctionLength = _auctionLength;
        self.velocityPoolDepletingRate = 1 * CoveragePoolConstants.getFloatingPointDivisor();
    }

    /// @notice Takes an offer from an auction buyer.
    /// @dev There are two possible ways to take an offer from a buyer. The first
    ///      one is to buy entire auction with the amount desired for this auction.
    ///      The other way is to buy a portion of an auction. In this case an
    ///      auction depleting rate is increased.
    /// @param amount the amount the taker is paying, denominated in tokenAccepted
    function _takeOffer(uint256 amount) internal {
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
            uint256 FLOATING_POINT_DIVISOR = CoveragePoolConstants.getFloatingPointDivisor();

            // Time passed since the auction start or the last takeOffer call
            // with a partial fill.
            uint256 timePassed = block.timestamp.sub(self.startTime).sub(self.startTimeOffset);
            
            // Ratio of the auction's amount included in this takeOffer call to
            // the whole outstanding auction amount.
            uint256 ratioAmountPaid =
                FLOATING_POINT_DIVISOR.mul(amountToTransfer).div(
                    self.amountOutstanding
                );
            // We will shift the start time offset and increase the velocity pool
            // depleting rate proportionally to the fraction of the outstanding
            // amount paid in this function call so that the auction can offer 
            // no worse financial outcome for the next takers than the current 
            // taker has.
            self.startTimeOffset = self.startTimeOffset.add(
                timePassed.mul(ratioAmountPaid).div(FLOATING_POINT_DIVISOR)
            );
            self.velocityPoolDepletingRate = FLOATING_POINT_DIVISOR
                .mul(self.auctionLength)
                .div(self.auctionLength.sub(self.startTimeOffset));
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
            _harikari();
        }
    }

    /// @notice How much of the collateral pool can currently be purchased at
    ///         auction, across all assets.
    /// @dev _onOffer().div(FLOATING_POINT_DIVISOR) returns a portion of the
    ///      collateral pool. Ex. if 35% available of the collateral pool,
    ///      then _onOffer().div(FLOATING_POINT_DIVISOR) returns 0.35
    /// @return the ratio of the collateral pool currently on offer
    function onOffer() public view override returns (uint256, uint256) {
        return (_onOffer(), CoveragePoolConstants.getFloatingPointDivisor());
    }

    function _onOffer() internal view returns (uint256) {
        // when the auction is over, entire pool is on offer
        if (_isAuctionOver()) {
            // Down the road, for determining a portion on offer, a value returned
            // by this function will be divided by FLOATING_POINT_DIVISOR. To
            // return the entire pool, we need to return just this divisor in order
            // to get 1.0 ie. FLOATING_POINT_DIVISOR / FLOATING_POINT_DIVISOR = 1.0
            return CoveragePoolConstants.getFloatingPointDivisor();
        }

        return
            (block.timestamp.sub(self.startTime.add(self.startTimeOffset)))
                .mul(self.velocityPoolDepletingRate)
                .div(self.auctionLength);
    }

    function _isAuctionOver() internal view returns (bool) {
        return block.timestamp >= self.startTime.add(self.auctionLength);
    }

    /// @dev Delete all storage and destroy the contract. Should only be called
    ///      after an auction has closed.
    function _harikari() internal {
        address payable addr = address(uint160(address(self.auctioneer)));
        selfdestruct(addr);
        delete self;
    }
}

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
contract Auction is IAuction, AuctionWrapper {
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
    ) external {
        require(self.startTime == 0, "Auction already initialized");
        require(_amountDesired > 0, "Amount desired must be greater than zero");
        self.auctioneer = Auctioneer(_auctioneer);
        self.tokenAccepted = _tokenAccepted;
        self.amountOutstanding = _amountDesired;
        self.startTime = block.timestamp;
        self.startTimeOffset = block.timestamp;
        self.auctionLength = _auctionLength;
        // When the pool is full, velocity rate is 1
        self.velocityPoolDepletingRate = 1 * CoveragePoolConstants.getPortionOnOfferDivisor();
    }

    /// @dev It takes all outstanding amount in case 'amount' > 'amountOutstanding'
    function takeOffer(uint256 amount) external override {
        _takeOffer(amount);
    }

    /// @dev 'minAmount' sets a minimum limit of tokens to buy in this transaction. 
    ///      If `amountOutstanding` < 'minAmount', transaction will revert.
    function takeOfferWithMin(uint256 amount, uint256 minAmount) external {
        require(self.amountOutstanding >= minAmount, "Can't fulfill minimum offer");
        _takeOffer(amount);
    }

    /// @notice How much of the collateral pool can currently be purchased at
    ///         auction, across all assets.
    /// @dev _onOffer().div(PORTION_ON_OFFER_DIVISOR) returns a portion of the
    ///      collateral pool. Ex. if 35% available of the collateral pool,
    ///      then _onOffer().div(PORTION_ON_OFFER_DIVISOR) returns 0.35
    /// @return the ratio of the collateral pool currently on offer
    function onOffer() external view override returns (uint256, uint256) {
        return (_onOffer(), CoveragePoolConstants.getPortionOnOfferDivisor());
    }

    function amountOutstanding() external view returns (uint256) {
        return self.amountOutstanding;
    }

    function isOpen() external view returns (bool) {
        return self.amountOutstanding > 0;
    }
}
