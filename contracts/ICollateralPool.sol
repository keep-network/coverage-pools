pragma solidity <0.9.0;

interface ICollateralPool {

  function seizeFunds(uint256 portionOfPool, address recipient) external;
}