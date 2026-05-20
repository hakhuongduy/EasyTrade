import { ethers } from "ethers";

// ABI tối giản cho từng contract — chỉ export các hàm frontend cần dùng
const EUSD_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address, address) view returns (uint256)",
  "function approve(address, uint256) returns (bool)",
  "function faucet()",
  "function faucetFor(address)",
  "function faucetCooldownRemaining(address) view returns (uint256)",
  "function faucetRelayers(address) view returns (bool)",
  "function nonces(address) view returns (uint256)",
  "function permit(address,address,uint256,uint256,uint8,bytes32,bytes32)",
  "function FAUCET_AMOUNT() view returns (uint256)",
  "function FAUCET_COOLDOWN() view returns (uint256)",
];

const VAULT_ABI = [
  "function getPosition(address, string, bool) view returns (uint256 size, uint256 collateral, uint256 averagePrice, bool isLong, uint256 lastUpdated)",
  "function getPositionPnl(address, string, bool) view returns (int256)",
  "function isLiquidatable(address, string, bool) view returns (bool, uint256)",
  "function availableLiquidity() view returns (uint256)",
  "function poolAmount() view returns (uint256)",
  "function addLiquidity(uint256)",
  "function getOracleUpdateFee(bytes[] calldata) view returns (uint256)",
];

const ROUTER_ABI = [
  "function increasePosition(string, uint256, uint256, bool)",
  "function increasePositionWithPriceUpdate(string, uint256, uint256, bool, bytes[]) payable",
  "function increasePositionForWithPriceUpdate(address, string, uint256, uint256, bool, bytes[]) payable",
  "function increasePositionForWithPermitAndPriceUpdate(address, string, uint256, uint256, bool, bytes[], uint256, uint8, bytes32, bytes32) payable",
  "function decreasePosition(string, uint256, uint256, bool)",
  "function decreasePositionWithPriceUpdate(string, uint256, uint256, bool, bytes[]) payable",
  "function decreasePositionFor(address, string, uint256, uint256, bool, address)",
  "function decreasePositionForWithPriceUpdate(address, string, uint256, uint256, bool, address, bytes[]) payable",
  "function getPosition(address, string, bool) view returns (uint256, uint256, uint256, bool, uint256)",
  "function getPositionPnl(address, string, bool) view returns (int256)",
  "function isLiquidatable(address, string, bool) view returns (bool, uint256)",
  "function getOracleUpdateFee(bytes[]) view returns (uint256)",
];

const ORACLE_ABI = [
  "function getPrice(string) view returns (uint256 price, uint256 timestamp)",
  "function getPriceUnsafe(string) view returns (uint256 price, uint256 timestamp)",
  "function getUpdateFee(bytes[]) view returns (uint256)",
  "function updatePriceFeeds(bytes[]) payable",
  "function priceFeedIds(string) view returns (bytes32)",
];

export type EthereumProvider = ethers.Eip1193Provider & {
  isMetaMask?: boolean;
  providers?: EthereumProvider[];
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

let activeProvider: EthereumProvider | null = null;

export function setActiveProvider(p: EthereumProvider | null) {
  activeProvider = p;
}

// Tìm đúng MetaMask khi có nhiều wallet extension (Trust, Coinbase, ...)
function getMetaMaskProvider(): EthereumProvider | null {
  if (typeof window === "undefined") return null;
  const eth = (window as unknown as { ethereum?: EthereumProvider }).ethereum;
  if (!eth) return null;
  // Nếu có mảng providers (EIP-6963 / multi-wallet), tìm MetaMask
  if (eth.providers?.length) {
    return eth.providers.find((p) => p.isMetaMask) ?? eth.providers[0];
  }
  return eth;
}

export function getProvider() {
  const eth = activeProvider ?? getMetaMaskProvider();
  if (eth) return new ethers.BrowserProvider(eth);
  return new ethers.JsonRpcProvider(process.env.NEXT_PUBLIC_RPC_URL);
}

export async function getSigner() {
  const provider = getProvider();
  if (provider instanceof ethers.BrowserProvider) {
    return provider.getSigner();
  }
  throw new Error("Không có ví MetaMask");
}

export function getEUSDContract(signerOrProvider?: ethers.Signer | ethers.Provider) {
  const p = signerOrProvider ?? getProvider();
  return new ethers.Contract(process.env.NEXT_PUBLIC_EUSD_ADDRESS!, EUSD_ABI, p);
}

export function getVaultContract(signerOrProvider?: ethers.Signer | ethers.Provider) {
  const p = signerOrProvider ?? getProvider();
  return new ethers.Contract(process.env.NEXT_PUBLIC_VAULT_ADDRESS!, VAULT_ABI, p);
}

export function getRouterContract(signerOrProvider?: ethers.Signer | ethers.Provider) {
  const p = signerOrProvider ?? getProvider();
  return new ethers.Contract(process.env.NEXT_PUBLIC_ROUTER_ADDRESS!, ROUTER_ABI, p);
}

export function getOracleContract(signerOrProvider?: ethers.Signer | ethers.Provider) {
  const p = signerOrProvider ?? getProvider();
  return new ethers.Contract(process.env.NEXT_PUBLIC_ORACLE_ADDRESS!, ORACLE_ABI, p);
}

// Base Mainnet chain ID = 8453
export const BASE_CHAIN_ID = 8453;

export const BASE_NETWORK = {
  chainId: "0x2105",
  chainName: "Base",
  nativeCurrency: { name: "Ethereum", symbol: "ETH", decimals: 18 },
  rpcUrls: [process.env.NEXT_PUBLIC_RPC_URL!],
  blockExplorerUrls: ["https://basescan.org"],
};
