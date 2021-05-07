// SPDX-License-Identifier: MIT

pragma solidity <0.9.0;

import "../RiskManagerV1.sol";

contract DepositStub is IDeposit {
    address public purchaser;

    uint256 private state;
    uint256 private lotSize;

    event FundsWithdrawn(address purchaser, uint256 amount);

    fallback() external payable {}

    function withdrawFunds() external override {
        require(purchaser != address(0), "Signer bonds not purchased yet");
        uint256 amount = address(this).balance;
        emit FundsWithdrawn(purchaser, amount);
        /* solhint-disable avoid-low-level-calls */
        (bool success, ) = purchaser.call{value: amount}("");
        require(success, "Failed to send Ether");
    }

    function purchaseSignerBondsAtAuction() external override {
        purchaser = msg.sender;
    }

    function setCurrentState(uint256 _state) external {
        state = _state;
    }

    function setLotSizeTbtc(uint256 _lotSize) external {
        lotSize = _lotSize;
    }

    function currentState() external view override returns (uint256) {
        return state;
    }

    function lotSizeTbtc() external view override returns (uint256) {
        return lotSize;
    }

    function withdrawableAmount() external view override returns (uint256) {
        return address(this).balance;
    }
}
