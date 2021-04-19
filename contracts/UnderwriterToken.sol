// SPDX-License-Identifier: MIT

pragma solidity <0.8.0;

import "./AssetPool.sol";

import "@openzeppelin/contracts/math/SafeMath.sol";
import "./interfaces/IUnderwriterToken.sol";

/// @title UnderwriterToken
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
contract UnderwriterToken is IUnderwriterToken {
    using SafeMath for uint256;

    string public constant name = "Underwriter Token";
    string public constant symbol = "COV";
    uint8 public constant decimals = 18;

    uint256 public override totalSupply;
    mapping(address => uint256) public override balanceOf;
    mapping(address => mapping(address => uint256)) public override allowance;

    bytes32 public override DOMAIN_SEPARATOR;
    // keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");
    bytes32 public constant override PERMIT_TYPEHASH =
        0x6e71edae12b1b97f4d1f60370fef10105fa2faae0126114a169c64845d6126c9;
    mapping(address => uint256) public override nonces;

    address public assetPool;

    constructor(address _assetPool) {
        uint256 chainId;
        assembly {
            chainId := chainid()
        }
        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256(
                    "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
                ),
                keccak256(bytes(name)),
                keccak256(bytes("1")),
                chainId,
                address(this)
            )
        );
        assetPool = _assetPool;
    }

    modifier onlyAssetPool() {
        require(msg.sender == assetPool, "Caller is not the asset pool");
        _;
    }

    function transfer(address recipient, uint256 amount)
        external
        override
        returns (bool)
    {
        _transfer(msg.sender, recipient, amount);
        return true;
    }

    function transferFrom(
        address sender,
        address recipient,
        uint256 amount
    ) external override returns (bool) {
        if (allowance[sender][msg.sender] != uint256(-1)) {
            _approve(
                sender,
                msg.sender,
                allowance[sender][msg.sender].sub(
                    amount,
                    "Transfer amount exceeds allowance"
                )
            );
        }
        _transfer(sender, recipient, amount);
        return true;
    }

    function approve(address spender, uint256 amount)
        external
        override
        returns (bool)
    {
        _approve(msg.sender, spender, amount);
        return true;
    }

    function permit(
        address owner,
        address spender,
        uint256 amount,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external override {
        require(deadline >= block.timestamp, "Permission expired");

        // Validate `s` and `v` values for a malleability concern described in EIP2.
        // Only signatures with `s` value in the lower half of the secp256k1
        // curve's order and `v` value of 27 or 28 are considered valid.
        require(
            uint256(s) <=
                0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0,
            "Invalid signature 's' value"
        );
        require(v == 27 || v == 28, "Invalid signature 'v' value");

        bytes32 digest =
            keccak256(
                abi.encodePacked(
                    "\x19\x01",
                    DOMAIN_SEPARATOR,
                    keccak256(
                        abi.encode(
                            PERMIT_TYPEHASH,
                            owner,
                            spender,
                            amount,
                            nonces[owner]++,
                            deadline
                        )
                    )
                )
            );
        address recoveredAddress = ecrecover(digest, v, r, s);
        require(
            recoveredAddress != address(0) && recoveredAddress == owner,
            "Invalid signature"
        );
        _approve(owner, spender, amount);
    }

    function mint(address recipient, uint256 amount) external onlyAssetPool {
        require(recipient != address(0), "Mint to the zero address");
        totalSupply = totalSupply.add(amount);
        balanceOf[recipient] = balanceOf[recipient].add(amount);
        emit Transfer(address(0), recipient, amount);
    }

    function burn(uint256 amount) override external {
        balanceOf[msg.sender] = balanceOf[msg.sender].sub(
            amount,
            "Burn amount exceeds balance"
        );
        totalSupply = totalSupply.sub(amount);
        emit Transfer(msg.sender, address(0), amount);
    }

    function _transfer(
        address sender,
        address recipient,
        uint256 amount
    ) private {
        require(sender != address(0), "Transfer from the zero address");
        require(recipient != address(0), "Transfer to the zero address");
        balanceOf[sender] = balanceOf[sender].sub(
            amount,
            "Transfer amount exceeds balance"
        );
        balanceOf[recipient] = balanceOf[recipient].add(amount);
        emit Transfer(sender, recipient, amount);
    }

    function _approve(
        address owner,
        address spender,
        uint256 amount
    ) private {
        require(owner != address(0), "Approve from the zero address");
        require(spender != address(0), "Approve to the zero address");
        allowance[owner][spender] = amount;
        emit Approval(owner, spender, amount);
    }
}
