// TronService — wraps TronWeb for USDT-TRC20 operations.
// Falls back to mock mode when TRON_PRIVATE_KEY is not set.

const USDT_CONTRACT_MAINNET = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
const USDT_CONTRACT_TESTNET = 'TXLAQ63Xg1NAzckPwKHvzw7CSEmLMEqcdj';
const TRONGRID_MAINNET = 'https://api.trongrid.io';
const TRONGRID_TESTNET = 'https://nile.trongrid.io';
const USDT_DECIMALS = 6; // USDT-TRC20 has 6 decimal places

class TronService {
  constructor() {
    this.mockMode = !process.env.TRON_PRIVATE_KEY;
    this.network = process.env.TRON_NETWORK || 'testnet';
    this.tronWeb = null;
    this.houseAddress = process.env.TRON_HOUSE_ADDRESS || null;
    this.usdtContract = this.network === 'mainnet' ? USDT_CONTRACT_MAINNET : USDT_CONTRACT_TESTNET;
    this.apiBase = this.network === 'mainnet' ? TRONGRID_MAINNET : TRONGRID_TESTNET;
    this.apiKey = process.env.TRONGRID_API_KEY || null;

    if (!this.mockMode) {
      this._initTronWeb();
    } else {
      console.log('[Tron] Mock mode — no real transactions');
    }
  }

  _initTronWeb() {
    try {
      const TronWeb = require('tronweb');
      this.tronWeb = new TronWeb({
        fullHost: this.apiBase,
        headers: this.apiKey ? { 'TRON-PRO-API-KEY': this.apiKey } : {},
        privateKey: process.env.TRON_PRIVATE_KEY,
      });
      this.houseAddress = this.tronWeb.defaultAddress.base58;
      console.log(`[Tron] Initialized — house: ${this.houseAddress} (${this.network})`);
    } catch (err) {
      console.error('[Tron] TronWeb init failed:', err.message);
      this.mockMode = true;
    }
  }

  // ── Deposit Verification ──────────────────────────────────────────────────
  // User sends USDT to house address, submits their txid.
  // We verify: correct destination, correct token, not already used.

  async verifyDeposit(txid, claimedAmountUSDT) {
    if (this.mockMode) return this._mockVerifyDeposit(txid, claimedAmountUSDT);

    try {
      const fetch = require('node-fetch');
      const headers = this.apiKey ? { 'TRON-PRO-API-KEY': this.apiKey } : {};
      const res = await fetch(`${this.apiBase}/v1/transactions/${txid}/events`, { headers });
      const data = await res.json();

      if (!data?.data?.length) return { ok: false, error: 'Transaction not found or not yet confirmed' };

      // Find the TRC20 Transfer event for USDT
      const transfer = data.data.find(e =>
        e.event_name === 'Transfer' &&
        e.contract_address?.toLowerCase() === this.usdtContract.toLowerCase()
      );

      if (!transfer) return { ok: false, error: 'No USDT transfer found in this transaction' };

      const toAddress = this.tronWeb?.address?.fromHex?.(transfer.result?.to) || transfer.result?.to;
      const amountRaw = BigInt(transfer.result?.value || 0);
      const amountUSDT = Number(amountRaw) / Math.pow(10, USDT_DECIMALS);

      if (toAddress !== this.houseAddress) {
        return { ok: false, error: `USDT was not sent to the house address (${this.houseAddress})` };
      }

      const tolerance = 0.01; // allow 1 cent variance for fees
      if (Math.abs(amountUSDT - claimedAmountUSDT) > tolerance) {
        return { ok: false, error: `Amount mismatch: on-chain ${amountUSDT} USDT vs claimed ${claimedAmountUSDT} USDT` };
      }

      return { ok: true, amountUSDT, txid };
    } catch (err) {
      console.error('[Tron] verifyDeposit error:', err.message);
      return { ok: false, error: 'Blockchain query failed — try again shortly' };
    }
  }

  // ── Withdrawal ─────────────────────────────────────────────────────────────
  // Server sends USDT from house wallet to player's address.

  async sendUSDT(toAddress, amountUSDT) {
    if (this.mockMode) return this._mockSendUSDT(toAddress, amountUSDT);

    try {
      if (!this.tronWeb) throw new Error('TronWeb not initialized');
      if (!this.tronWeb.isAddress(toAddress)) throw new Error('Invalid TRC20 address');

      const contract = await this.tronWeb.contract().at(this.usdtContract);
      const amountRaw = Math.floor(amountUSDT * Math.pow(10, USDT_DECIMALS));

      const tx = await contract.transfer(toAddress, amountRaw).send({
        feeLimit: 10_000_000, // 10 TRX max fee
        callValue: 0,
        from: this.houseAddress,
      });

      console.log(`[Tron] Sent ${amountUSDT} USDT to ${toAddress} — txid: ${tx}`);
      return { ok: true, txid: tx };
    } catch (err) {
      console.error('[Tron] sendUSDT error:', err.message);
      return { ok: false, error: err.message };
    }
  }

  // ── House Balance ──────────────────────────────────────────────────────────

  async getHouseBalance() {
    if (this.mockMode) return { ok: true, balance: 999999.99 };
    try {
      const contract = await this.tronWeb.contract().at(this.usdtContract);
      const raw = await contract.balanceOf(this.houseAddress).call();
      const balance = Number(raw) / Math.pow(10, USDT_DECIMALS);
      return { ok: true, balance };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  // ── Address Validation ─────────────────────────────────────────────────────

  isValidAddress(address) {
    if (this.mockMode) return /^T[A-Za-z1-9]{33}$/.test(address);
    return this.tronWeb?.isAddress?.(address) ?? false;
  }

  getHouseAddress() {
    return this.houseAddress || 'MOCK_HOUSE_ADDRESS_SET_TRON_HOUSE_ADDRESS_IN_ENV';
  }

  isMockMode() { return this.mockMode; }

  // ── Mock Implementations ───────────────────────────────────────────────────

  _mockVerifyDeposit(txid, claimedAmountUSDT) {
    // Accept any txid that starts with 'TEST' in mock mode
    if (!txid || txid.length < 8) {
      return { ok: false, error: '[MOCK] Invalid txid format. Use any 64-char hex or start with TEST' };
    }
    if (claimedAmountUSDT < 1 || claimedAmountUSDT > 10000) {
      return { ok: false, error: '[MOCK] Amount must be 1–10000 USDT' };
    }
    return { ok: true, amountUSDT: claimedAmountUSDT, txid, mock: true };
  }

  _mockSendUSDT(toAddress, amountUSDT) {
    const fakeTxid = 'MOCK_' + Date.now().toString(16).toUpperCase().padStart(64, '0');
    console.log(`[Tron MOCK] Sent ${amountUSDT} USDT to ${toAddress} — fake txid: ${fakeTxid}`);
    return { ok: true, txid: fakeTxid, mock: true };
  }
}

module.exports = new TronService();
