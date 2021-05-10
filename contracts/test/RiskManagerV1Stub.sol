// SPDX-License-Identifier: MIT

pragma solidity <0.9.0;

import "../RiskManagerV1.sol";

contract RiskManagerV1Stub is RiskManagerV1 {
    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    constructor(IERC20 _token, ISignerBondsProcessor _signerBondsProcessor)
        RiskManagerV1(_token, _signerBondsProcessor)
    {}

    function fundTbtcSurplus(uint256 amount) external {
        tbtcToken.safeTransferFrom(msg.sender, address(this), amount);
        tbtcSurplus = tbtcSurplus.add(amount);
    }

    function setTbtcSurplusReservation(address auction, uint256 amount)
        external
    {
        tbtcToken.safeTransferFrom(msg.sender, address(this), amount);
        tbtcSurplusReservations[auction] = amount;
    }
}
