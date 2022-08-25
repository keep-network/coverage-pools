// ██████████████     ▐████▌     ██████████████
// ██████████████     ▐████▌     ██████████████
//               ▐████▌    ▐████▌
//               ▐████▌    ▐████▌
// ██████████████     ▐████▌     ██████████████
// ██████████████     ▐████▌     ██████████████
//               ▐████▌    ▐████▌
//               ▐████▌    ▐████▌
//               ▐████▌    ▐████▌
//               ▐████▌    ▐████▌
//               ▐████▌    ▐████▌
//               ▐████▌    ▐████▌

// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "./interfaces/IRiskManagerV2.sol";
import "./Auctioneer.sol";
import "./GovernanceUtils.sol";

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title Risk Manager for tBTC v2
/// @notice Risk Manager is a smart contract with the exclusive right to claim
///         coverage from the coverage pool. Demanding coverage is akin to
///         filing a claim in traditional insurance and processing your own
///         claim. The risk manager holds an incredibly privileged position,
///         because the ability to claim coverage of an arbitrarily large
///         position could bankrupt the coverage pool.
///         tBTC v2 risk manager demands coverage by opening an auction for TBTC
///         and liquidating portion of the coverage pool when tBTC v2 deposit is
///         in liquidation and signer bonds on offer reached the specific
///         threshold. In practice, it means no one is willing to purchase
///         signer bonds for that deposit on tBTC side.
contract RiskManagerV2 is IRiskManagerV2, Auctioneer, Ownable {
    using SafeERC20 for IERC20;

    /// @notice Governance delay that needs to pass before any risk manager
    ///         parameter change initiated by the governance takes effect.
    uint256 public constant GOVERNANCE_DELAY = 12 hours;

    IERC20 public immutable tbtcToken;

    /// @notice Council multisig is a priviledged address that can execute
    ///         certain functionalities such as coverage claiming from the
    ///         coverage pool.
    address public councilMultisig;
    address public newCouncilMultisig;
    uint256 public councilMultisigInitiated;

    event CouncilMultisigStarted(address councilMultisig, uint256 timestamp);

    event CouncilMultisigUpdated(address councilMultisig);

    /// @notice Reverts if called before the governance delay elapses.
    /// @param changeInitiatedTimestamp Timestamp indicating the beginning
    ///        of the change.
    modifier onlyAfterGovernanceDelay(uint256 changeInitiatedTimestamp) {
        require(changeInitiatedTimestamp > 0, "Change not initiated");
        require(
            /* solhint-disable-next-line not-rely-on-time */
            block.timestamp - changeInitiatedTimestamp >= GOVERNANCE_DELAY,
            "Governance delay has not elapsed"
        );
        _;
    }

    /// @notice Reverts if called by other address than council multisig.
    modifier onlyCouncilMultisig() {
        require(
            msg.sender == councilMultisig,
            "Caller is not the council multisig"
        );
        _;
    }

    constructor(
        IERC20 _tbtcToken,
        CoveragePool _coveragePool,
        address _masterAuction,
        address _councilMultisig
    ) Auctioneer(_coveragePool, _masterAuction) {
        tbtcToken = _tbtcToken;

        require(
            _councilMultisig != address(0),
            "Council multisig cannot be zero address"
        );
        councilMultisig = _councilMultisig;
    }

    /// @notice Receives ETH from tBTC for purchasing and withdrawing deposit
    ///         signer bonds.
    //slither-disable-next-line locked-ether
    receive() external payable {}

    /// @notice Claims arbitrary coverage amount from the coverage pool. Can
    ///         be called by the council multisig only.
    /// @param  amountToSeize Amount to seize
    function claimCoverage(uint256 amountToSeize) external onlyCouncilMultisig {
        coveragePool.seizeFunds(amountToSeize, msg.sender);
    }

    /// @notice Begins council multisig address update process.
    /// @dev    Can be called only by the contract owner.
    function beginCouncilMultisigUpdate(address _newCouncilMultisig)
        external
        onlyOwner
    {
        require(
            _newCouncilMultisig != address(0),
            "Invalid new council multisig address"
        );
        newCouncilMultisig = _newCouncilMultisig;

        /* solhint-disable not-rely-on-time */
        councilMultisigInitiated = block.timestamp;
        emit CouncilMultisigStarted(_newCouncilMultisig, block.timestamp);
        /* solhint-enable not-rely-on-time */
    }

    /// @notice Finalizes the council multisig update process.
    /// @dev Can be called only by the contract owner, after the governance
    ///      delay elapses.
    function finalizeCouncilMultisigUpdate()
        external
        onlyOwner
        onlyAfterGovernanceDelay(councilMultisigInitiated)
    {
        councilMultisig = newCouncilMultisig;
        emit CouncilMultisigUpdated(newCouncilMultisig);
        newCouncilMultisig = address(0);
        councilMultisigInitiated = 0;
    }

    /// @notice Get the time remaining until the council multisig parameter
    ///         can be updated.
    /// @return Remaining time in seconds.
    function getRemainingCouncilMultisigUpdateTime()
        external
        view
        returns (uint256)
    {
        return
            GovernanceUtils.getRemainingChangeTime(
                councilMultisigInitiated,
                GOVERNANCE_DELAY
            );
    }
}
