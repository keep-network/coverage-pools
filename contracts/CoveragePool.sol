// ▓▓▌ ▓▓ ▐▓▓ ▓▓▓▓▓▓▓▓▓▓▌▐▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▄
// ▓▓▓▓▓▓▓▓▓▓ ▓▓▓▓▓▓▓▓▓▓▌▐▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓
//   ▓▓▓▓▓▓    ▓▓▓▓▓▓▓▀    ▐▓▓▓▓▓▓    ▐▓▓▓▓▓   ▓▓▓▓▓▓     ▓▓▓▓▓   ▐▓▓▓▓▓▌   ▐▓▓▓▓▓▓
//   ▓▓▓▓▓▓▄▄▓▓▓▓▓▓▓▀      ▐▓▓▓▓▓▓▄▄▄▄         ▓▓▓▓▓▓▄▄▄▄         ▐▓▓▓▓▓▌   ▐▓▓▓▓▓▓
//   ▓▓▓▓▓▓▓▓▓▓▓▓▓▀        ▐▓▓▓▓▓▓▓▓▓▓         ▓▓▓▓▓▓▓▓▓▓         ▐▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓
//   ▓▓▓▓▓▓▀▀▓▓▓▓▓▓▄       ▐▓▓▓▓▓▓▀▀▀▀         ▓▓▓▓▓▓▀▀▀▀         ▐▓▓▓▓▓▓▓▓▓▓▓▓▓▓▀
//   ▓▓▓▓▓▓   ▀▓▓▓▓▓▓▄     ▐▓▓▓▓▓▓     ▓▓▓▓▓   ▓▓▓▓▓▓     ▓▓▓▓▓   ▐▓▓▓▓▓▌
// ▓▓▓▓▓▓▓▓▓▓ █▓▓▓▓▓▓▓▓▓ ▐▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  ▓▓▓▓▓▓▓▓▓▓
// ▓▓▓▓▓▓▓▓▓▓ ▓▓▓▓▓▓▓▓▓▓ ▐▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  ▓▓▓▓▓▓▓▓▓▓
//
//                           Trust math, not hardware.

// SPDX-License-Identifier: MIT

pragma solidity <0.9.0;

import "./AssetPool.sol";
import "./CoveragePoolConstants.sol";

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

/// @title CoveragePool
/// @notice A contract that manages a single asset pool. Handles approving and
/// unapproving of risk managers and allows them to seize funds from the asset
/// pool if they are approved.
/// @dev Coverge pool contract is owned by the governance. Coverage pool is the
/// owner of the asset pool contract.
contract CoveragePool is Ownable {
    using SafeMath for uint256;

    AssetPool public assetPool;
    IERC20 public collateralToken;

    // Currently approved risk managers
    mapping(address => bool) public approvedRiskManagers;
    // Timestamps of risk managers whose approvals have been initiated
    mapping(address => uint256) public riskManagerApprovalTimestamps;
    // Timestamps of risk managers whose unapprovals have been initiated
    mapping(address => uint256) public riskManagerUnapprovalTimestamps;

    /// @notice Throws if called by a risk manager that has not been approved
    modifier onlyApprovedRiskManager() {
        require(approvedRiskManagers[msg.sender], "Risk manager not approved");
        _;
    }

    constructor(AssetPool _assetPool) {
        assetPool = _assetPool;
        collateralToken = _assetPool.collateralToken();
    }

    /// @notice Calculates amount of tokens to be seized from the coverage pool.
    /// @param portionToSeize Portion of the pool to seize in the range (0, 1]
    ///        multiplied by FLOATING_POINT_DIVISOR.
    function amountToSeize(uint256 portionToSeize)
        public
        view
        returns (uint256)
    {
        return
            collateralToken
                .balanceOf(address(assetPool))
                .mul(portionToSeize)
                .div(CoveragePoolConstants.FLOATING_POINT_DIVISOR);
    }

    /// @notice Begins risk manager approval process.
    /// @dev Can be called only by the contract owner. For a risk manager to be
    /// approved, a call to finalizeRiskManagerApproval must follow (after a
    /// governance delay).
    /// @param riskManager Risk manager that will be approved.
    function beginRiskManagerApproval(address riskManager) external onlyOwner {
        /* solhint-disable-next-line not-rely-on-time */
        riskManagerApprovalTimestamps[riskManager] = block.timestamp;
    }

    /// @notice Finalizes risk manager approval process.
    /// @dev Can be called only by the contract owner. Must be proceded with a
    /// call to beginRiskManagerApproval and a governance delay must elapse.
    /// @param riskManager Risk manager that will be approved.
    function finalizeRiskManagerApproval(address riskManager)
        external
        onlyOwner
    {
        require(
            riskManagerApprovalTimestamps[riskManager] > 0,
            "Risk manager approval not initiated"
        );
        require(
            /* solhint-disable-next-line not-rely-on-time */
            block.timestamp.sub(riskManagerApprovalTimestamps[riskManager]) >=
                CoveragePoolConstants.RISK_MANAGER_GOVERNANCE_DELAY,
            "Risk manager governance delay has not elapsed"
        );
        delete riskManagerApprovalTimestamps[riskManager];
        approvedRiskManagers[riskManager] = true;
    }

    /// @notice Begins risk manager unapproval process.
    /// @dev Can be called only by the contract owner. For a risk manager to be
    /// unapproved, a call to finalizeRiskManagerUnapproval must follow (after
    /// a governance delay). Can only be called on a risk manager that is
    /// approved.
    /// @param riskManager Risk manager that will be unapproved.
    function beginRiskManagerUnapproval(address riskManager)
        external
        onlyOwner
    {
        require(approvedRiskManagers[riskManager], "Risk manager not approved");
        /* solhint-disable-next-line not-rely-on-time */
        riskManagerUnapprovalTimestamps[riskManager] = block.timestamp;
    }

    /// @notice Finalizes risk manager unapproval process.
    /// @dev Can be called only by the contract owner. Must be proceded with a
    /// call to beginRiskManagerUnapproval and a governance delay must elapse.
    /// @param riskManager Risk manager that will be unapproved.
    function finalizeRiskManagerUnapproval(address riskManager)
        external
        onlyOwner
    {
        require(
            riskManagerUnapprovalTimestamps[riskManager] > 0,
            "Risk manager unapproval not initiated"
        );
        require(
            /* solhint-disable-next-line not-rely-on-time */
            block.timestamp.sub(riskManagerUnapprovalTimestamps[riskManager]) >=
                CoveragePoolConstants.RISK_MANAGER_GOVERNANCE_DELAY,
            "Risk manager governance delay has not elapsed"
        );
        delete riskManagerUnapprovalTimestamps[riskManager];
        delete approvedRiskManagers[riskManager];
    }

    /// @notice Seizes funds from the coverage pool and puts them aside for the
    ///         recipient to withdraw.
    /// @dev portionToSeize value was multiplied by FLOATING_POINT_DIVISOR for
    ///      calculation precision purposes. Further calculations in this
    ///      function will need to take this divisor into account.
    /// @param recipient Address that will receive the pool's seized funds.
    /// @param portionToSeize Portion of the pool to seize in the range (0, 1]
    ///        multiplied by FLOATING_POINT_DIVISOR.
    function seizeFunds(address recipient, uint256 portionToSeize)
        external
        onlyApprovedRiskManager
    {
        assetPool.claim(recipient, amountToSeize(portionToSeize));
    }
}
