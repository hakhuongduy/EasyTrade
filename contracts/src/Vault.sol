// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./IOracle.sol";

// Core trading engine fork từ GMX v1. Quản lý pool eUSD và xử lý vị thế Long/Short có đòn bẩy.
// Vault chỉ nhận lệnh từ Router (onlyRouter). LP nạp eUSD → Trader mở vị thế → PnL được settle từ pool.
contract Vault is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant BASIS_POINTS_DIVISOR = 10_000;
    uint256 public constant PRICE_PRECISION = 1e8;
    uint256 public constant USD_PRECISION = 1e18;
    uint256 public constant OPENING_FEE_BPS = 10;
    uint256 public constant BORROWING_FEE_BPS_PER_HOUR = 1;
    uint256 public constant MAX_LEVERAGE = 50;
    uint256 public constant LIQUIDATION_FEE_USD = 5e18;
    uint256 public constant MIN_PROFIT_BIPS = 150;

    struct Position {
        uint256 size;
        uint256 collateral;
        uint256 averagePrice;
        uint256 entryBorrowingFee;
        bool isLong;
        uint256 lastUpdated;
        string symbol;
    }

    IERC20 public immutable eUSD;
    IOracle public oracle; // mutable — owner có thể đổi sang Chainlink / Pyth bất kỳ lúc nào

    address public router;
    uint256 public poolAmount;
    uint256 public reservedAmount;
    uint256 public feeReserve;
    uint256 public cumulativeBorrowingFee;
    uint256 public lastBorrowingFeeUpdate;

    mapping(bytes32 => Position) public positions;

    event LiquidityAdded(address indexed provider, uint256 amount);
    event LiquidityRemoved(address indexed provider, uint256 amount);
    event IncreasePosition(
        address indexed account,
        string symbol,
        bool isLong,
        uint256 collateralDelta,
        uint256 sizeDelta,
        uint256 price,
        uint256 fee
    );
    event DecreasePosition(
        address indexed account,
        string symbol,
        bool isLong,
        uint256 collateralDelta,
        uint256 sizeDelta,
        uint256 price,
        uint256 fee,
        int256 realisedPnl
    );
    event LiquidatePosition(
        address indexed account,
        string symbol,
        bool isLong,
        uint256 size,
        uint256 collateral,
        uint256 price,
        address liquidator
    );
    event RouterUpdated(address indexed newRouter);
    event FeesWithdrawn(address indexed to, uint256 amount);

    error OnlyRouter();
    error InsufficientPoolLiquidity();
    error PositionNotFound();
    error InvalidLeverage();
    error PositionNotLiquidatable();
    error InvalidSize();

    modifier onlyRouter() {
        if (msg.sender != router) revert OnlyRouter();
        _;
    }

    constructor(address _eUSD, address _oracle, address _initialOwner) Ownable(_initialOwner) {
        eUSD = IERC20(_eUSD);
        oracle = IOracle(_oracle);
        lastBorrowingFeeUpdate = block.timestamp;
    }

    function setOracle(address _oracle) external onlyOwner {
        require(_oracle != address(0), "Vault: zero address");
        oracle = IOracle(_oracle);
    }

    function setRouter(address _router) external onlyOwner {
        router = _router;
        emit RouterUpdated(_router);
    }

    function withdrawFees(address _to) external onlyOwner {
        uint256 amount = feeReserve;
        feeReserve = 0;
        eUSD.safeTransfer(_to, amount);
        emit FeesWithdrawn(_to, amount);
    }

    function getOracleUpdateFee(bytes[] calldata _priceUpdateData) external view returns (uint256) {
        return oracle.getUpdateFee(_priceUpdateData);
    }

    function updateOraclePrices(bytes[] calldata _priceUpdateData) external payable onlyRouter {
        oracle.updatePriceFeeds{value: msg.value}(_priceUpdateData);
    }

    function addLiquidity(uint256 _amount) external nonReentrant {
        require(_amount > 0, "Vault: amount = 0");
        eUSD.safeTransferFrom(msg.sender, address(this), _amount);
        poolAmount += _amount;
        emit LiquidityAdded(msg.sender, _amount);
    }

    // onlyOwner: pool khong co LP tokenomics - chi admin rut duoc
    function removeLiquidity(uint256 _amount) external onlyOwner nonReentrant {
        require(_amount > 0, "Vault: amount = 0");
        uint256 available = poolAmount - reservedAmount;
        require(_amount <= available, "Vault: insufficient available liquidity");
        poolAmount -= _amount;
        eUSD.safeTransfer(msg.sender, _amount);
        emit LiquidityRemoved(msg.sender, _amount);
    }

    function increasePosition(
        address _account,
        string calldata _symbol,
        uint256 _collateralDelta,
        uint256 _sizeDelta,
        bool _isLong
    ) external onlyRouter nonReentrant {
        if (_sizeDelta == 0) revert InvalidSize();
        _updateCumulativeBorrowingFee();

        bytes32 key = _positionKey(_account, _symbol, _isLong);
        Position storage position = positions[key];
        (uint256 price,) = oracle.getPrice(_symbol);

        uint256 fee = (_sizeDelta * OPENING_FEE_BPS) / BASIS_POINTS_DIVISOR;
        uint256 collateralAfterFee = _collateralDelta - fee;
        feeReserve += fee;
        poolAmount += fee;

        uint256 newSize = position.size + _sizeDelta;
        uint256 newCollateral = position.collateral + collateralAfterFee;
        if (newSize > newCollateral * MAX_LEVERAGE) revert InvalidLeverage();

        if (position.size == 0) {
            position.averagePrice = price;
        } else {
            position.averagePrice =
                _getNextAveragePrice(position.size, position.averagePrice, price, _sizeDelta, _isLong);
        }

        reservedAmount += collateralAfterFee;
        if (reservedAmount > poolAmount) revert InsufficientPoolLiquidity();

        position.size = newSize;
        position.collateral = newCollateral;
        position.isLong = _isLong;
        position.lastUpdated = block.timestamp;
        position.symbol = _symbol;
        position.entryBorrowingFee = cumulativeBorrowingFee;

        emit IncreasePosition(_account, _symbol, _isLong, _collateralDelta, _sizeDelta, price, fee);
    }

    function decreasePosition(
        address _account,
        string calldata _symbol,
        uint256 _collateralDelta,
        uint256 _sizeDelta,
        bool _isLong,
        address _receiver
    ) external onlyRouter nonReentrant returns (uint256 amountOut) {
        _updateCumulativeBorrowingFee();

        bytes32 key = _positionKey(_account, _symbol, _isLong);
        Position storage position = positions[key];
        if (position.size == 0) revert PositionNotFound();

        (uint256 price,) = oracle.getPrice(_symbol);

        if (_sizeDelta == 0 || _sizeDelta >= position.size) _sizeDelta = position.size;
        if (_collateralDelta > position.collateral) _collateralDelta = position.collateral;

        bool isFullClose = (_sizeDelta == position.size);
        (amountOut,) = _applyDecreaseAndCalcOutput(key, price, _collateralDelta, _sizeDelta, isFullClose);

        if (amountOut > 0) eUSD.safeTransfer(_receiver, amountOut);
        emit DecreasePosition(_account, _symbol, _isLong, _collateralDelta, _sizeDelta, price, 0, 0);
        return amountOut;
    }

    function _applyDecreaseAndCalcOutput(
        bytes32 _key,
        uint256 _price,
        uint256 _collateralDelta,
        uint256 _sizeDelta,
        bool _isFullClose
    ) internal returns (uint256 amountOut, uint256 borrowingFee) {
        Position storage position = positions[_key];
        int256 pnl = _calculatePnl(position, _price, _sizeDelta);

        borrowingFee = _calculateBorrowingFee(position, _sizeDelta);
        feeReserve += borrowingFee;

        uint256 collateralReturned = _collateralDelta;
        if (pnl > 0) {
            uint256 profit = (uint256(pnl) * _sizeDelta) / position.size;
            collateralReturned += profit;
            poolAmount -= profit;
        } else if (pnl < 0) {
            uint256 loss = (uint256(-pnl) * _sizeDelta) / position.size;
            uint256 lossFromPool = loss > _collateralDelta ? _collateralDelta : loss;
            collateralReturned = loss >= collateralReturned ? 0 : collateralReturned - loss;
            poolAmount += lossFromPool;
        }
        collateralReturned = borrowingFee >= collateralReturned ? 0 : collateralReturned - borrowingFee;

        position.size -= _sizeDelta;
        uint256 colUsed = _collateralDelta < position.collateral ? _collateralDelta : position.collateral;
        position.collateral -= colUsed;
        reservedAmount -= colUsed < reservedAmount ? colUsed : reservedAmount;
        position.lastUpdated = block.timestamp;
        position.entryBorrowingFee = cumulativeBorrowingFee;

        if (_isFullClose || position.size == 0) {
            uint256 remCol = position.collateral;
            reservedAmount -= remCol < reservedAmount ? remCol : reservedAmount;
            delete positions[_key];
        }

        return (collateralReturned, borrowingFee);
    }

    function liquidatePosition(address _account, string calldata _symbol, bool _isLong) external nonReentrant {
        _updateCumulativeBorrowingFee();

        bytes32 key = _positionKey(_account, _symbol, _isLong);
        Position storage position = positions[key];
        if (position.size == 0) revert PositionNotFound();

        (uint256 price,) = oracle.getPrice(_symbol);
        (bool canLiquidate,) = _isLiquidatable(position, price);
        if (!canLiquidate) revert PositionNotLiquidatable();

        emit LiquidatePosition(_account, _symbol, _isLong, position.size, position.collateral, price, msg.sender);

        uint256 liquidationFee = LIQUIDATION_FEE_USD < position.collateral ? LIQUIDATION_FEE_USD : position.collateral;
        poolAmount += (position.collateral - liquidationFee);
        reservedAmount -= (position.collateral < reservedAmount ? position.collateral : reservedAmount);

        delete positions[key];
        if (liquidationFee > 0) eUSD.safeTransfer(msg.sender, liquidationFee);
    }

    function isLiquidatable(address _account, string calldata _symbol, bool _isLong)
        external
        view
        returns (bool isLiq, uint256 marginRatio)
    {
        bytes32 key = _positionKey(_account, _symbol, _isLong);
        Position storage position = positions[key];
        if (position.size == 0) return (false, 0);
        (uint256 price,) = oracle.getPriceUnsafe(_symbol);
        return _isLiquidatable(position, price);
    }

    function getPositionPnl(address _account, string calldata _symbol, bool _isLong)
        external
        view
        returns (int256 pnl)
    {
        bytes32 key = _positionKey(_account, _symbol, _isLong);
        Position storage position = positions[key];
        if (position.size == 0) return 0;
        (uint256 price,) = oracle.getPriceUnsafe(_symbol);
        return _calculatePnl(position, price, position.size);
    }

    function getPosition(address _account, string calldata _symbol, bool _isLong)
        external
        view
        returns (uint256 size, uint256 collateral, uint256 averagePrice, bool isLong, uint256 lastUpdated)
    {
        bytes32 key = _positionKey(_account, _symbol, _isLong);
        Position storage p = positions[key];
        return (p.size, p.collateral, p.averagePrice, p.isLong, p.lastUpdated);
    }

    function availableLiquidity() external view returns (uint256) {
        return poolAmount > reservedAmount ? poolAmount - reservedAmount : 0;
    }

    function _positionKey(address _account, string memory _symbol, bool _isLong) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(_account, _symbol, _isLong));
    }

    function _updateCumulativeBorrowingFee() internal {
        if (block.timestamp == lastBorrowingFeeUpdate) return;
        uint256 hoursElapsed = (block.timestamp - lastBorrowingFeeUpdate) / 1 hours;
        if (hoursElapsed > 0) {
            cumulativeBorrowingFee += hoursElapsed * BORROWING_FEE_BPS_PER_HOUR;
            lastBorrowingFeeUpdate = block.timestamp;
        }
    }

    function _calculateBorrowingFee(Position storage position, uint256 _sizeDelta) internal view returns (uint256) {
        uint256 feeDelta = cumulativeBorrowingFee - position.entryBorrowingFee;
        if (feeDelta == 0) return 0;
        return (_sizeDelta * feeDelta) / BASIS_POINTS_DIVISOR;
    }

    function _calculatePnl(Position storage position, uint256 _currentPrice, uint256 _sizeDelta)
        internal
        view
        returns (int256)
    {
        if (position.averagePrice == 0) return 0;
        uint256 priceDelta;
        bool hasProfit;
        if (position.isLong) {
            hasProfit = _currentPrice > position.averagePrice;
            priceDelta = hasProfit ? _currentPrice - position.averagePrice : position.averagePrice - _currentPrice;
        } else {
            hasProfit = _currentPrice < position.averagePrice;
            priceDelta = hasProfit ? position.averagePrice - _currentPrice : _currentPrice - position.averagePrice;
        }
        uint256 absPnl = (_sizeDelta * priceDelta) / position.averagePrice;
        return hasProfit ? int256(absPnl) : -int256(absPnl);
    }

    function _isLiquidatable(Position storage position, uint256 _currentPrice) internal view returns (bool, uint256) {
        int256 pnl = _calculatePnl(position, _currentPrice, position.size);
        uint256 remainingCollateral;
        if (pnl >= 0) {
            remainingCollateral = position.collateral + uint256(pnl);
        } else {
            uint256 loss = uint256(-pnl);
            if (loss >= position.collateral) return (true, 0);
            remainingCollateral = position.collateral - loss;
        }
        uint256 marginRatio = (remainingCollateral * BASIS_POINTS_DIVISOR) / position.size;
        return (marginRatio < 100, marginRatio);
    }

    function _getNextAveragePrice(uint256 _size, uint256 _averagePrice, uint256 _nextPrice, uint256 _sizeDelta, bool)
        internal
        pure
        returns (uint256)
    {
        return (_size * _averagePrice + _sizeDelta * _nextPrice) / (_size + _sizeDelta);
    }
}
