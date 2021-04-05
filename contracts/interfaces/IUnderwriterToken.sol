// SPDX-License-Identifier: MIT

pragma solidity <0.9.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title IUnderwriterToken
/// @notice Underwriter tokens represent an ownership share in the underlying
///         collateral of the asset-specific pool. Underwriter tokens are minted
///         when a user deposits ERC20 tokens into asset-specific pool and they
///         are burned when a user exits the position. Underwriter tokens
///         natively support meta transactions. Users can authorize a transfer
///         of their underwriter tokens with a signature conforming EIP712
///         standard, rather than an on-chain transaction from their address.
///         Anyone can submit this signature on the user's behalf by calling the 
///         permit function, as specified in EIP2612 standard, paying gas fees, 
///         and possibly performing other actions in the same transaction.
interface IUnderwriterToken is IERC20 {
    /// @notice Returns hash of EIP712 Domain struct with the token name as
    /// a signing domain and token contract as a verifying contract.
    /// Used to construct EIP2612 signature provided to `permit` function.
    function DOMAIN_SEPARATOR() external view returns (bytes32);

    /// @notice Returns EIP2612 Permit message hash.
    /// Used to construct EIP2612 signature provided to `permit` function.
    function PERMIT_TYPEHASH() external pure returns (bytes32);

    /// @notice Returns the current nonce for EIP2612 permission for the
    /// provided token owner for a replay protection.
    /// Used to construct EIP2612 signature provided to `permit` function.
    function nonces(address owner) external view returns (uint256);
    
    /// @notice EIP2612 approval made with secp256k1 signature.
    ///         Users can authorize a transfer of their tokens with a signature
    ///         conforming EIP712 standard, rather than an on-chain transaction
    ///         from their address. Anyone can submit this signature on the
    ///         user's behalf by calling the permit function, paying gas fees,
    ///         and possibly performing other actions in the same transaction.
    /// @dev    The deadline argument can be set to uint(-1) to create permits
    ///         that effectively never expire.
    function permit(
        address owner,
        address spender,
        uint256 amount,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;
}
