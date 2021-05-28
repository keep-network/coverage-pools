// SPDX-License-Identifier: MIT

pragma solidity <0.9.0;

import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import "../RiskManagerV1.sol";

/// @dev Stub contract simulating - in a simplified way - behavior of tBTC v1
///      deposit when it comes to purchasing signer bonds. This is _not_
///      a complete tBTC v1 Deposit implementation.
contract DepositStub is IDeposit {
    using SafeERC20 for IERC20;

    enum States {
        // DOES NOT EXIST YET
        START,
        // FUNDING FLOW
        AWAITING_SIGNER_SETUP,
        AWAITING_BTC_FUNDING_PROOF,
        // FAILED SETUP
        FAILED_SETUP,
        // ACTIVE
        ACTIVE, // includes courtesy call
        // REDEMPTION FLOW
        AWAITING_WITHDRAWAL_SIGNATURE,
        AWAITING_WITHDRAWAL_PROOF,
        REDEEMED,
        // SIGNER LIQUIDATION FLOW
        COURTESY_CALL,
        FRAUD_LIQUIDATION_IN_PROGRESS,
        LIQUIDATION_IN_PROGRESS,
        LIQUIDATED
    }

    IERC20 public tbtcToken;
    uint256 public override lotSizeTbtc;
    uint256 public override currentState;
    uint256 public override auctionValue;

    address public buyer;

    constructor(IERC20 _tbtcToken, uint256 _lotSizeTbtc) {
        tbtcToken = _tbtcToken;
        lotSizeTbtc = _lotSizeTbtc;
    }

    /// @dev Needed to receive ETH bonds at deposit setup.
    receive() external payable {}

    function withdrawFunds() external override {
        /* solhint-disable avoid-low-level-calls */
        // slither-disable-next-line low-level-calls
        (bool success, ) = buyer.call{value: address(this).balance}("");
        require(success, "Failed to send Ether");
        /* solhint-enable avoid-low-level-calls */
    }

    function purchaseSignerBondsAtAuction() external override {
        require(
            currentState == uint256(States.LIQUIDATION_IN_PROGRESS),
            "Not in liquidation"
        );
        currentState = uint256(States.LIQUIDATED);
        buyer = msg.sender;
        tbtcToken.safeTransferFrom(buyer, address(this), lotSizeTbtc);
    }

    function notifyUndercollateralizedLiquidation() external {
        currentState = uint256(States.LIQUIDATION_IN_PROGRESS);
    }

    function notifyRedemptionSignatureTimedOut() external override {
        currentState = uint256(States.LIQUIDATION_IN_PROGRESS);
    }

    function withdrawableAmount() external view override returns (uint256) {
        return address(this).balance;
    }
}
