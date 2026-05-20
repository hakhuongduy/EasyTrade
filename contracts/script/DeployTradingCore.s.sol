// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/eUSD.sol";
import "../src/Vault.sol";
import "../src/Router.sol";

contract DeployTradingCore is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        address tokenAddress = vm.envAddress("NEXT_PUBLIC_EUSD_ADDRESS");
        address oracleAddress = vm.envAddress("NEXT_PUBLIC_ORACLE_ADDRESS");
        address keeperBot = vm.envOr("KEEPER_ADDRESS", address(0));
        uint256 seedAmount = vm.envOr("SEED_LIQUIDITY_WEI", uint256(500_000e18));

        console.log("=== EasyTrade Trading Core Deploy ===");
        console.log("Deployer:", deployer);
        console.log("eUSD:", tokenAddress);
        console.log("Oracle:", oracleAddress);

        vm.startBroadcast(deployerPrivateKey);

        Vault vault = new Vault(tokenAddress, oracleAddress, deployer);
        console.log("Vault deployed at:  ", address(vault));

        Router router = new Router(tokenAddress, address(vault), deployer);
        console.log("Router deployed at: ", address(router));

        vault.setRouter(address(router));
        console.log("Router linked to Vault");

        if (keeperBot != address(0)) {
            router.setKeeper(keeperBot, true);
            eUSD(tokenAddress).setFaucetRelayer(keeperBot, true);
            console.log("Keeper enabled:", keeperBot);
        } else {
            console.log("KEEPER_ADDRESS not set - no keeper enabled");
        }

        if (seedAmount > 0) {
            eUSD token = eUSD(tokenAddress);
            token.approve(address(vault), seedAmount);
            vault.addLiquidity(seedAmount);
            console.log("Seeded liquidity:", seedAmount / 1e18, "eUSD");
        }

        vm.stopBroadcast();

        console.log("\n=== Trading Core Summary ===");
        console.log("Vault:  ", address(vault));
        console.log("Router: ", address(router));
        console.log("============================");
    }
}
