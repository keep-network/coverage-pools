// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "../SignerBondsUniswapV2.sol";

contract UniswapV2RouterStub is IUniswapV2Router {
    // Settable fake exchange rate is defined here to avoid pair logic complexity.
    // It determines how much tokens can be received for 1 ETH.
    uint256 public exchangeRate = 1;

    event SwapExactETHForTokensExecuted(
        uint256 amountOutMin,
        address[] path,
        address to,
        uint256 deadline
    );

    function setExchangeRate(uint256 _exchangeRate) external {
        exchangeRate = _exchangeRate;
    }

    /// @dev Always assumes there are two elements in the path and
    ///      WETH is the first one. Emits an event with input parameters.
    ///      Calculates returned amounts to behave like a real method.
    function swapExactETHForTokens(
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external payable override returns (uint256[] memory amounts) {
        require(msg.value > 0, "Amount must be grater than zero");

        emit SwapExactETHForTokensExecuted(amountOutMin, path, to, deadline);

        amounts = new uint256[](2);
        amounts[0] = msg.value;
        amounts[1] = (msg.value * exchangeRate * 997) / 1000; // simulate 0.3% fee

        return amounts;
    }

    /// @dev Always assumes there are two elements in the path and
    ///      WETH is the first one.
    function getAmountsOut(uint256 amountIn, address[] calldata)
        external
        view
        override
        returns (uint256[] memory amounts)
    {
        amounts = new uint256[](2);
        amounts[0] = amountIn;
        amounts[1] = (amountIn * exchangeRate * 997) / 1000; // simulate 0.3% fee

        return amounts;
    }

    /// @dev Returns mainnet address in order to get verifiable pair addresses.
    function factory() external pure override returns (address) {
        return 0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f;
    }

    /// @dev Returns mainnet address in order to get verifiable pair addresses.
    /* solhint-disable-next-line func-name-mixedcase */
    function WETH() external pure override returns (address) {
        return 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
    }
}
