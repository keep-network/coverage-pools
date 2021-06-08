// SPDX-License-Identifier: MIT

pragma solidity <0.9.0;

import "./IAssetPool.sol";

interface IAssetPoolUpgrade is IAssetPool {
    /// @notice Accepts the given underwriter with collateral tokens amount as a
    ///         deposit. In exchange new underwriter tokens will be calculated,
    ///         minted and then transferred back to the underwriter.
    function depositFor(address underwriter, uint256 amount) external;
}
