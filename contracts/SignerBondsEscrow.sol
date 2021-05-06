// SPDX-License-Identifier: MIT

pragma solidity <0.9.0;

import "./RiskManagerV1.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract SignerBondsEscrow is ISignerBondsProcessor, Ownable {
    function processSignerBonds() external payable override {}

    function withdraw(address payable target) external onlyOwner {
        require(target != address(0), "Invalid target address");
        /* solhint-disable avoid-low-level-calls */
        // slither-disable-next-line low-level-calls,arbitrary-send
        (bool success, ) = target.call{value: address(this).balance}("");
        require(success, "Failed to send Ether");
    }
}
