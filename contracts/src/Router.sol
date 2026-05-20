// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./Vault.sol";

interface IEUSDPermit {
    function permit(
        address _owner,
        address _spender,
        uint256 _value,
        uint256 _deadline,
        uint8 _v,
        bytes32 _r,
        bytes32 _s
    ) external;
}

/// @notice User and keeper entrypoint for EasyTrade Vault.
contract Router is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable eUSD;
    Vault public immutable vault;

    mapping(address => bool) public keepers;

    event PositionIncreased(address indexed account, string symbol, bool isLong, uint256 amountIn, uint256 sizeDelta);
    event PositionDecreased(
        address indexed account,
        string symbol,
        bool isLong,
        uint256 collateralDelta,
        uint256 sizeDelta,
        uint256 amountOut
    );
    event KeeperUpdated(address indexed keeper, bool isActive);

    error InvalidAmount();
    error InvalidSizeDelta();
    error InsufficientOracleFee();
    error OnlyKeeper();

    modifier onlyKeeper() {
        if (!keepers[msg.sender]) revert OnlyKeeper();
        _;
    }

    constructor(address _eUSD, address _vault, address _initialOwner) Ownable(_initialOwner) {
        eUSD = IERC20(_eUSD);
        vault = Vault(_vault);
    }

    receive() external payable {}

    function setKeeper(address _keeper, bool _isActive) external onlyOwner {
        keepers[_keeper] = _isActive;
        emit KeeperUpdated(_keeper, _isActive);
    }

    function increasePosition(string calldata _symbol, uint256 _amountIn, uint256 _sizeDelta, bool _isLong)
        external
        nonReentrant
    {
        if (_amountIn == 0) revert InvalidAmount();
        if (_sizeDelta == 0) revert InvalidSizeDelta();
        eUSD.safeTransferFrom(msg.sender, address(vault), _amountIn);
        vault.increasePosition(msg.sender, _symbol, _amountIn, _sizeDelta, _isLong);
        emit PositionIncreased(msg.sender, _symbol, _isLong, _amountIn, _sizeDelta);
    }

    function increasePositionWithPriceUpdate(
        string calldata _symbol,
        uint256 _amountIn,
        uint256 _sizeDelta,
        bool _isLong,
        bytes[] calldata _priceUpdateData
    ) external payable nonReentrant {
        if (_amountIn == 0) revert InvalidAmount();
        if (_sizeDelta == 0) revert InvalidSizeDelta();
        _updateOraclePrices(_priceUpdateData);
        eUSD.safeTransferFrom(msg.sender, address(vault), _amountIn);
        vault.increasePosition(msg.sender, _symbol, _amountIn, _sizeDelta, _isLong);
        emit PositionIncreased(msg.sender, _symbol, _isLong, _amountIn, _sizeDelta);
    }

    function increasePositionForWithPriceUpdate(
        address _account,
        string calldata _symbol,
        uint256 _amountIn,
        uint256 _sizeDelta,
        bool _isLong,
        bytes[] calldata _priceUpdateData
    ) external payable onlyKeeper nonReentrant {
        if (_amountIn == 0) revert InvalidAmount();
        if (_sizeDelta == 0) revert InvalidSizeDelta();
        _updateOraclePrices(_priceUpdateData);
        eUSD.safeTransferFrom(_account, address(vault), _amountIn);
        vault.increasePosition(_account, _symbol, _amountIn, _sizeDelta, _isLong);
        emit PositionIncreased(_account, _symbol, _isLong, _amountIn, _sizeDelta);
    }

    function increasePositionForWithPermitAndPriceUpdate(
        address _account,
        string calldata _symbol,
        uint256 _amountIn,
        uint256 _sizeDelta,
        bool _isLong,
        bytes[] calldata _priceUpdateData,
        uint256 _permitDeadline,
        uint8 _v,
        bytes32 _r,
        bytes32 _s
    ) external payable onlyKeeper nonReentrant {
        if (_amountIn == 0) revert InvalidAmount();
        if (_sizeDelta == 0) revert InvalidSizeDelta();
        IEUSDPermit(address(eUSD)).permit(_account, address(this), _amountIn, _permitDeadline, _v, _r, _s);
        _updateOraclePrices(_priceUpdateData);
        eUSD.safeTransferFrom(_account, address(vault), _amountIn);
        vault.increasePosition(_account, _symbol, _amountIn, _sizeDelta, _isLong);
        emit PositionIncreased(_account, _symbol, _isLong, _amountIn, _sizeDelta);
    }

    function decreasePosition(string calldata _symbol, uint256 _collateralDelta, uint256 _sizeDelta, bool _isLong)
        external
        nonReentrant
    {
        uint256 amountOut =
            vault.decreasePosition(msg.sender, _symbol, _collateralDelta, _sizeDelta, _isLong, msg.sender);
        emit PositionDecreased(msg.sender, _symbol, _isLong, _collateralDelta, _sizeDelta, amountOut);
    }

    function decreasePositionWithPriceUpdate(
        string calldata _symbol,
        uint256 _collateralDelta,
        uint256 _sizeDelta,
        bool _isLong,
        bytes[] calldata _priceUpdateData
    ) external payable nonReentrant {
        _updateOraclePrices(_priceUpdateData);
        uint256 amountOut =
            vault.decreasePosition(msg.sender, _symbol, _collateralDelta, _sizeDelta, _isLong, msg.sender);
        emit PositionDecreased(msg.sender, _symbol, _isLong, _collateralDelta, _sizeDelta, amountOut);
    }

    function decreasePositionFor(
        address _account,
        string calldata _symbol,
        uint256 _collateralDelta,
        uint256 _sizeDelta,
        bool _isLong,
        address _receiver
    ) external onlyKeeper nonReentrant {
        uint256 amountOut = vault.decreasePosition(_account, _symbol, _collateralDelta, _sizeDelta, _isLong, _receiver);
        emit PositionDecreased(_account, _symbol, _isLong, _collateralDelta, _sizeDelta, amountOut);
    }

    function decreasePositionForWithPriceUpdate(
        address _account,
        string calldata _symbol,
        uint256 _collateralDelta,
        uint256 _sizeDelta,
        bool _isLong,
        address _receiver,
        bytes[] calldata _priceUpdateData
    ) external payable onlyKeeper nonReentrant {
        _updateOraclePrices(_priceUpdateData);
        uint256 amountOut = vault.decreasePosition(_account, _symbol, _collateralDelta, _sizeDelta, _isLong, _receiver);
        emit PositionDecreased(_account, _symbol, _isLong, _collateralDelta, _sizeDelta, amountOut);
    }

    function getPosition(address _account, string calldata _symbol, bool _isLong)
        external
        view
        returns (uint256, uint256, uint256, bool, uint256)
    {
        return vault.getPosition(_account, _symbol, _isLong);
    }

    function getPositionPnl(address _account, string calldata _symbol, bool _isLong) external view returns (int256) {
        return vault.getPositionPnl(_account, _symbol, _isLong);
    }

    function isLiquidatable(address _account, string calldata _symbol, bool _isLong)
        external
        view
        returns (bool, uint256)
    {
        return vault.isLiquidatable(_account, _symbol, _isLong);
    }

    function getOracleUpdateFee(bytes[] calldata _priceUpdateData) external view returns (uint256) {
        return vault.getOracleUpdateFee(_priceUpdateData);
    }

    function _updateOraclePrices(bytes[] calldata _priceUpdateData) internal {
        uint256 fee = vault.getOracleUpdateFee(_priceUpdateData);
        if (msg.value < fee) revert InsufficientOracleFee();
        if (fee > 0) vault.updateOraclePrices{value: fee}(_priceUpdateData);
        if (msg.value > fee) {
            (bool ok,) = msg.sender.call{value: msg.value - fee}("");
            require(ok, "Router: refund failed");
        }
    }
}
