// SPDX-License-Identifier: MIT

pragma solidity <0.9.0;

import "./CloneFactory.sol";
import "./Auction.sol";
import "./CoveragePool.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title Auctioneer
/// @notice Factory for the creation of new auction clones and receiving proceeds.
/// @dev  We avoid redeployment of auction contracts by using the clone factory.
///       Proxy delegates calls to Auction and therefore does not affect auction state.
///       This means that we only need to deploy the auction contracts once.
///       The auctioneer provides clean state for every new auction clone.
contract Auctioneer is CloneFactory {
    // Holds the address of the auction contract
    // which will be used as a master contract for cloning.
    address public masterAuction;
    mapping(address => bool) public openAuctions;

    CoveragePool public coveragePool;

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
        uint256 portionToSeize // This amount should be divided by FLOATING_POINT_DIVISOR
    );
    event AuctionClosed(address indexed auction);

    constructor(CoveragePool _coveragePool, address _masterAuction) {
        require(_masterAuction != address(0), "Invalid master auction address");
        require(masterAuction == address(0), "Auctioneer already initialized");
        coveragePool = _coveragePool;
        masterAuction = _masterAuction;
    }

    /// @notice Informs the auctioneer to seize funds and log appropriate events
    /// @dev This function is meant to be called from a cloned auction. It logs
    ///      "offer taken" and "auction closed" events, seizes funds, and cleans
    ///      up closed auctions.
    /// @param auctionTaker    The address of the taker of the auction, who will
    ///                        receive the pool's seized funds
    /// @param tokenPaid       The token this auction is denominated in
    /// @param tokenAmountPaid The amount of the token the taker paid
    /// @param portionToSeize   The portion of the pool the taker won at auction.
    ///                        This amount should be divided by FLOATING_POINT_DIVISOR
    ///                        to calculate how much of the pool should be set
    ///                        aside as the taker's winnings.
    function offerTaken(
        address auctionTaker,
        IERC20 tokenPaid,
        uint256 tokenAmountPaid,
        uint256 portionToSeize
    ) external {
        require(openAuctions[msg.sender], "Sender isn't an auction");

        emit AuctionOfferTaken(
            msg.sender,
            auctionTaker,
            tokenPaid,
            tokenAmountPaid,
            portionToSeize
        );

        Auction auction = Auction(msg.sender);

        // actually seize funds, setting them aside for the taker to withdraw
        // from the coverage pool.
        // `portionToSeize` will be divided by FLOATING_POINT_DIVISOR which is
        // defined in Auction.sol
        //
        //slither-disable-next-line reentrancy-no-eth,reentrancy-events
        coveragePool.seizeFunds(auctionTaker, portionToSeize);

        if (!auction.isOpen()) {
            onAuctionFullyFilled(auction);

            emit AuctionClosed(msg.sender);
            delete openAuctions[msg.sender];
        }
    }

    /// @notice Opens a new auction against the coverage pool. The auction
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
    ) internal returns (address) {
        address cloneAddress = createClone(masterAuction);

        Auction auction = Auction(address(uint160(cloneAddress)));
        //slither-disable-next-line reentrancy-benign,reentrancy-events
        auction.initialize(
            address(this),
            tokenAccepted,
            amountDesired,
            auctionLength
        );

        openAuctions[cloneAddress] = true;

        emit AuctionCreated(
            address(tokenAccepted),
            amountDesired,
            cloneAddress
        );

        return cloneAddress;
    }

    /// @notice Tears down an open auction with given address immediately.
    /// @dev Can be called by contract owner to early close an auction if it
    ///      is no longer needed. Bear in mind that funds from the early closed
    ///      auction last on the auctioneer contract. Calling code should take
    ///      care of them.
    /// @return Amount of funds transferred to this contract by the Auction
    ///         being early closed.
    function earlyCloseAuction(Auction auction) internal returns (uint256) {
        address auctionAddress = address(auction);

        require(openAuctions[auctionAddress], "Address is not an open auction");

        uint256 amountTransferred = auction.amountTransferred();

        //slither-disable-next-line reentrancy-no-eth,reentrancy-events
        auction.earlyClose();

        emit AuctionClosed(auctionAddress);
        delete openAuctions[auctionAddress];

        return amountTransferred;
    }

    /// @notice Auction lifecycle hook allowing to act on auction closed
    ///         as fully filled. This function is not executed when an auction
    ///         was partially filled. When this function is executed auction is
    ///         already closed and funds from the coverage pool are seized.
    /// @dev Override this function to act on auction closed as fully filled.
    function onAuctionFullyFilled(Auction auction) internal virtual {}
}
