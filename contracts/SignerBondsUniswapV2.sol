// SPDX-License-Identifier: MIT

pragma solidity <0.9.0;

import "./RiskManagerV1.sol";
import "./CoveragePool.sol";
import "./CoveragePoolConstants.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @notice Interface for the Uniswap v2 router.
/// @dev This is an interface with just a few function signatures of the
///      router contract. For more info and function description please see:
///      https://uniswap.org/docs/v2/smart-contracts/router02
interface IUniswapV2Router {
    function factory() external pure returns (address);

    function WETH() external pure returns (address);

    function swapExactETHForTokens(
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external payable returns (uint256[] memory amounts);

    function getAmountsOut(uint256 amountIn, address[] calldata path)
        external
        view
        returns (uint256[] memory amounts);
}

/// @notice Interface for the Uniswap v2 pair.
/// @dev This is an interface with just a few function signatures of the
///      pair contract. For more info and function description please see:
///      https://uniswap.org/docs/v2/smart-contracts/pair
interface IUniswapV2Pair {
    function getReserves()
        external
        view
        returns (
            uint112 reserve0,
            uint112 reserve1,
            uint32 blockTimestampLast
        );
}

/// @title SignerBondsUniswapV2
/// @notice ETH purchased by the risk manager from tBTC signer bonds needs to be
///         swapped and deposited back to the coverage pool as collateral.
///         SignerBondsUniswapV2 is a swap strategy implementation allowing the
///         risk manager to store purchased ETH signer bonds so that any
///         interested part can later swap them on Uniswap v2 exchange and
///         deposit as coverage pool collateral. The governance can set crucial
///         swap parameters: max allowed percentage impact, slippage tolerance
///         and swap deadline, to force reasonable swap outcomes.
contract SignerBondsUniswapV2 is ISignerBondsSwapStrategy, Ownable {
    using SafeMath for uint256;

    // One basis point is equivalent to 1/100th of a percent.
    uint256 public constant BASIS_POINTS_DIVISOR = 10000;

    IUniswapV2Router public uniswapRouter;
    CoveragePool public coveragePool;
    IERC20 public targetToken;
    IUniswapV2Pair public uniswapPair;

    // Determines the maximum allowed price impact for the swap transaction.
    // If transaction's price impact is higher, transaction will be reverted.
    // Default value is 100 basis points (1%).
    uint256 public maxAllowedPriceImpact = 100;
    // Determines the slippage tolerance for the swap transaction.
    // If transaction's slippage is higher, transaction will be reverted.
    // Default value is 50 basis points (0.5%).
    uint256 public slippageTolerance = 50;
    // Determines the deadline in which the swap transaction has to be mined.
    // If that deadline is exceeded, transaction will be reverted.
    uint256 public swapDeadline = 20 minutes;

    event UniswapV2SwapExecuted(uint256[] amounts);

    constructor(IUniswapV2Router _uniswapRouter, CoveragePool _coveragePool) {
        uniswapRouter = _uniswapRouter;
        coveragePool = _coveragePool;
        targetToken = _coveragePool.collateralToken();
        uniswapPair = IUniswapV2Pair(
            computePairAddress(
                _uniswapRouter.factory(),
                _uniswapRouter.WETH(),
                address(targetToken)
            )
        );
    }

    /// @notice Swaps signer bonds.
    /// @dev Adds incoming bonds to the overall contract balance.
    function swapSignerBonds() external payable override {}

    /// @notice Sets the maximum price impact allowed for a swap transaction.
    /// @param _maxAllowedPriceImpact Maximum allowed price impact specified
    ///        in basis points. Value of this parameter should be between
    ///        0 and 10000 (inclusive). It should be chosen carefully as
    ///        transactions with high price impact result in poor execution
    ///        prices.
    function setMaxAllowedPriceImpact(uint256 _maxAllowedPriceImpact)
        external
        onlyOwner
    {
        require(
            _maxAllowedPriceImpact <= BASIS_POINTS_DIVISOR,
            "Maximum value is 10000 basis points"
        );
        maxAllowedPriceImpact = _maxAllowedPriceImpact;
    }

    /// @notice Sets the slippage tolerance for a swap transaction.
    /// @param _slippageTolerance Slippage tolerance in basis points. Value of
    ///        this parameter should be between 0 and 10000 (inclusive). It
    ///        should be chosen carefully as transactions with high slippage
    ///        tolerance result in poor execution prices. On the other hand,
    ///        very low slippage tolerance may cause transactions to be
    ///        reverted frequently.
    function setSlippageTolerance(uint256 _slippageTolerance)
        external
        onlyOwner
    {
        require(
            _slippageTolerance <= BASIS_POINTS_DIVISOR,
            "Maximum value is 10000 basis points"
        );
        slippageTolerance = _slippageTolerance;
    }

    /// @notice Sets the deadline for a swap transaction.
    /// @param _swapDeadline Swap deadline in seconds. Value of this parameter
    ///        should be grater than 0. It should be chosen carefully as
    ///        transactions with long deadlines may result in poor execution
    ///        prices. On the other hand, very short deadlines may cause
    ///        transactions to be reverted frequently, especially in a
    ///        gas-expensive environment.
    function setSwapDeadline(uint256 _swapDeadline) external onlyOwner {
        require(_swapDeadline > 0, "Deadline must be grater than zero");
        swapDeadline = _swapDeadline;
    }

    /// @notice Swaps signer bonds on Uniswap v2 exchange.
    /// @dev Swaps the given ETH amount for the target token using the Uniswap
    ///      decentralized exchange. The maximum ETH amount is capped by the
    ///      contract balance. Some governance parameters are applied on the
    ///      transaction. The swap's price impact must fit within the
    ///      maximum allowed price impact and the transaction is constrained
    ///      with the slippage tolerance and deadline.
    ///      TODO: explain what happens with obtained tokens
    /// @param amount Amount to swap.
    function swapSignerBondsOnUniswapV2(uint256 amount) external {
        require(amount > 0, "Amount is zero");
        require(amount <= address(this).balance, "Amount exceeds balance");

        // Setup the swap path. WETH must be the first component.
        address[] memory path = new address[](2);
        path[0] = uniswapRouter.WETH();
        path[1] = address(targetToken);

        // Calculate the maximum output token amount basing on pair reserves.
        // This value will be used as the minimum amount of output tokens that
        // must be received for the transaction not to revert.
        uint256 amountOutMin = uniswapRouter.getAmountsOut(amount, path)[1];

        require(
            isAllowedPriceImpact(amountOutMin),
            "Price impact exceeds allowed limit"
        );

        // Include slippage tolerance into the minimum amount of output tokens.
        amountOutMin = amountOutMin
            .mul(BASIS_POINTS_DIVISOR.sub(slippageTolerance))
            .div(BASIS_POINTS_DIVISOR);

        // slither-disable-next-line arbitrary-send,reentrancy-events
        uint256[] memory amounts =
            uniswapRouter.swapExactETHForTokens{value: amount}(
                amountOutMin,
                path,
                address(this), // TODO: tokens should be sent to cov pool.
                /* solhint-disable-next-line not-rely-on-time */
                block.timestamp.add(swapDeadline)
            );

        emit UniswapV2SwapExecuted(amounts);
    }

    /// @notice Checks the price impact of buying a given amount of tokens
    ///         against the maximum allowed price impact limit.
    /// @param amount Amount of tokens.
    /// @return True if the price impact is allowed, false otherwise.
    function isAllowedPriceImpact(uint256 amount) internal view returns (bool) {
        // Get the token amount and include the 0.3% fee within.
        uint256 amountWithFee = amount.mul(997).div(1000);

        // Get reserves of the target token.
        (, uint256 tokenReserves, ) = uniswapPair.getReserves();

        // Calculate the price impact. Multiply it by the floating point
        // divisor to avoid float number.
        // slither-disable-next-line divide-before-multiply
        uint256 priceImpact =
            CoveragePoolConstants.FLOATING_POINT_DIVISOR.mul(amountWithFee).div(
                tokenReserves
            );

        // Calculate the price impact limit. Multiply it by the floating point
        // divisor to avoid float number and make it comparable with the
        // swap's price impact.
        uint256 priceImpactLimit =
            CoveragePoolConstants
                .FLOATING_POINT_DIVISOR
                .mul(maxAllowedPriceImpact)
                .div(BASIS_POINTS_DIVISOR);

        return priceImpact <= priceImpactLimit;
    }

    /// @notice Compute Uniswap v2 pair address.
    /// @param factory Address of the Uniswap v2 factory.
    /// @param tokenA Address of token A.
    /// @param tokenB Address of token B.
    /// @return Address of token pair.
    function computePairAddress(
        address factory,
        address tokenA,
        address tokenB
    ) internal pure returns (address) {
        (address token0, address token1) =
            tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);

        return
            address(
                uint256(
                    keccak256(
                        abi.encodePacked(
                            hex"ff",
                            factory,
                            keccak256(abi.encodePacked(token0, token1)),
                            hex"96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f"
                        )
                    )
                )
            );
    }
}
