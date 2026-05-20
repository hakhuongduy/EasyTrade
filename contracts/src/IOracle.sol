// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Standard oracle interface used by the EasyTrade Vault.
interface IOracle {
    /// @notice Returns a fresh price scaled to 1e8. Reverts if the price is stale or unsupported.
    function getPrice(string calldata symbol) external view returns (uint256 price, uint256 timestamp);

    /// @notice Returns a price scaled to 1e8 without staleness checks. Use for read-only UI views.
    function getPriceUnsafe(string calldata symbol) external view returns (uint256 price, uint256 timestamp);

    /// @notice Whether the oracle supports a trading symbol.
    function isAssetSupported(string calldata symbol) external view returns (bool);

    /// @notice Native token fee required to update oracle prices with the supplied data.
    function getUpdateFee(bytes[] calldata updateData) external view returns (uint256);

    /// @notice Updates oracle prices. Manual oracles can no-op; pull oracles should forward the update data.
    function updatePriceFeeds(bytes[] calldata updateData) external payable;
}
