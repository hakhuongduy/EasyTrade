#!/usr/bin/env node
import { ethers } from "ethers";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  const envPath = resolve(__dirname, "../.env.local");
  const raw = readFileSync(envPath, "utf8");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnv();

const INTERVAL_MS = parseInt(process.argv[2] ?? "15", 10) * 1000;
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL;
const PRIVATE_KEY = process.env.KEEPER_PRIVATE_KEY;
const ORACLE_ADDR = process.env.NEXT_PUBLIC_ORACLE_ADDRESS;

if (!RPC_URL || !PRIVATE_KEY || !ORACLE_ADDR) {
  console.error("Missing env: NEXT_PUBLIC_RPC_URL | KEEPER_PRIVATE_KEY | NEXT_PUBLIC_ORACLE_ADDRESS");
  process.exit(1);
}

const ORACLE_ABI = [
  "function getUpdateFee(bytes[] calldata updateData) external view returns (uint256)",
  "function updatePriceFeeds(bytes[] calldata updateData) external payable",
];

const FEEDS = {
  BTC: "e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43",
  ETH: "ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace",
  SOL: "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d",
  BNB: "2f95862b045670cd22bee3114c39763a4a08beeb663b145d283c31d7d1101c4f",
  XRP: "ec5d399846a9209f3fe5881d70aae9268c94339ff9817e8d18ff19fa05eea1c8",
  DOGE: "dcef50dd0a4cd2dcc17e45df1676dcb336a11a61c69df7a0299b0150c672d25c",
  ADA: "2a01deaec9e51a579277b34b122399984d0bbf57e2458a7e42fecd2829867a0d",
  AVAX: "93da3352f9f1d105fdfe4971cfa80e9dd777bfc5d0f683ebb6e1294b92137bb7",
  LINK: "8ac0c70fff57e9aefdf5edf44b51d62c2d433653cbb2cf5cc06bb115af04d221",
  DOT: "ca3eed9b267293f6595901c734c7525ce8ef49adafe8284606ceb307afa2ca5b",
};

const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
const oracle = new ethers.Contract(ORACLE_ADDR, ORACLE_ABI, wallet);

async function fetchPythUpdate() {
  const params = new URLSearchParams({ encoding: "hex", parsed: "true" });
  for (const id of Object.values(FEEDS)) params.append("ids[]", id);
  const res = await fetch(`https://hermes.pyth.network/v2/updates/price/latest?${params.toString()}`);
  if (!res.ok) throw new Error(`Hermes ${res.status}`);
  const data = await res.json();
  return {
    updateData: (data.binary?.data ?? []).map((hex) => `0x${hex}`),
    parsed: data.parsed ?? [],
  };
}

async function tick() {
  const t0 = Date.now();
  try {
    const { updateData, parsed } = await fetchPythUpdate();
    const fee = await oracle.getUpdateFee(updateData);
    const tx = await oracle.updatePriceFeeds(updateData, { value: fee });
    await tx.wait();

    const btcFeed = parsed.find((p) => p.id === FEEDS.BTC);
    const btc = btcFeed ? Number(btcFeed.price.price) * Math.pow(10, btcFeed.price.expo) : null;
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(
      `[${new Date().toLocaleTimeString("vi-VN")}] OK | BTC=$${btc?.toLocaleString("en-US", { maximumFractionDigits: 2 }) ?? "?"} | tx=${tx.hash.slice(0, 10)}... | ${elapsed}s`
    );
  } catch (err) {
    console.error(`[${new Date().toLocaleTimeString("vi-VN")}] ERR:`, err.shortMessage ?? err.message);
  }
}

console.log("=== EasyTrade Pyth Keeper ===");
console.log(`Oracle: ${ORACLE_ADDR}`);
console.log(`Wallet: ${wallet.address}`);
console.log(`Interval: ${INTERVAL_MS / 1000}s`);
console.log(`Assets: ${Object.keys(FEEDS).join(", ")}`);
console.log("=============================\n");

tick();
setInterval(tick, INTERVAL_MS);
