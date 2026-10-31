/**
 * bAIwor Web3 & On-Chain Inspector
 *
 * READ-ONLY. Tidak ada private key, tidak ada signing, tidak ada transaksi.
 * Binance Agentic Wallet (baw) tidak dipakai di sini karena butuh login QR
 * dari aplikasi Binance + keychain OS, yang tidak tersedia di dalam container
 * sandbox GMI Agentbox.
 *
 * Semua angka berasal langsung dari RPC BSC saat runtime.
 * Kalau RPC tidak bisa dihubungi, jawabannya "tidak tersedia" - BUKAN angka tebakan.
 */

const DEFAULT_RPC_URLS = [
  'https://bsc-rpc.publicnode.com',
  'https://bsc-dataseed.bnbchain.org',
  'https://bsc-dataseed1.defibit.io',
  'https://1rpc.io/bnb'
];

// BSC_RPC_URLS (daftar, dipisah koma) = config utama.
// BSC_RPC_URL (tunggal) tetap didukung supaya .env lama tidak langsung mati.
const RPC_URLS = process.env.BSC_RPC_URLS
  ? process.env.BSC_RPC_URLS.split(',').map((s) => s.trim()).filter(Boolean)
  : process.env.BSC_RPC_URL
    ? [process.env.BSC_RPC_URL, ...DEFAULT_RPC_URLS]
    : DEFAULT_RPC_URLS;

const IAO_TOKEN_ADDRESS = '0x0810c5eb5d86d1B8D408F75Bd1f5ABeFb6d79999';
const NATIVE_TOKEN_CONTRACT = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
const DEFAULT_AGENT_ID = 'rupiah.ai';
const DEFAULT_WALLET = '0x176524995515Cc187950CfFDad0Ee2F869872e02';

// ERC20 function selectors
const SELECTOR_BALANCE_OF = '0x70a08231';
const SELECTOR_DECIMALS = '0x313ce567';
const SELECTOR_SYMBOL = '0x95d89b41';
const SELECTOR_NAME = '0x06fdde03';

let activeRpc = RPC_URLS[0];

function encodeAddress(address) {
  return address.toLowerCase().replace('0x', '').padStart(64, '0');
}

function encodeBalanceOf(address) {
  return `${SELECTOR_BALANCE_OF}${encodeAddress(address)}`;
}

function hexToBigInt(hex) {
  if (!hex || hex === '0x') return 0n;
  try {
    return BigInt(hex);
  } catch {
    return 0n;
  }
}

function decodeUint(hex) {
  return Number(hexToBigInt(hex));
}

function decodeString(hex) {
  try {
    if (!hex || hex === '0x') return '';
    const clean = hex.slice(2);
    const bytes = new Uint8Array(clean.length / 2);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(clean.substr(i * 2, 2), 16);
    }
    const len = new DataView(bytes.buffer).getUint32(32);
    return new TextDecoder().decode(bytes.slice(36, 36 + len));
  } catch {
    return '';
  }
}

/** Ubah satuan raw token jadi satuan token manusiawi (tanpa pemisah ribuan). */
function formatUnits(raw, decimals) {
  const value = Number(raw) / 10 ** decimals;
  if (!Number.isFinite(value)) return '0';
  return String(Number(value.toFixed(8)));
}

/**
 * Panggil JSON-RPC, coba endpoint satu per satu sampai ada yang berhasil.
 */
async function rpcCall(method, params = []) {
  let lastError = null;
  for (const url of RPC_URLS) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
        signal: AbortSignal.timeout(15000)
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error.message || 'RPC Error');
      activeRpc = url;
      return data.result;
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(`Semua endpoint BSC RPC gagal (${RPC_URLS.length} dicoba): ${lastError?.message || 'tidak diketahui'}`);
}

async function readErc20(tokenAddress, address, defaultSymbol = 'UNKNOWN') {
  const [decimalsHex, symbolHex, nameHex, balanceHex] = await Promise.all([
    rpcCall('eth_call', [{ to: tokenAddress, data: SELECTOR_DECIMALS }, 'latest']),
    rpcCall('eth_call', [{ to: tokenAddress, data: SELECTOR_SYMBOL }, 'latest']),
    rpcCall('eth_call', [{ to: tokenAddress, data: SELECTOR_NAME }, 'latest']),
    rpcCall('eth_call', [{ to: tokenAddress, data: encodeBalanceOf(address) }, 'latest'])
  ]);

  let decimals = decodeUint(decimalsHex);
  let decimalsAssumed = false;
  if (!Number.isFinite(decimals) || decimals < 0 || decimals > 36) {
    decimals = 18; // ERC20 standar; ditandai supaya UI bisa jujur soal asumsi ini
    decimalsAssumed = true;
  }

  const raw = hexToBigInt(balanceHex);

  return {
    symbol: decodeString(symbolHex) || defaultSymbol,
    name: decodeString(nameHex) || '',
    decimals,
    decimalsAssumed,
    raw: raw.toString(),
    balance: formatUnits(raw, decimals)
  };
}

export async function getWalletInfo(address = DEFAULT_WALLET) {
  try {
    const bnbWei = await rpcCall('eth_getBalance', [address, 'latest']);
    const iao = await readErc20(IAO_TOKEN_ADDRESS, address, 'IAO');

    return {
      address,
      chain: 'BNB Smart Chain (BSC)',
      chainId: 56,
      agentId: DEFAULT_AGENT_ID,
      available: true,
      rpc: activeRpc,
      fetchedAt: new Date().toISOString(),
      balances: [
        {
          symbol: 'BNB',
          type: 'Native Gas Token',
          balance: formatUnits(hexToBigInt(bnbWei), 18),
          decimals: 18,
          contract: NATIVE_TOKEN_CONTRACT
        },
        {
          symbol: iao.symbol,
          name: iao.name || 'Ptah Trade IAO Token',
          balance: iao.balance,
          decimals: iao.decimals,
          decimalsAssumed: iao.decimalsAssumed,
          contract: IAO_TOKEN_ADDRESS,
          portal: 'https://ptah.trade/iao'
        }
      ]
    };
  } catch (err) {
    // Tidak mengarang angka. Laporkan kondisi sebenarnya.
    return {
      address,
      chain: 'BNB Smart Chain (BSC)',
      chainId: 56,
      agentId: DEFAULT_AGENT_ID,
      available: false,
      reason: err.message,
      fetchedAt: new Date().toISOString(),
      balances: []
    };
  }
}
