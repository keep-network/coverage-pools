// SPDX-License-Identifier: MIT

pragma solidity <0.9.0;

import "./Auctioneer.sol";
import "@openzeppelin/contracts/math/Math.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

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

    uint64 constant PORTION_ON_OFFER_DIVISOR = 10000;

    struct AuctionStorage {
        IERC20 tokenAccepted;
        // the auction price, denominated in tokenAccepted
        uint256 amountOutstanding;
        IAuctioneer auctioneer;
        uint64 startTime;
        uint64 timeOffset;
        uint64 auctionLength;
        uint64 offsetPercentOnOffer;
    }

    AuctionStorage public self;

    /// @dev
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
        uint64 _auctionLength
    ) public {
        require(self.startTime == 0, "Auction already initialized");
        require(_amountDesired > 0, "Amount desired must be greater than zero");
        self.startTime = uint64(block.timestamp);
        self.auctioneer = IAuctioneer(_auctioneer);
        self.tokenAccepted = _tokenAccepted;
        self.amountOutstanding = _amountDesired;
        self.auctionLength = _auctionLength;
    }

    /// @notice
    /// @dev
    /// @param amount the amount the taker is paying, denominated in
    ///        tokenAccepted
    function takeOffer(uint256 amount) public {
        // TODO frontrunning mitigation
        require(amount > 0, "Can't pay 0 tokens");
        uint256 amountToTransfer = Math.min(amount, self.amountOutstanding);
        self.tokenAccepted.safeTransferFrom(msg.sender, address(self.auctioneer), amountToTransfer);

        uint256 portionToSeize = _onOffer() * amountToTransfer / self.amountOutstanding;

        // If eg only 50% of the offer is taken, put up only half of what was on
        // offer, and slow the price velocity.
        if (amountToTransfer != self.amountOutstanding) {
            uint256 newOffer = _onOffer() * (self.amountOutstanding - amountToTransfer) / self.amountOutstanding;
            self.auctionLength *= uint64(self.amountOutstanding / amountToTransfer);
            self.timeOffset = uint64(block.timestamp);
            self.offsetPercentOnOffer = uint64(newOffer);
        }
        self.amountOutstanding -= amountToTransfer;

        // inform auctioneer of proceeds and winner. the auctioneer seizes funds
        // from the collateral pool in the name of the winner, and controls all
        // proceeds
        self.auctioneer.offerTaken(msg.sender, self.tokenAccepted, amountToTransfer, portionToSeize);

        if (self.amountOutstanding == 0) {
            harikari();
        }
    }

    function isOpen() external view returns (bool) {
        return self.amountOutstanding > 0;
    }

    /// @notice how much of the collateral pool can currently be purchased at
    ///         auction, across all assets
    /// @return the ratio of the collateral pool currently on offer
    function onOffer() public view returns (uint256, uint256) {
        return (_onOffer(), PORTION_ON_OFFER_DIVISOR);
    }

    function _onOffer() internal view returns (uint256) {
        uint256 timeOfOffsetAmountOnOffer = self.startTime + self.timeOffset;
        return ((PORTION_ON_OFFER_DIVISOR - self.offsetPercentOnOffer) *
                (block.timestamp - timeOfOffsetAmountOnOffer) / self.auctionLength);
    }

    /// @dev Delete all storage and destroy the contract. Should only be called
    ///      after an auction has closed.
    function harikari() internal {
        address payable addr = address(uint160(address(self.auctioneer)));
        selfdestruct(addr);
        delete self;
    }
}
