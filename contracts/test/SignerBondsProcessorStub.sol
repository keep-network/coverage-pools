// SPDX-License-Identifier: MIT

pragma solidity <0.9.0;

import "../RiskManagerV1.sol";

contract SignerBondsProcessorStub is ISignerBondsProcessor {
    event SignerBondsProcessed(uint256 amount);

    function processSignerBonds() external payable override {
        emit SignerBondsProcessed(msg.value);
    }
}
