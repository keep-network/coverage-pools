// SPDX-License-Identifier: MIT

/* This is a copy of the WETH contract deployed at
0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2, but with fallback function replaced
with receive() function, so that the contract can compile with newer versions of
Solidity */

pragma solidity 0.7.6;

contract WETH9 {
    string public name = "Wrapped Ether";
    string public symbol = "WETH";
    uint8 public decimals = 18;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Approval(address indexed src, address indexed guy, uint256 wad);
    event Transfer(address indexed src, address indexed dst, uint256 wad);
    event Deposit(address indexed dst, uint256 wad);
    event Withdrawal(address indexed src, uint256 wad);

    receive() external payable {
        deposit();
    }

    function deposit() public payable {
        balanceOf[msg.sender] += msg.value;
        emit Deposit(msg.sender, msg.value);
    }

    function withdraw(uint256 wad) public {
        require(balanceOf[msg.sender] >= wad, "Not enough WETH tokens");
        balanceOf[msg.sender] -= wad;
        msg.sender.transfer(wad);
        emit Withdrawal(msg.sender, wad);
    }

    function approve(address guy, uint256 wad) public returns (bool) {
        allowance[msg.sender][guy] = wad;
        emit Approval(msg.sender, guy, wad);
        return true;
    }

    function transfer(address dst, uint256 wad) public returns (bool) {
        return transferFrom(msg.sender, dst, wad);
    }

    function transferFrom(
        address src,
        address dst,
        uint256 wad
    ) public returns (bool) {
        require(balanceOf[src] >= wad, "Not enough WETH tokens");

        if (src != msg.sender && allowance[src][msg.sender] != uint256(-1)) {
            require(
                allowance[src][msg.sender] >= wad,
                "Not enough WETH tokens approved"
            );
            allowance[src][msg.sender] -= wad;
        }

        balanceOf[src] -= wad;
        balanceOf[dst] += wad;

        emit Transfer(src, dst, wad);

        return true;
    }

    function totalSupply() public view returns (uint256) {
        return address(this).balance;
    }
}
