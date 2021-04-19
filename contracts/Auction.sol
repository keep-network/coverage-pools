// SPDX-License-Identifier: MIT

pragma solidity <0.9.0;

import "./CloneFactory.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/math/Math.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

interface ICollateralPool {
    function seizeFunds(uint256 portionOfPool, address recipient) external;
}

interface IAuctioneer {
    function offerTaken(
        address taker,
        IERC20 tokenPaid,
        uint256 tokenAmountPaid,
        uint256 portionOfPool
    ) external;
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
contract Auction {
    using SafeERC20 for IERC20;

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

    uint64 private constant PORTION_ON_OFFER_DIVISOR = 10000;
    AuctionStorage public self;

    function isOpen() external view returns (bool) {
        return self.amountOutstanding > 0;
    }

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
        /* solhint-disable-next-line not-rely-on-time */
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
        require(self.amountOutstanding > 0, "Auction is closed");
        uint256 amountToTransfer = Math.min(amount, self.amountOutstanding);
        self.tokenAccepted.safeTransferFrom(
            msg.sender,
            address(self.auctioneer),
            amountToTransfer
        );

        uint256 portionToSeize =
            (_onOffer() * amountToTransfer) / self.amountOutstanding;

        // If eg only 50% of the offer is taken, put up only half of what was on
        // offer, and slow the price velocity.
        if (amountToTransfer != self.amountOutstanding) {
            uint256 newOffer =
                (_onOffer() * (self.amountOutstanding - amountToTransfer)) /
                    self.amountOutstanding;
            self.auctionLength *= uint64(
                self.amountOutstanding / amountToTransfer
            );
            /* solhint-disable-next-line not-rely-on-time */
            self.timeOffset = uint64(block.timestamp);
            self.offsetPercentOnOffer = uint64(newOffer);
        }
        self.amountOutstanding -= amountToTransfer;

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

    /// @notice how much of the collateral pool can currently be purchased at
    ///         auction, across all assets
    /// @return the ratio of the collateral pool currently on offer
    function onOffer() public view returns (uint256, uint256) {
        return (_onOffer(), PORTION_ON_OFFER_DIVISOR);
    }

    /// @dev Delete all storage and destroy the contract. Should only be called
    ///      after an auction has closed.
    function harikari() internal {
        address payable addr = address(uint160(address(self.auctioneer)));
        selfdestruct(addr);
        delete self;
    }

    function _onOffer() internal view returns (uint256) {
        uint256 timeOfOffsetAmountOnOffer = self.startTime + self.timeOffset;
        return (((PORTION_ON_OFFER_DIVISOR - self.offsetPercentOnOffer) *
            /* solhint-disable-next-line not-rely-on-time */
            (block.timestamp - timeOfOffsetAmountOnOffer)) /
            self.auctionLength);
    }
}

// TODO auctioneer should be able to close an auction early
// TODO auctioneer should be able to speed up auctions based on exit market activity

/// @title Auctioneer
/// @notice Factory for the creation of new auction clones and receiving proceeds.
/// @dev  We avoid redeployment of auction contracts by using the clone factory.
///       Proxy delegates calls to Auction and therefore does not affect auction state.
///       This means that we only need to deploy the auction contracts once.
///       The auctioneer provides clean state for every new auction clone.
contract Auctioneer is CloneFactory, Ownable {
    // Holds the address of the auction contract
    // which will be used as a master contract for cloning.
    address public masterAuction;
    mapping(address => bool) public auctions;

    ICollateralPool public collateralPool;

    event AuctionCreated(
        address indexed tokenAccepted,
        uint256 amount,
        address auctionAddress
    );
    event AuctionOfferTaken(
        address indexed auction,
        address tokenAccepted,
        uint256 amount
    );
    event AuctionClosed(address indexed auction);

    /// @dev Initialize the auctioneer
    /// @param _collateralPool The address of the master deposit contract.
    /// @param _masterAuction  The address of the master auction contract.
    function initialize(ICollateralPool _collateralPool, address _masterAuction)
        external
    {
        require(masterAuction == address(0), "Auctioneer already initialized");
        collateralPool = _collateralPool;
        masterAuction = _masterAuction;
    }

    /// @notice Informs the auctioneer to seize funds and log appropriate events
    /// @dev This function is meant to be called from a cloned auction. It logs
    ///      "offer taken" and "auction closed" events, seizes funds, and cleans
    ///      up closed auctions.
    /// @param taker           the address of the taker of the auction, who will
    ///                        receive the pool's seized funds
    /// @param tokenPaid       the token this auction is denominated in
    /// @param tokenAmountPaid the amount of the token the taker paid
    /// @param portionOfPool   the portion of the pool the taker won at auction.
    ///                        This amount will be divided by PORTION_ON_OFFER_DIVISOR
    ///                        to calculate how much of the pool should be set
    ///                        aside as the taker's winnings.
    function offerTaken(
        address taker,
        address tokenPaid,
        uint256 tokenAmountPaid,
        uint256 portionOfPool
    ) external {
        require(auctions[msg.sender], "Sender isn't an auction");

        emit AuctionOfferTaken(msg.sender, tokenPaid, tokenAmountPaid);

        Auction auction = Auction(msg.sender);

        // actually seize funds, setting them aside for the taker to withdraw
        // from the collateral pool.
        collateralPool.seizeFunds(portionOfPool, taker);

        if (!auction.isOpen()) {
            emit AuctionClosed(msg.sender);
            delete auctions[msg.sender];
        }
    }

    /// @notice Opens a new auction against the collateral pool. The auction
    ///         will remain open until filled, even
    /// @dev Calls `Auction.initializeAuction` to initialize the instance.
    /// @param tokenAccepted the token with which the auction can be taken
    /// @param amountDesired the amount denominated in _tokenAccepted. After
    ///                      this amount is received, the auction can close.
    /// @param auctionLength the amount of time it takes for the auction to get
    ///                      to 100% of all collateral on offer, in seconds.
    /// @return The address of the new auction.
    function createAuction(
        IERC20 tokenAccepted,
        uint256 amountDesired,
        uint64 auctionLength
    ) external onlyOwner returns (address) {
        address cloneAddress = createClone(masterAuction);

        Auction auction = Auction(address(uint160(cloneAddress)));
        auction.initialize(
            address(this),
            tokenAccepted,
            amountDesired,
            auctionLength
        );

        emit AuctionCreated(
            address(tokenAccepted),
            amountDesired,
            cloneAddress
        );

        return cloneAddress;
    }
}
