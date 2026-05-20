// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./IOracle.sol";

library PythStructs {
    struct Price {
        int64 price;
        uint64 conf;
        int32 expo;
        uint256 publishTime;
    }
}

interface IPyth {
    function updatePriceFeeds(bytes[] calldata updateData) external payable;
    function getUpdateFee(bytes[] calldata updateData) external view returns (uint256);
    function getPriceUnsafe(bytes32 id) external view returns (PythStructs.Price memory);
    function getPriceNoOlderThan(bytes32 id, uint256 age) external view returns (PythStructs.Price memory);
}

/// @notice Pyth pull-oracle adapter for EasyTrade. Prices are normalized to 1e8.
contract PythOracle is IOracle, Ownable {
    uint8 public constant PRICE_DECIMALS = 8;

    IPyth public immutable pyth;
    uint256 public maxPriceAge;
    uint256 public maxConfidenceBps;

    mapping(string => bytes32) public priceFeedIds;
    mapping(string => bool) private activeAssets;
    string[] public supportedAssets;

    event AssetAdded(string indexed symbol, bytes32 indexed priceFeedId);
    event PriceFeedUpdated(string indexed symbol, bytes32 indexed priceFeedId);
    event MaxPriceAgeUpdated(uint256 maxPriceAge);
    event MaxConfidenceUpdated(uint256 maxConfidenceBps);

    error AssetNotSupported(string symbol);
    error AssetAlreadyExists(string symbol);
    error InvalidPriceFeed();
    error InvalidPythPrice();
    error ConfidenceTooWide(uint256 confidenceBps, uint256 maxConfidenceBps);
    error EmptySymbol();

    constructor(address _pyth, address _initialOwner, uint256 _maxPriceAge, uint256 _maxConfidenceBps)
        Ownable(_initialOwner)
    {
        require(_pyth != address(0), "PythOracle: zero pyth");
        pyth = IPyth(_pyth);
        maxPriceAge = _maxPriceAge;
        maxConfidenceBps = _maxConfidenceBps;
    }

    function addAsset(string calldata _symbol, bytes32 _priceFeedId) external onlyOwner {
        if (bytes(_symbol).length == 0) revert EmptySymbol();
        if (_priceFeedId == bytes32(0)) revert InvalidPriceFeed();
        if (activeAssets[_symbol]) revert AssetAlreadyExists(_symbol);

        activeAssets[_symbol] = true;
        priceFeedIds[_symbol] = _priceFeedId;
        supportedAssets.push(_symbol);
        emit AssetAdded(_symbol, _priceFeedId);
    }

    function setPriceFeed(string calldata _symbol, bytes32 _priceFeedId) external onlyOwner {
        if (!activeAssets[_symbol]) revert AssetNotSupported(_symbol);
        if (_priceFeedId == bytes32(0)) revert InvalidPriceFeed();
        priceFeedIds[_symbol] = _priceFeedId;
        emit PriceFeedUpdated(_symbol, _priceFeedId);
    }

    function setMaxPriceAge(uint256 _maxPriceAge) external onlyOwner {
        maxPriceAge = _maxPriceAge;
        emit MaxPriceAgeUpdated(_maxPriceAge);
    }

    function setMaxConfidenceBps(uint256 _maxConfidenceBps) external onlyOwner {
        require(_maxConfidenceBps > 0, "PythOracle: zero confidence");
        maxConfidenceBps = _maxConfidenceBps;
        emit MaxConfidenceUpdated(_maxConfidenceBps);
    }

    function updatePriceFeeds(bytes[] calldata updateData) external payable {
        if (updateData.length == 0) return;
        pyth.updatePriceFeeds{value: msg.value}(updateData);
    }

    function getUpdateFee(bytes[] calldata updateData) external view returns (uint256) {
        if (updateData.length == 0) return 0;
        return pyth.getUpdateFee(updateData);
    }

    function getPrice(string calldata _symbol) external view returns (uint256 price, uint256 timestamp) {
        bytes32 feedId = _feedId(_symbol);
        PythStructs.Price memory p = pyth.getPriceNoOlderThan(feedId, maxPriceAge);
        _validateConfidence(p);
        return (_scaleTo1e8(p), p.publishTime);
    }

    function getPriceUnsafe(string calldata _symbol) external view returns (uint256 price, uint256 timestamp) {
        bytes32 feedId = _feedId(_symbol);
        PythStructs.Price memory p = pyth.getPriceUnsafe(feedId);
        _validateConfidence(p);
        return (_scaleTo1e8(p), p.publishTime);
    }

    function isAssetSupported(string calldata _symbol) external view returns (bool) {
        return activeAssets[_symbol];
    }

    function supportedAssetsCount() external view returns (uint256) {
        return supportedAssets.length;
    }

    function _feedId(string calldata _symbol) internal view returns (bytes32 feedId) {
        if (!activeAssets[_symbol]) revert AssetNotSupported(_symbol);
        feedId = priceFeedIds[_symbol];
    }

    function _validateConfidence(PythStructs.Price memory p) internal view {
        if (p.price <= 0) revert InvalidPythPrice();
        uint256 absPrice = uint256(uint64(p.price));
        uint256 confidenceBps = (uint256(p.conf) * 10_000) / absPrice;
        if (confidenceBps > maxConfidenceBps) {
            revert ConfidenceTooWide(confidenceBps, maxConfidenceBps);
        }
    }

    function _scaleTo1e8(PythStructs.Price memory p) internal pure returns (uint256) {
        if (p.price <= 0) revert InvalidPythPrice();
        uint256 rawPrice = uint256(uint64(p.price));
        int32 scale = p.expo + int32(uint32(PRICE_DECIMALS));

        if (scale >= 0) {
            return rawPrice * (10 ** uint32(scale));
        }
        return rawPrice / (10 ** uint32(-scale));
    }
}
