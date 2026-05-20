// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./IOracle.sol";

// Oracle lưu giá thị trường (scale 1e8, ví dụ BTC=$65000 → 65000e8).
// Chỉ owner (Keeper Bot) được cập nhật giá. getPrice() revert nếu giá cũ hơn 1 giờ.
contract PriceOracle is IOracle, Ownable {
    uint8 public constant PRICE_DECIMALS = 8;
    uint256 public constant MAX_PRICE_AGE = 1 hours;

    struct PriceData {
        uint256 price;
        uint256 timestamp;
        bool isActive;
    }

    mapping(string => PriceData) private prices;
    string[] public supportedAssets;

    event PriceUpdated(string indexed symbol, uint256 price, uint256 timestamp);
    event AssetAdded(string indexed symbol);

    error AssetNotSupported(string symbol);
    error PriceIsStale(string symbol, uint256 lastUpdate);
    error InvalidPrice();
    error AssetAlreadyExists(string symbol);

    constructor(address _initialOwner) Ownable(_initialOwner) {}

    function addAsset(string calldata _symbol, uint256 _initPrice) external onlyOwner {
        if (prices[_symbol].isActive) revert AssetAlreadyExists(_symbol);
        if (_initPrice == 0) revert InvalidPrice();
        prices[_symbol] = PriceData({price: _initPrice, timestamp: block.timestamp, isActive: true});
        supportedAssets.push(_symbol);
        emit AssetAdded(_symbol);
        emit PriceUpdated(_symbol, _initPrice, block.timestamp);
    }

    function setPrice(string calldata _symbol, uint256 _price) external onlyOwner {
        if (!prices[_symbol].isActive) revert AssetNotSupported(_symbol);
        if (_price == 0) revert InvalidPrice();
        prices[_symbol].price = _price;
        prices[_symbol].timestamp = block.timestamp;
        emit PriceUpdated(_symbol, _price, block.timestamp);
    }

    function setPriceBatch(string[] calldata _symbols, uint256[] calldata _prices) external onlyOwner {
        require(_symbols.length == _prices.length, "PriceOracle: length mismatch");
        for (uint256 i = 0; i < _symbols.length; i++) {
            if (!prices[_symbols[i]].isActive) revert AssetNotSupported(_symbols[i]);
            if (_prices[i] == 0) revert InvalidPrice();
            prices[_symbols[i]].price = _prices[i];
            prices[_symbols[i]].timestamp = block.timestamp;
            emit PriceUpdated(_symbols[i], _prices[i], block.timestamp);
        }
    }

    function getPrice(string calldata _symbol) external view returns (uint256 price, uint256 timestamp) {
        PriceData storage data = prices[_symbol];
        if (!data.isActive) revert AssetNotSupported(_symbol);
        if (block.timestamp - data.timestamp > MAX_PRICE_AGE) revert PriceIsStale(_symbol, data.timestamp);
        return (data.price, data.timestamp);
    }

    function getPriceUnsafe(string calldata _symbol) external view returns (uint256 price, uint256 timestamp) {
        PriceData storage data = prices[_symbol];
        if (!data.isActive) revert AssetNotSupported(_symbol);
        return (data.price, data.timestamp);
    }

    function isAssetSupported(string calldata _symbol) external view returns (bool) {
        return prices[_symbol].isActive;
    }

    function supportedAssetsCount() external view returns (uint256) {
        return supportedAssets.length;
    }

    function getUpdateFee(bytes[] calldata) external pure returns (uint256) {
        return 0;
    }

    function updatePriceFeeds(bytes[] calldata) external payable {
        require(msg.value == 0, "PriceOracle: fee not required");
    }
}
