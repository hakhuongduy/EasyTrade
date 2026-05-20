import { ethers } from "ethers";
import { getEUSDContract, getSigner, BASE_CHAIN_ID, BASE_NETWORK, setActiveProvider, EthereumProvider } from "./contracts";

export async function connectWallet(selectedProvider?: EthereumProvider): Promise<string> {
  const eth = selectedProvider ??
    (window as unknown as { ethereum?: EthereumProvider }).ethereum;
  if (!eth) throw new Error("Vui lòng cài MetaMask để tiếp tục");

  const accounts = await eth.request({ method: "eth_requestAccounts" }) as string[];
  if (!accounts.length) throw new Error("Không có tài khoản nào được chọn");

  await switchToBase(eth);
  setActiveProvider(eth);
  return accounts[0];
}

async function switchToBase(eth: ethers.Eip1193Provider) {
  try {
    await eth.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: `0x${BASE_CHAIN_ID.toString(16)}` }],
    });
  } catch (err: unknown) {
    // Chain chưa được thêm vào MetaMask (error code 4902)
    if ((err as { code?: number }).code === 4902) {
      await eth.request({ method: "wallet_addEthereumChain", params: [BASE_NETWORK] });
    } else {
      throw err;
    }
  }
}

export async function getEUSDBalance(address: string): Promise<string> {
  const rpcProvider = process.env.NEXT_PUBLIC_RPC_URL ? new ethers.JsonRpcProvider(process.env.NEXT_PUBLIC_RPC_URL) : undefined;
  const contract = getEUSDContract(rpcProvider);
  const raw = await contract.balanceOf(address) as bigint;
  return ethers.formatEther(raw);
}

export async function getFaucetCooldown(address: string): Promise<number> {
  const rpcProvider = process.env.NEXT_PUBLIC_RPC_URL ? new ethers.JsonRpcProvider(process.env.NEXT_PUBLIC_RPC_URL) : undefined;
  const contract = getEUSDContract(rpcProvider);
  const seconds = await contract.faucetCooldownRemaining(address) as bigint;
  return Number(seconds);
}

export async function claimFaucet(address: string): Promise<string> {
  const res = await fetch("/api/faucet", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address }),
  });
  const data = await res.json() as { success?: boolean; txHash?: string; error?: string; alreadyClaimed?: boolean };
  if (!res.ok || !data.success) {
    throw new Error(data.error ?? "Khong the nhan eUSD faucet");
  }
  return data.txHash ?? "";
}

// Approve Router để chi tiêu eUSD (gọi trước khi increasePosition)
export async function approveRouter(amount: bigint): Promise<void> {
  const signer = await getSigner();
  const contract = getEUSDContract(signer);
  const routerAddress = process.env.NEXT_PUBLIC_ROUTER_ADDRESS!;
  const tx = await contract.approve(routerAddress, amount) as { wait: () => Promise<unknown> };
  await tx.wait();
}

export async function checkAllowance(owner: string): Promise<bigint> {
  const contract = getEUSDContract();
  const routerAddress = process.env.NEXT_PUBLIC_ROUTER_ADDRESS!;
  return await contract.allowance(owner, routerAddress) as bigint;
}
