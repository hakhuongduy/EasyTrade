// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/eUSD.sol";
import "../src/PriceOracle.sol";
import "../src/Vault.sol";
import "../src/Router.sol";

// Test tích hợp: mô phỏng toàn bộ vòng đời giao dịch từ nạp thanh khoản → mở lệnh → lãi/lỗ → đóng/thanh lý.
contract VaultRouterTest is Test {
    eUSD public token;
    PriceOracle public oracle;
    Vault public vault;
    Router public router;

    address public owner = address(0x1);
    address public lp = address(0x2);
    address public trader = address(0x3);
    address public keeper = address(0x4);

    uint256 constant BTC_PRICE_INIT = 60_000e8;
    uint256 constant BTC_PRICE_UP = 66_000e8;
    uint256 constant BTC_PRICE_DOWN = 54_000e8;
    uint256 constant BTC_PRICE_CRASH = 30_000e8;
    uint256 constant LP_AMOUNT = 500_000e18;
    uint256 constant COLLATERAL = 1_000e18;
    uint256 constant POSITION_SIZE = 10_000e18;

    function setUp() public {
        vm.startPrank(owner);
        token = new eUSD(owner);
        oracle = new PriceOracle(owner);
        vault = new Vault(address(token), address(oracle), owner);
        router = new Router(address(token), address(vault), owner);
        vault.setRouter(address(router));
        oracle.addAsset("BTC", BTC_PRICE_INIT);
        token.mint(lp, LP_AMOUNT);
        token.mint(trader, 50_000e18);
        vm.stopPrank();

        vm.startPrank(lp);
        token.approve(address(vault), LP_AMOUNT);
        vault.addLiquidity(LP_AMOUNT);
        vm.stopPrank();

        vm.prank(trader);
        token.approve(address(router), type(uint256).max);
        vm.prank(owner);
        router.setKeeper(keeper, true);
    }

    function test_AddLiquidity_Success() public view {
        assertEq(vault.poolAmount(), LP_AMOUNT);
        assertEq(vault.reservedAmount(), 0);
    }

    function test_RemoveLiquidity_Success() public {
        uint256 balBefore = token.balanceOf(owner);
        vm.prank(owner);
        vault.removeLiquidity(100_000e18);
        assertEq(vault.poolAmount(), LP_AMOUNT - 100_000e18);
        assertEq(token.balanceOf(owner), balBefore + 100_000e18);
    }

    function test_RemoveLiquidity_BeyondAvailableReverts() public {
        vm.prank(trader);
        router.increasePosition("BTC", COLLATERAL, POSITION_SIZE, true);
        vm.prank(owner);
        vm.expectRevert("Vault: insufficient available liquidity");
        vault.removeLiquidity(LP_AMOUNT);
    }

    function test_OpenLongPosition_Success() public {
        vm.prank(trader);
        router.increasePosition("BTC", COLLATERAL, POSITION_SIZE, true);
        (uint256 size, uint256 collateral, uint256 avgPrice, bool isLong,) = vault.getPosition(trader, "BTC", true);
        assertEq(size, POSITION_SIZE);
        assertGt(collateral, 0);
        assertEq(avgPrice, BTC_PRICE_INIT);
        assertTrue(isLong);
    }

    function test_OpenShortPosition_Success() public {
        vm.prank(trader);
        router.increasePosition("BTC", COLLATERAL, POSITION_SIZE, false);
        (uint256 size,,, bool isLong,) = vault.getPosition(trader, "BTC", false);
        assertEq(size, POSITION_SIZE);
        assertFalse(isLong);
    }

    function test_OpenPosition_TransfersCollateral() public {
        uint256 balBefore = token.balanceOf(trader);
        vm.prank(trader);
        router.increasePosition("BTC", COLLATERAL, POSITION_SIZE, true);
        assertEq(token.balanceOf(trader), balBefore - COLLATERAL);
    }

    function test_OpenPositionForWithPriceUpdate_Success() public {
        uint256 balBefore = token.balanceOf(trader);
        bytes[] memory emptyPriceUpdateData = new bytes[](0);
        vm.prank(keeper);
        router.increasePositionForWithPriceUpdate(trader, "BTC", COLLATERAL, POSITION_SIZE, true, emptyPriceUpdateData);
        (uint256 size, uint256 collateral, uint256 avgPrice, bool isLong,) = vault.getPosition(trader, "BTC", true);
        assertEq(size, POSITION_SIZE);
        assertEq(collateral, COLLATERAL - ((POSITION_SIZE * vault.OPENING_FEE_BPS()) / vault.BASIS_POINTS_DIVISOR()));
        assertEq(avgPrice, BTC_PRICE_INIT);
        assertTrue(isLong);
        assertEq(token.balanceOf(trader), balBefore - COLLATERAL);
    }

    function test_OpenPositionForWithPriceUpdate_OnlyKeeper() public {
        bytes[] memory emptyPriceUpdateData = new bytes[](0);
        vm.prank(trader);
        vm.expectRevert(Router.OnlyKeeper.selector);
        router.increasePositionForWithPriceUpdate(trader, "BTC", COLLATERAL, POSITION_SIZE, true, emptyPriceUpdateData);
    }

    function test_OpenPosition_ExceedMaxLeverageReverts() public {
        vm.prank(trader);
        vm.expectRevert(Vault.InvalidLeverage.selector);
        router.increasePosition("BTC", COLLATERAL, COLLATERAL * 51, true);
    }

    function test_OpenPosition_OnlyRouterCanCall() public {
        vm.prank(trader);
        vm.expectRevert(Vault.OnlyRouter.selector);
        vault.increasePosition(trader, "BTC", COLLATERAL, POSITION_SIZE, true);
    }

    function test_LongPosition_ProfitWhenPriceUp() public {
        vm.prank(trader);
        router.increasePosition("BTC", COLLATERAL, POSITION_SIZE, true);
        vm.prank(owner);
        oracle.setPrice("BTC", BTC_PRICE_UP);
        int256 pnl = vault.getPositionPnl(trader, "BTC", true);
        assertGt(pnl, 0);
        assertApproxEqRel(uint256(pnl), 1_000e18, 0.01e18);
    }

    function test_LongPosition_LossWhenPriceDown() public {
        vm.prank(trader);
        router.increasePosition("BTC", COLLATERAL, POSITION_SIZE, true);
        vm.prank(owner);
        oracle.setPrice("BTC", BTC_PRICE_DOWN);
        int256 pnl = vault.getPositionPnl(trader, "BTC", true);
        assertLt(pnl, 0);
        assertApproxEqRel(uint256(-pnl), 1_000e18, 0.01e18);
    }

    function test_ShortPosition_ProfitWhenPriceDown() public {
        vm.prank(trader);
        router.increasePosition("BTC", COLLATERAL, POSITION_SIZE, false);
        vm.prank(owner);
        oracle.setPrice("BTC", BTC_PRICE_DOWN);
        assertGt(vault.getPositionPnl(trader, "BTC", false), 0);
    }

    function test_ShortPosition_LossWhenPriceUp() public {
        vm.prank(trader);
        router.increasePosition("BTC", COLLATERAL, POSITION_SIZE, false);
        vm.prank(owner);
        oracle.setPrice("BTC", BTC_PRICE_UP);
        assertLt(vault.getPositionPnl(trader, "BTC", false), 0);
    }

    function test_ClosePosition_WithProfit() public {
        vm.prank(trader);
        router.increasePosition("BTC", COLLATERAL, POSITION_SIZE, true);
        vm.prank(owner);
        oracle.setPrice("BTC", BTC_PRICE_UP);
        uint256 balBefore = token.balanceOf(trader);
        vm.prank(trader);
        router.decreasePosition("BTC", COLLATERAL, POSITION_SIZE, true);
        assertGt(token.balanceOf(trader), balBefore);
    }

    function test_ClosePosition_WithLoss() public {
        vm.prank(trader);
        router.increasePosition("BTC", COLLATERAL, POSITION_SIZE, true);
        vm.prank(owner);
        oracle.setPrice("BTC", BTC_PRICE_DOWN);
        uint256 balBefore = token.balanceOf(trader);
        vm.prank(trader);
        router.decreasePosition("BTC", COLLATERAL, POSITION_SIZE, true);
        assertLt(token.balanceOf(trader) - balBefore, COLLATERAL);
    }

    function test_ClosePosition_DeletesPositionData() public {
        vm.prank(trader);
        router.increasePosition("BTC", COLLATERAL, POSITION_SIZE, true);
        vm.prank(trader);
        router.decreasePosition("BTC", COLLATERAL, POSITION_SIZE, true);
        (uint256 size,,,,) = vault.getPosition(trader, "BTC", true);
        assertEq(size, 0);
    }

    function test_CloseNonExistentPosition_Reverts() public {
        vm.prank(trader);
        vm.expectRevert(Vault.PositionNotFound.selector);
        router.decreasePosition("BTC", 0, POSITION_SIZE, true);
    }

    function test_Liquidation_NotLiquidatableWhenHealthy() public {
        vm.prank(trader);
        router.increasePosition("BTC", COLLATERAL, POSITION_SIZE, true);
        (bool isLiq,) = vault.isLiquidatable(trader, "BTC", true);
        assertFalse(isLiq);
    }

    function test_Liquidation_LiquidatableWhenPriceCrashes() public {
        vm.prank(trader);
        router.increasePosition("BTC", COLLATERAL, POSITION_SIZE, true);
        vm.prank(owner);
        oracle.setPrice("BTC", BTC_PRICE_CRASH);
        (bool isLiq,) = vault.isLiquidatable(trader, "BTC", true);
        assertTrue(isLiq);
    }

    function test_Liquidation_KeeperReceivesFee() public {
        vm.prank(trader);
        router.increasePosition("BTC", COLLATERAL, POSITION_SIZE, true);
        vm.prank(owner);
        oracle.setPrice("BTC", BTC_PRICE_CRASH);
        uint256 keeperBalBefore = token.balanceOf(keeper);
        vm.prank(keeper);
        vault.liquidatePosition(trader, "BTC", true);
        assertEq(token.balanceOf(keeper), keeperBalBefore + vault.LIQUIDATION_FEE_USD());
    }

    function test_Liquidation_DeletesPosition() public {
        vm.prank(trader);
        router.increasePosition("BTC", COLLATERAL, POSITION_SIZE, true);
        vm.prank(owner);
        oracle.setPrice("BTC", BTC_PRICE_CRASH);
        vm.prank(keeper);
        vault.liquidatePosition(trader, "BTC", true);
        (uint256 size,,,,) = vault.getPosition(trader, "BTC", true);
        assertEq(size, 0);
    }

    function test_Liquidation_HealthyPositionReverts() public {
        vm.prank(trader);
        router.increasePosition("BTC", COLLATERAL, POSITION_SIZE, true);
        vm.prank(keeper);
        vm.expectRevert(Vault.PositionNotLiquidatable.selector);
        vault.liquidatePosition(trader, "BTC", true);
    }

    function test_BorrowingFee_AccumulatesOverTime() public {
        vm.prank(trader);
        router.increasePosition("BTC", COLLATERAL, POSITION_SIZE, true);
        vm.warp(block.timestamp + 48 hours);
        vm.prank(owner);
        oracle.setPrice("BTC", BTC_PRICE_INIT);
        uint256 balBefore = token.balanceOf(trader);
        vm.prank(trader);
        router.decreasePosition("BTC", COLLATERAL, POSITION_SIZE, true);
        assertLt(token.balanceOf(trader) - balBefore, COLLATERAL);
    }

    function test_AvailableLiquidity_DecreasesAfterOpen() public {
        uint256 availBefore = vault.availableLiquidity();
        vm.prank(trader);
        router.increasePosition("BTC", COLLATERAL, POSITION_SIZE, true);
        assertLt(vault.availableLiquidity(), availBefore);
    }

    function test_AvailableLiquidity_RestoresAfterClose() public {
        vm.prank(trader);
        router.increasePosition("BTC", COLLATERAL, POSITION_SIZE, true);
        uint256 availMid = vault.availableLiquidity();
        vm.prank(trader);
        router.decreasePosition("BTC", COLLATERAL, POSITION_SIZE, true);
        assertGt(vault.availableLiquidity(), availMid);
    }
}
