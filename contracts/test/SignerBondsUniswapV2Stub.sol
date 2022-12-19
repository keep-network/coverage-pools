// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "../SignerBondsUniswapV2.sol";

contract SignerBondsUniswapV2Stub is SignerBondsUniswapV2 {
    constructor(IUniswapV2Router _uniswapRouter, CoveragePool _coveragePool)
        SignerBondsUniswapV2(_uniswapRouter, _coveragePool)
    {}
}
