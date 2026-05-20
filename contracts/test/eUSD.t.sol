// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/eUSD.sol";

contract eUSDTest is Test {
    eUSD public token;

    address public owner = address(0x1);
    address public alice = address(0x2);
    address public bob = address(0x3);

    event FaucetClaimed(address indexed user, uint256 amount, uint256 timestamp);
    event FaucetRelayerSet(address indexed relayer, bool enabled);

    function setUp() public {
        vm.prank(owner);
        token = new eUSD(owner);
    }

    function test_InitialState() public view {
        assertEq(token.name(), "EasyTrade USD");
        assertEq(token.symbol(), "eUSD");
        assertEq(token.decimals(), 18);
        assertEq(token.balanceOf(owner), 1_000_000 * 1e18);
        assertEq(token.totalSupply(), 1_000_000 * 1e18);
    }

    function test_FaucetSuccess() public {
        vm.prank(alice);
        token.faucet();
        assertEq(token.balanceOf(alice), 10_000 * 1e18);
    }

    function test_FaucetEmitsEvent() public {
        vm.expectEmit(true, false, false, true, address(token));
        emit FaucetClaimed(alice, 10_000 * 1e18, block.timestamp);
        vm.prank(alice);
        token.faucet();
    }

    function test_FaucetRevertsBeforeCooldown() public {
        vm.prank(alice);
        token.faucet();
        vm.expectRevert(bytes("eUSD: Faucet cooldown chua ket thuc, vui long cho them"));
        vm.prank(alice);
        token.faucet();
    }

    function test_FaucetSuccessAfterCooldown() public {
        vm.prank(alice);
        token.faucet();
        vm.warp(block.timestamp + 24 hours);
        vm.prank(alice);
        token.faucet();
        assertEq(token.balanceOf(alice), 20_000 * 1e18);
    }

    function test_FaucetCooldownRemaining_BeforeClaim() public view {
        assertEq(token.faucetCooldownRemaining(alice), 0);
    }

    function test_FaucetCooldownRemaining_AfterClaim() public {
        vm.prank(alice);
        token.faucet();
        uint256 remaining = token.faucetCooldownRemaining(alice);
        assertGt(remaining, 0);
        assertLe(remaining, 24 hours);
    }

    function test_FaucetCooldownRemaining_AfterExpiry() public {
        vm.prank(alice);
        token.faucet();
        vm.warp(block.timestamp + 24 hours);
        assertEq(token.faucetCooldownRemaining(alice), 0);
    }

    function test_DifferentUsersCooldownIndependent() public {
        vm.prank(alice);
        token.faucet();
        vm.prank(bob);
        token.faucet();
        assertEq(token.balanceOf(alice), 10_000 * 1e18);
        assertEq(token.balanceOf(bob), 10_000 * 1e18);
    }

    function test_OwnerCanFaucetForUser() public {
        vm.prank(owner);
        token.faucetFor(alice);
        assertEq(token.balanceOf(alice), 10_000 * 1e18);
        assertEq(token.lastFaucetTime(alice), block.timestamp);
    }

    function test_FaucetForUsesUserCooldown() public {
        vm.prank(owner);
        token.faucetFor(alice);
        vm.expectRevert(bytes("eUSD: Faucet cooldown chua ket thuc, vui long cho them"));
        vm.prank(owner);
        token.faucetFor(alice);
    }

    function test_FaucetForZeroAddressReverts() public {
        vm.expectRevert(bytes("eUSD: invalid user"));
        vm.prank(owner);
        token.faucetFor(address(0));
    }

    function test_SetFaucetRelayer() public {
        vm.expectEmit(true, false, false, true, address(token));
        emit FaucetRelayerSet(bob, true);
        vm.prank(owner);
        token.setFaucetRelayer(bob, true);
        assertTrue(token.faucetRelayers(bob));

        vm.prank(bob);
        token.faucetFor(alice);
        assertEq(token.balanceOf(alice), 10_000 * 1e18);
    }

    function test_NonRelayerCannotFaucetForUser() public {
        vm.expectRevert(bytes("eUSD: not faucet relayer"));
        vm.prank(bob);
        token.faucetFor(alice);
    }

    function test_NonOwnerCannotSetFaucetRelayer() public {
        vm.prank(alice);
        vm.expectRevert();
        token.setFaucetRelayer(bob, true);
    }

    function test_OwnerCanMint() public {
        vm.prank(owner);
        token.mint(alice, 500_000 * 1e18);
        assertEq(token.balanceOf(alice), 500_000 * 1e18);
    }

    function test_NonOwnerCannotMint() public {
        vm.prank(alice);
        vm.expectRevert();
        token.mint(alice, 1_000 * 1e18);
    }
}
