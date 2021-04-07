// SPDX-License-Identifier: MIT

pragma solidity <0.9.0;

import "./CloneFactory.sol";
import "./Auction.sol";
import "./CollateralPool.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

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

    CollateralPool public collateralPool;

    /// @dev Initialize the auctioneer
    /// @param _collateralPool The address of the master deposit contract.
    /// @param _masterAuction  The address of the master auction contract.
    function initialize(CollateralPool _collateralPool, address _masterAuction)
        external
    {
        require(masterAuction == address(0), "Auctioneer already initialized");
        collateralPool = _collateralPool;
        masterAuction = _masterAuction;
    }

    event AuctionCreated(
        address indexed tokenAccepted,
        uint256 amount,
        address auctionAddress
    );
    event AuctionOfferTaken(
        address indexed auction,
        address indexed auctionTaker,
        IERC20 tokenAccepted,
        uint256 amount,
        uint256 portionOfPool
    );
    event AuctionClosed(address indexed auction);

    /// @notice Informs the auctioneer to seize funds and log appropriate events
    /// @dev This function is meant to be called from a cloned auction. It logs
    ///      "offer taken" and "auction closed" events, seizes funds, and cleans
    ///      up closed auctions.
    /// @param auctionTaker    The address of the taker of the auction, who will
    ///                        receive the pool's seized funds
    /// @param tokenPaid       The token this auction is denominated in
    /// @param tokenAmountPaid The amount of the token the taker paid
    /// @param portionOfPool   The portion of the pool the taker won at auction.
    ///                        This amount will be divided by PORTION_ON_OFFER_DIVISOR
    ///                        to calculate how much of the pool should be set
    ///                        aside as the taker's winnings.
    function offerTaken(
        address auctionTaker,
        IERC20 tokenPaid,
        uint256 tokenAmountPaid,
        uint256 portionOfPool
    ) external {
        require(auctions[msg.sender], "Sender isn't an auction");

        emit AuctionOfferTaken(
            msg.sender,
            auctionTaker,
            tokenPaid,
            tokenAmountPaid,
            portionOfPool
        );

        Auction auction = Auction(msg.sender);

        // actually seize funds, setting them aside for the taker to withdraw
        // from the collateral pool.
        // `portionOfPool` will be divided by PORTION_ON_OFFER_DIVISOR which is
        // defined in Auction.sol
        collateralPool.seizeFunds(portionOfPool, auctionTaker);

        if (!auction.isOpen()) {
            emit AuctionClosed(msg.sender);
            delete auctions[msg.sender];
        }
    }

    /// @notice Opens a new auction against the collateral pool. The auction
    ///         will remain open until filled.
    /// @dev Calls `Auction.initialize` to initialize the instance.
    /// @param tokenAccepted The token with which the auction can be taken
    /// @param amountDesired The amount denominated in _tokenAccepted. After
    ///                      this amount is received, the auction can close.
    /// @param auctionLength The amount of time it takes for the auction to get
    ///                      to 100% of all collateral on offer, in seconds.
    function createAuction(
        IERC20 tokenAccepted,
        uint256 amountDesired,
        uint256 auctionLength
    ) external onlyOwner {
        address cloneAddress = createClone(masterAuction);

        Auction auction = Auction(address(uint160(cloneAddress)));
        auction.initialize(
            address(this),
            tokenAccepted,
            amountDesired,
            auctionLength
        );

        auctions[cloneAddress] = true;

        emit AuctionCreated(
            address(tokenAccepted),
            amountDesired,
            cloneAddress
        );
    }
}