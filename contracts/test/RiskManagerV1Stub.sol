// SPDX-License-Identifier: MIT

pragma solidity <0.9.0;

import "../RiskManagerV1.sol";

contract RiskManagerV1Stub is RiskManagerV1 {
    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    constructor(
        IERC20 _tbtcToken,
        ITBTCDepositToken _tbtcDepositToken,
        CoveragePool _coveragePool,
        ISignerBondsSwapStrategy _signerBondsSwapStrategy,
        address _masterAuction,
        uint256 _auctionLength,
        uint256 _bondAuctionThreshold
    )
        RiskManagerV1(
            _tbtcToken,
            _tbtcDepositToken,
            _coveragePool,
            _signerBondsSwapStrategy,
            _masterAuction,
            _auctionLength,
            _bondAuctionThreshold
        )
    {}

    function fundTbtcSurplus(uint256 amount) external {
        tbtcToken.safeTransferFrom(msg.sender, address(this), amount);
        tbtcSurplus = tbtcSurplus.add(amount);
    }
}
