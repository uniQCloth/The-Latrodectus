// EthService (replaces TronService) — wraps ethers.js for USDT-ERC20 on Ethereum.
// Same export interface as before so WithdrawalProcessor/DepositVerifier need no changes.
// Falls back to mock mode when ETH_PRIVATE_KEY is not set — deposit address still shown.

const USDT_CONTRACT_MAINNET = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
const USDT_CONTRACT_TESTNET = '0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0'; // Sepolia
const USDT_ABI = [
  'function transfer(address to, uint256 value) returns (bool)',
  'function balanceOf(address owner) view returns (uint256)',
  'event Transfer(address indexed from, address indexed to, uint256 value)',
];
const USDT_DECIMALS = 6;

class EthService {
  constructor() {
    this.network      = process.env.ETH_NETWORK || 'mainnet';
    this.mockMode     = !process.env.ETH_PRIVATE_KEY;
    // Deposit address shown to players — set even in mock mode
    this.houseAddress = process.env.ETH_HOUSE_ADDRESS || null;
    this.contractAddr = this.network === 'mainnet' ? USDT_CONTRACT_MAINNET : USDT_CONTRACT_TESTNET;
    this.rpcUrl       = process.env.ETH_RPC_URL
      || (this.network === 'mainnet' ? 'https://cloudflare-eth.com' : 'https://rpc.sepolia.org');
    this.etherscanKey = process.env.ETHERSCAN_API_KEY || null;
    this.provider     = null;
    this.wallet       = null;

    if (!this.mockMode) {
      this._init();
    } else {
      console.log('[ETH] Mock mode — set ETH_PRIVATE_KEY to enable live transactions');
      if (this.houseAddress) console.log(`[ETH] Deposit address: ${this.houseAddress} (${this.network})`);
    }
  }

  _init() {
    try {
      const { ethers } = require('ethers');
      this.provider     = new ethers.JsonRpcProvider(this.rpcUrl);
      this.wallet       = new ethers.Wallet(process.env.ETH_PRIVATE_KEY, this.provider);
      this.houseAddress = this.wallet.address;
      console.log(`[ETH] Live mode — house: ${this.houseAddress} (${this.network})`);
    } catch (err) {
      console.error('[ETH] ethers init failed:', err.message);
      this.mockMode = true;
    }
  }

  // ── Deposit Verification ───────────────────────────────────────────────────
  // Player sends USDT to houseAddress, submits txHash + amount.
  // We verify on-chain via Etherscan: correct destination, correct token, amount matches.

  async verifyDeposit(txHash, claimedAmountUSDT) {
    if (this.mockMode) return this._mockVerifyDeposit(txHash, claimedAmountUSDT);
    try {
      const fetch    = require('node-fetch');
      const { ethers } = require('ethers');
      const base     = this.network === 'mainnet'
        ? 'https://api.etherscan.io/api'
        : 'https://api-sepolia.etherscan.io/api';

      const params = new URLSearchParams({
        module: 'proxy', action: 'eth_getTransactionReceipt', txhash: txHash,
        ...(this.etherscanKey ? { apikey: this.etherscanKey } : {}),
      });

      const res     = await fetch(`${base}?${params}`);
      const data    = await res.json();
      const receipt = data?.result;

      if (!receipt)           return { ok: false, error: 'Transaction not found or not yet confirmed (may need 1–3 minutes)' };
      if (receipt.status !== '0x1') return { ok: false, error: 'Transaction failed on-chain' };

      // Find USDT Transfer log
      const iface = new ethers.Interface(USDT_ABI);
      const log   = receipt.logs?.find(l => l.address?.toLowerCase() === this.contractAddr.toLowerCase());
      if (!log) return { ok: false, error: 'No USDT-ERC20 transfer found in this transaction' };

      const parsed     = iface.parseLog(log);
      const toAddress  = parsed.args[1];
      const amountRaw  = parsed.args[2];
      const amountUSDT = Number(amountRaw) / Math.pow(10, USDT_DECIMALS);

      if (toAddress.toLowerCase() !== this.houseAddress?.toLowerCase()) {
        return { ok: false, error: `USDT was not sent to the deposit address (${this.houseAddress})` };
      }
      if (Math.abs(amountUSDT - claimedAmountUSDT) > 0.01) {
        return { ok: false, error: `Amount mismatch: on-chain ${amountUSDT} USDT vs claimed ${claimedAmountUSDT} USDT` };
      }

      return { ok: true, amountUSDT, txid: txHash };
    } catch (err) {
      console.error('[ETH] verifyDeposit error:', err.message);
      return { ok: false, error: 'Blockchain query failed — try again in a moment' };
    }
  }

  // ── Withdrawal ────────────────────────────────────────────────────────────
  // House wallet sends USDT to player's Ethereum address.

  async sendUSDT(toAddress, amountUSDT) {
    if (this.mockMode) return this._mockSendUSDT(toAddress, amountUSDT);
    try {
      const { ethers } = require('ethers');
      if (!ethers.isAddress(toAddress)) throw new Error('Invalid Ethereum address');
      const contract = new ethers.Contract(this.contractAddr, USDT_ABI, this.wallet);
      const amountRaw = BigInt(Math.floor(amountUSDT * Math.pow(10, USDT_DECIMALS)));
      const tx = await contract.transfer(toAddress, amountRaw);
      console.log(`[ETH] Sent ${amountUSDT} USDT → ${toAddress} | txHash: ${tx.hash}`);
      return { ok: true, txid: tx.hash };
    } catch (err) {
      console.error('[ETH] sendUSDT error:', err.message);
      return { ok: false, error: err.message };
    }
  }

  // ── House (Hot Wallet) Balance ────────────────────────────────────────────

  async getHouseBalance() {
    if (this.mockMode) return { ok: true, balance: 0, mock: true };
    try {
      const { ethers }  = require('ethers');
      const contract    = new ethers.Contract(this.contractAddr, USDT_ABI, this.provider);
      const raw         = await contract.balanceOf(this.houseAddress);
      const balance     = Number(raw) / Math.pow(10, USDT_DECIMALS);
      return { ok: true, balance };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  // ── Cold Wallet ───────────────────────────────────────────────────────────

  getColdWalletAddress() {
    return process.env.ETH_COLD_WALLET || null;
  }

  async getColdWalletBalance() {
    const coldAddress = process.env.ETH_COLD_WALLET;
    if (!coldAddress) return { ok: false, error: 'ETH_COLD_WALLET not set' };
    if (this.mockMode) return { ok: true, balance: 0, mock: true };
    try {
      const { ethers } = require('ethers');
      const contract   = new ethers.Contract(this.contractAddr, USDT_ABI, this.provider);
      const raw        = await contract.balanceOf(coldAddress);
      const balance    = Number(raw) / Math.pow(10, USDT_DECIMALS);
      return { ok: true, balance };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  // ── Address Validation ────────────────────────────────────────────────────

  isValidAddress(address) {
    if (!address) return false;
    try {
      const { ethers } = require('ethers');
      return ethers.isAddress(address);
    } catch {
      return /^0x[0-9a-fA-F]{40}$/.test(address);
    }
  }

  getHouseAddress() {
    return this.houseAddress || 'SET ETH_HOUSE_ADDRESS IN ENV';
  }

  isMockMode() { return this.mockMode; }

  // ── Mock Implementations ──────────────────────────────────────────────────

  _mockVerifyDeposit(txHash, claimedAmountUSDT) {
    if (!txHash || txHash.length < 8)
      return { ok: false, error: '[MOCK] Invalid txHash — paste your real 0x… transaction hash' };
    if (claimedAmountUSDT < 1 || claimedAmountUSDT > 10000)
      return { ok: false, error: '[MOCK] Amount must be 1–10000 USDT' };
    return { ok: true, amountUSDT: claimedAmountUSDT, txid: txHash, mock: true };
  }

  _mockSendUSDT(toAddress, amountUSDT) {
    const fakeTx = '0x' + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
    console.log(`[ETH MOCK] Sent ${amountUSDT} USDT → ${toAddress} | fake txHash: ${fakeTx}`);
    return { ok: true, txid: fakeTx, mock: true };
  }
}

module.exports = new EthService();
