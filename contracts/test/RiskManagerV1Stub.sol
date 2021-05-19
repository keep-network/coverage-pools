// SPDX-License-Identifier: MIT

pragma solidity <0.9.0;

import "../RiskManagerV1.sol";

contract RiskManagerV1Stub is RiskManagerV1 {
    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    constructor(
        IERC20 _tbtcToken,
        ISignerBondsSwapStrategy _signerBondsSwapStrategy,
        CoveragePool _coveragePool,
        address _masterAuction,
        uint256 _auctionLength
    )
        RiskManagerV1(
            _tbtcToken,
            _signerBondsSwapStrategy,
            _coveragePool,
            _masterAuction,
            _auctionLength
        )
    {}

    function fundTbtcSurplus(uint256 amount) external {
        tbtcToken.safeTransferFrom(msg.sender, address(this), amount);
        tbtcSurplus = tbtcSurplus.add(amount);
    }
}
