// SPDX-License-Identifier: MIT

pragma solidity <0.9.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "../SignerBondsUniswapV2.sol";

contract UniswapV2PairStub is IUniswapV2Pair {
    uint112 public reserve0;
    uint112 public reserve1;
    uint32 public blockTimestampLast;

    function setReserves(uint112 _reserve0, uint112 _reserve1) external {
        reserve0 = _reserve0;
        reserve1 = _reserve1;
        /* solhint-disable-next-line not-rely-on-time */
        blockTimestampLast = uint32(block.timestamp);
    }

    function getReserves()
        external
        view
        override
        returns (
            uint112,
            uint112,
            uint32
        )
    {
        return (reserve0, reserve1, blockTimestampLast);
    }
}
