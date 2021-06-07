// SPDX-License-Identifier: MIT

pragma solidity <0.9.0;

import "../SignerBondsUniswapV2.sol";

contract SignerBondsUniswapV2Stub is SignerBondsUniswapV2 {
    constructor(
        IUniswapV2Router _uniswapRouter,
        CoveragePool _coveragePool,
        Auctioneer _auctioneer
    ) SignerBondsUniswapV2(_uniswapRouter, _coveragePool, _auctioneer) {}

    /// @dev Meant to be used in tests where there is no possibility to
    ///      deploy the pair contract at a deterministic address.
    function setUniswapPair(IUniswapV2Pair _uniswapPair) external {
        uniswapPair = _uniswapPair;
    }
}
