// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/PriceOracle.sol";

contract PriceOracleTest is Test {
    PriceOracle public oracle;

    address public owner = address(0x1);
    address public alice = address(0x2);

    uint256 constant BTC_PRICE = 65_000e8;
    uint256 constant ETH_PRICE = 3_500e8;

    event PriceUpdated(string indexed symbol, uint256 price, uint256 timestamp);
    event AssetAdded(string indexed symbol);

    function setUp() public {
        vm.prank(owner);
        oracle = new PriceOracle(owner);
        vm.startPrank(owner);
        oracle.addAsset("BTC", BTC_PRICE);
        oracle.addAsset("ETH", ETH_PRICE);
        vm.stopPrank();
    }

    function test_AddAsset_Success() public view {
        assertTrue(oracle.isAssetSupported("BTC"));
        assertTrue(oracle.isAssetSupported("ETH"));
        assertEq(oracle.supportedAssetsCount(), 2);
    }

    function test_AddAsset_NonOwnerReverts() public {
        vm.prank(alice);
        vm.expectRevert();
        oracle.addAsset("SOL", 150e8);
    }

    function test_AddAsset_DuplicateReverts() public {
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(PriceOracle.AssetAlreadyExists.selector, "BTC"));
        oracle.addAsset("BTC", 70_000e8);
    }

    function test_AddAsset_ZeroPriceReverts() public {
        vm.prank(owner);
        vm.expectRevert(PriceOracle.InvalidPrice.selector);
        oracle.addAsset("SOL", 0);
    }

    function test_AddAsset_EmitsEvents() public {
        vm.expectEmit(true, false, false, false);
        emit AssetAdded("SOL");
        vm.prank(owner);
        oracle.addAsset("SOL", 150e8);
    }

    function test_SetPrice_Success() public {
        vm.prank(owner);
        oracle.setPrice("BTC", 70_000e8);
        (uint256 price,) = oracle.getPriceUnsafe("BTC");
        assertEq(price, 70_000e8);
    }

    function test_SetPrice_UpdatesTimestamp() public {
        vm.warp(block.timestamp + 30 minutes);
        uint256 timeBefore = block.timestamp;
        vm.prank(owner);
        oracle.setPrice("BTC", 70_000e8);
        (, uint256 ts) = oracle.getPriceUnsafe("BTC");
        assertEq(ts, timeBefore);
    }

    function test_SetPrice_NonOwnerReverts() public {
        vm.prank(alice);
        vm.expectRevert();
        oracle.setPrice("BTC", 70_000e8);
    }

    function test_SetPrice_UnsupportedAssetReverts() public {
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(PriceOracle.AssetNotSupported.selector, "DOGE"));
        oracle.setPrice("DOGE", 1e8);
    }

    function test_SetPrice_ZeroPriceReverts() public {
        vm.prank(owner);
        vm.expectRevert(PriceOracle.InvalidPrice.selector);
        oracle.setPrice("BTC", 0);
    }

    function test_SetPrice_EmitsEvent() public {
        vm.expectEmit(true, false, false, true);
        emit PriceUpdated("BTC", 70_000e8, block.timestamp);
        vm.prank(owner);
        oracle.setPrice("BTC", 70_000e8);
    }

    function test_SetPriceBatch_Success() public {
        string[] memory symbols = new string[](2);
        symbols[0] = "BTC";
        symbols[1] = "ETH";
        uint256[] memory newPrices = new uint256[](2);
        newPrices[0] = 70_000e8;
        newPrices[1] = 4_000e8;
        vm.prank(owner);
        oracle.setPriceBatch(symbols, newPrices);
        (uint256 btcPrice,) = oracle.getPriceUnsafe("BTC");
        (uint256 ethPrice,) = oracle.getPriceUnsafe("ETH");
        assertEq(btcPrice, 70_000e8);
        assertEq(ethPrice, 4_000e8);
    }

    function test_SetPriceBatch_LengthMismatchReverts() public {
        string[] memory symbols = new string[](2);
        symbols[0] = "BTC";
        symbols[1] = "ETH";
        uint256[] memory newPrices = new uint256[](1);
        newPrices[0] = 70_000e8;
        vm.prank(owner);
        vm.expectRevert("PriceOracle: length mismatch");
        oracle.setPriceBatch(symbols, newPrices);
    }

    function test_GetPrice_Success() public view {
        (uint256 price,) = oracle.getPrice("BTC");
        assertEq(price, BTC_PRICE);
    }

    function test_GetPrice_StaleReverts() public {
        (, uint256 lastTs) = oracle.getPriceUnsafe("BTC");
        vm.warp(block.timestamp + 1 hours + 1 seconds);
        vm.expectRevert(abi.encodeWithSelector(PriceOracle.PriceIsStale.selector, "BTC", lastTs));
        oracle.getPrice("BTC");
    }

    function test_GetPrice_UnsupportedReverts() public {
        vm.expectRevert(abi.encodeWithSelector(PriceOracle.AssetNotSupported.selector, "DOGE"));
        oracle.getPrice("DOGE");
    }

    function test_GetPriceUnsafe_DoesNotRevertWhenStale() public {
        vm.warp(block.timestamp + 2 hours);
        (uint256 price,) = oracle.getPriceUnsafe("BTC");
        assertEq(price, BTC_PRICE);
    }

    function test_IsAssetSupported_False() public view {
        assertFalse(oracle.isAssetSupported("DOGE"));
    }

    function test_SupportedAssetsCount() public view {
        assertEq(oracle.supportedAssetsCount(), 2);
    }
}
