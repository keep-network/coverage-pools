// SPDX-License-Identifier: MIT

pragma solidity <0.9.0;

interface IDeposit {
    function currentState() external view returns (uint256);
    function lotSizeTbtc() external view returns (uint256);
    function purchaseSignerBondsAtAuction() external view;
    function withdrawFunds() external;
}