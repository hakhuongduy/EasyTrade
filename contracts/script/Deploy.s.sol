// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/eUSD.sol";
import "../src/PythOracle.sol";
import "../src/Vault.sol";
import "../src/Router.sol";

contract DeployEasyTrade is Script {
    address constant PYTH_BASE = 0x8250f4aF4B972684F7b336503E2D6dFeDeB1487a;

    bytes32 constant BTC_USD = 0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43;
    bytes32 constant ETH_USD = 0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace;
    bytes32 constant SOL_USD = 0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d;
    bytes32 constant BNB_USD = 0x2f95862b045670cd22bee3114c39763a4a08beeb663b145d283c31d7d1101c4f;
    bytes32 constant XRP_USD = 0xec5d399846a9209f3fe5881d70aae9268c94339ff9817e8d18ff19fa05eea1c8;
    bytes32 constant DOGE_USD = 0xdcef50dd0a4cd2dcc17e45df1676dcb336a11a61c69df7a0299b0150c672d25c;
    bytes32 constant ADA_USD = 0x2a01deaec9e51a579277b34b122399984d0bbf57e2458a7e42fecd2829867a0d;
    bytes32 constant AVAX_USD = 0x93da3352f9f1d105fdfe4971cfa80e9dd777bfc5d0f683ebb6e1294b92137bb7;
    bytes32 constant LINK_USD = 0x8ac0c70fff57e9aefdf5edf44b51d62c2d433653cbb2cf5cc06bb115af04d221;
    bytes32 constant DOT_USD = 0xca3eed9b267293f6595901c734c7525ce8ef49adafe8284606ceb307afa2ca5b;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console.log("=== EasyTrade Pyth Deploy ===");
        console.log("Deployer:", deployer);
        console.log("Chain ID:", block.chainid);

        vm.startBroadcast(deployerPrivateKey);

        eUSD eusd = new eUSD(deployer);
        console.log("eUSD deployed at:       ", address(eusd));

        PythOracle oracle = new PythOracle(PYTH_BASE, deployer, 60, 500);
        console.log("PythOracle deployed at: ", address(oracle));

        oracle.addAsset("BTC", BTC_USD);
        oracle.addAsset("ETH", ETH_USD);
        oracle.addAsset("SOL", SOL_USD);
        oracle.addAsset("BNB", BNB_USD);
        oracle.addAsset("XRP", XRP_USD);
        oracle.addAsset("DOGE", DOGE_USD);
        oracle.addAsset("ADA", ADA_USD);
        oracle.addAsset("AVAX", AVAX_USD);
        oracle.addAsset("LINK", LINK_USD);
        oracle.addAsset("DOT", DOT_USD);
        console.log("Pyth assets added: BTC ETH SOL BNB XRP DOGE ADA AVAX LINK DOT");

        Vault vault = new Vault(address(eusd), address(oracle), deployer);
        console.log("Vault deployed at:      ", address(vault));

        Router router = new Router(address(eusd), address(vault), deployer);
        console.log("Router deployed at:     ", address(router));

        vault.setRouter(address(router));
        console.log("Router linked to Vault");

        address keeperBot = vm.envOr("KEEPER_ADDRESS", address(0));
        if (keeperBot != address(0)) {
            router.setKeeper(keeperBot, true);
            eusd.setFaucetRelayer(keeperBot, true);
            console.log("Keeper enabled:", keeperBot);
            console.log("Faucet relayer enabled:", keeperBot);
        } else {
            console.log("KEEPER_ADDRESS not set - no keeper enabled");
        }

        uint256 seedAmount = 500_000e18;
        eusd.approve(address(vault), seedAmount);
        vault.addLiquidity(seedAmount);
        console.log("Seeded liquidity:", seedAmount / 1e18, "eUSD");

        vm.stopBroadcast();

        console.log("\n=== Deployment Summary ===");
        console.log("eUSD:       ", address(eusd));
        console.log("PythOracle: ", address(oracle));
        console.log("Vault:      ", address(vault));
        console.log("Router:     ", address(router));
        console.log("==========================");
    }
}
