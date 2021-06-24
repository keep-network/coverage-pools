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

pragma solidity 0.8.4;

import "./CoveragePoolConstants.sol";

/// @title NotifierRewards
/// @notice Contains logic responsible for calculating notifier rewards for
///         both deposit liquidation start and deposit liquidated events.
///         All parameters can be updated using a two-phase process.
/// @dev The client contract should take care of authorizations or governance
///      delays according to their needs.
library NotifierRewards {
    struct Storage {
        // Fixed amount of COV tokens which should be given as reward for the
        // notifier reporting about the start of deposit liquidation process.
        uint256 liquidationNotifierRewardAmount;
        uint256 newLiquidationNotifierRewardAmount;
        uint256 liquidationNotifierRewardAmountChangeInitiated;
        // Percentage of the total COV supply which should be given as reward
        // for the notifier reporting about the start of deposit liquidation
        // process.
        uint256 liquidationNotifierRewardPercentage;
        uint256 newLiquidationNotifierRewardPercentage;
        uint256 liquidationNotifierRewardPercentageChangeInitiated;
        // Fixed amount of COV tokens which should be given as reward for the
        // notifier reporting about a deposit being liquidated outside of the
        // coverage pool.
        uint256 liquidatedNotifierRewardAmount;
        uint256 newLiquidatedNotifierRewardAmount;
        uint256 liquidatedNotifierRewardAmountChangeInitiated;
        // Percentage of the total COV supply which should be given as reward
        // for the notifier reporting about a deposit being liquidated outside
        // of the coverage pool.
        uint256 liquidatedNotifierRewardPercentage;
        uint256 newLiquidatedNotifierRewardPercentage;
        uint256 liquidatedNotifierRewardPercentageChangeInitiated;
    }

    event LiquidationNotifierRewardAmountUpdateStarted(
        uint256 liquidationNotifierRewardAmount,
        uint256 timestamp
    );
    event LiquidationNotifierRewardAmountUpdated(
        uint256 liquidationNotifierRewardAmount
    );

    event LiquidationNotifierRewardPercentageUpdateStarted(
        uint256 liquidationNotifierRewardPercentage,
        uint256 timestamp
    );
    event LiquidationNotifierRewardPercentageUpdated(
        uint256 liquidationNotifierRewardPercentage
    );

    event LiquidatedNotifierRewardAmountUpdateStarted(
        uint256 liquidatedNotifierRewardAmount,
        uint256 timestamp
    );
    event LiquidatedNotifierRewardAmountUpdated(
        uint256 liquidatedNotifierRewardAmount
    );

    event LiquidatedNotifierRewardPercentageUpdateStarted(
        uint256 liquidatedNotifierRewardPercentage,
        uint256 timestamp
    );
    event LiquidatedNotifierRewardPercentageUpdated(
        uint256 liquidatedNotifierRewardPercentage
    );

    /// @notice Begins the liquidation notifier reward amount update process.
    /// @param _newLiquidationNotifierRewardAmount New liquidation notifier
    ///        reward amount.
    function beginLiquidationNotifierRewardAmountUpdate(
        Storage storage self,
        uint256 _newLiquidationNotifierRewardAmount
    ) external {
        /* solhint-disable not-rely-on-time */
        self
            .newLiquidationNotifierRewardAmount = _newLiquidationNotifierRewardAmount;
        self.liquidationNotifierRewardAmountChangeInitiated = block.timestamp;
        emit LiquidationNotifierRewardAmountUpdateStarted(
            _newLiquidationNotifierRewardAmount,
            block.timestamp
        );
        /* solhint-enable not-rely-on-time */
    }

    /// @notice Finalizes the liquidation notifier reward amount update process.
    function finalizeLiquidationNotifierRewardAmountUpdate(Storage storage self)
        external
    {
        self.liquidationNotifierRewardAmount = self
            .newLiquidationNotifierRewardAmount;
        emit LiquidationNotifierRewardAmountUpdated(
            self.newLiquidationNotifierRewardAmount
        );
        self.newLiquidationNotifierRewardAmount = 0;
        self.liquidationNotifierRewardAmountChangeInitiated = 0;
    }

    /// @notice Begins the liquidation notifier reward percentage update process.
    /// @param _newLiquidationNotifierRewardPercentage New liquidation notifier
    ///        reward percentage. This parameter represents the counter of a
    ///        fraction denominated with 1e18. For example, 3% should be
    ///        represented as 3*1e16 because 3*1e16/1e18 equals to 0.03
    function beginLiquidationNotifierRewardPercentageUpdate(
        Storage storage self,
        uint256 _newLiquidationNotifierRewardPercentage
    ) external {
        /* solhint-disable not-rely-on-time */
        require(
            _newLiquidationNotifierRewardPercentage <=
                CoveragePoolConstants.FLOATING_POINT_DIVISOR,
            "Maximum percentage value is 100%"
        );
        self
            .newLiquidationNotifierRewardPercentage = _newLiquidationNotifierRewardPercentage;
        self.liquidationNotifierRewardPercentageChangeInitiated = block
            .timestamp;
        emit LiquidationNotifierRewardPercentageUpdateStarted(
            _newLiquidationNotifierRewardPercentage,
            block.timestamp
        );
        /* solhint-enable not-rely-on-time */
    }

    /// @notice Finalizes the liquidation notifier reward percentage update process.
    function finalizeLiquidationNotifierRewardPercentageUpdate(
        Storage storage self
    ) external {
        self.liquidationNotifierRewardPercentage = self
            .newLiquidationNotifierRewardPercentage;
        emit LiquidationNotifierRewardPercentageUpdated(
            self.newLiquidationNotifierRewardPercentage
        );
        self.newLiquidationNotifierRewardPercentage = 0;
        self.liquidationNotifierRewardPercentageChangeInitiated = 0;
    }

    /// @notice Begins the liquidated notifier reward amount update process.
    /// @param _newLiquidatedNotifierRewardAmount New liquidated notifier
    ///        reward amount.
    function beginLiquidatedNotifierRewardAmountUpdate(
        Storage storage self,
        uint256 _newLiquidatedNotifierRewardAmount
    ) external {
        /* solhint-disable not-rely-on-time */
        self
            .newLiquidatedNotifierRewardAmount = _newLiquidatedNotifierRewardAmount;
        self.liquidatedNotifierRewardAmountChangeInitiated = block.timestamp;
        emit LiquidatedNotifierRewardAmountUpdateStarted(
            _newLiquidatedNotifierRewardAmount,
            block.timestamp
        );
        /* solhint-enable not-rely-on-time */
    }

    /// @notice Finalizes the liquidated notifier reward amount update process.
    function finalizeLiquidatedNotifierRewardAmountUpdate(Storage storage self)
        external
    {
        self.liquidatedNotifierRewardAmount = self
            .newLiquidatedNotifierRewardAmount;
        emit LiquidatedNotifierRewardAmountUpdated(
            self.newLiquidatedNotifierRewardAmount
        );
        self.newLiquidatedNotifierRewardAmount = 0;
        self.liquidatedNotifierRewardAmountChangeInitiated = 0;
    }

    /// @notice Begins the liquidated notifier reward percentage update process.
    /// @param _newLiquidatedNotifierRewardPercentage New liquidated notifier
    ///        reward percentage. This parameter represents the counter of a
    ///        fraction denominated with 1e18. For example, 3% should be
    ///        represented as 3*1e16 because 3*1e16/1e18 equals to 0.03
    function beginLiquidatedNotifierRewardPercentageUpdate(
        Storage storage self,
        uint256 _newLiquidatedNotifierRewardPercentage
    ) external {
        /* solhint-disable not-rely-on-time */
        require(
            _newLiquidatedNotifierRewardPercentage <=
                CoveragePoolConstants.FLOATING_POINT_DIVISOR,
            "Maximum percentage value is 100%"
        );
        self
            .newLiquidatedNotifierRewardPercentage = _newLiquidatedNotifierRewardPercentage;
        self.liquidatedNotifierRewardPercentageChangeInitiated = block
            .timestamp;
        emit LiquidatedNotifierRewardPercentageUpdateStarted(
            _newLiquidatedNotifierRewardPercentage,
            block.timestamp
        );
        /* solhint-enable not-rely-on-time */
    }

    /// @notice Finalizes the liquidated notifier reward percentage update process.
    function finalizeLiquidatedNotifierRewardPercentageUpdate(
        Storage storage self
    ) external {
        self.liquidatedNotifierRewardPercentage = self
            .newLiquidatedNotifierRewardPercentage;
        emit LiquidatedNotifierRewardPercentageUpdated(
            self.newLiquidatedNotifierRewardPercentage
        );
        self.newLiquidatedNotifierRewardPercentage = 0;
        self.liquidatedNotifierRewardPercentageChangeInitiated = 0;
    }

    /// @notice Calculates the amount of COV tokens which should be granted
    ///         to the notifier reporting about the start of deposit
    ///         liquidation process.
    /// @dev Uses the fixed reward amount if non-zero. Otherwise, it calculates
    ///      the reward as percentage of the total COV supply.
    /// @param covTotalSupply Total COV supply amount.
    /// @return Amount of the COV token reward.
    function getLiquidationNotifierReward(
        Storage storage self,
        uint256 covTotalSupply
    ) external view returns (uint256) {
        if (self.liquidationNotifierRewardAmount > 0) {
            return self.liquidationNotifierRewardAmount;
        }

        return
            (self.liquidationNotifierRewardPercentage * covTotalSupply) /
            CoveragePoolConstants.FLOATING_POINT_DIVISOR;
    }

    /// @notice Calculates the amount of COV tokens which should be granted
    ///         to the notifier reporting about a deposit being liquidated
    ///         outside of the coverage pool
    /// @dev Uses the fixed reward amount if non-zero. Otherwise, it calculates
    ///      the reward as percentage of the total COV supply.
    /// @param covTotalSupply Total COV supply amount.
    /// @return Amount of the COV token reward.
    function getLiquidatedNotifierReward(
        Storage storage self,
        uint256 covTotalSupply
    ) external view returns (uint256) {
        if (self.liquidatedNotifierRewardAmount > 0) {
            return self.liquidatedNotifierRewardAmount;
        }

        return
            (self.liquidatedNotifierRewardPercentage * covTotalSupply) /
            CoveragePoolConstants.FLOATING_POINT_DIVISOR;
    }
}
