/**
 * GMI Cloud Models-as-a-Service (MaaS) Client
 * Built for GMI Agentbox runtime injection
 *
 * GMI_MAAS_API_KEY di-inject GMI ke runtime sandbox (bukan di-bake ke image).
 * Key hanya dibaca di sisi server - tidak pernah dikirim ke browser.
 */

const GMI_BASE_URL = process.env.GMI_BASE_URL || 'https://api.gmi-serving.com/v1';

// Model ID yang dipakai kalau tidak ada request eksplisit.
// WAJIB memakai ID yang benar-benar ada di katalog GMI, contoh:
//   deepseek-ai/DeepSeek-V3.2 / deepseek-ai/DeepSeek-V3-0324
//   deepseek-ai/DeepSeek-R1-0528 / deepseek-ai/DeepSeek-V4-Flash
const FALLBACK_MODEL = 'deepseek-ai/DeepSeek-V3.2';

/**
 * Model ID yang terverifikasi ada di katalog GMI Cloud.
 * Dipakai sebagai fallback kalau /v1/models tidak bisa dihubungi
 * (mis. GMI_MAAS_API_KEY belum di-inject saat development lokal).
 */
export const KNOWN_MODELS = [
  'deepseek-ai/DeepSeek-V3.2',
  'deepseek-ai/DeepSeek-V3-0324',
  'deepseek-ai/DeepSeek-R1-0528',
  'deepseek-ai/DeepSeek-V4-Flash',
  'deepseek-ai/DeepSeek-V3.1-Terminus'
];

// Cache daftar model dari /v1/models supaya tidak memanggil API tiap request.
const MODEL_CACHE_TTL_MS = 5 * 60 * 1000;
let modelCache = { at: 0, ids: null };

/**
 * Key hanya dari environment server. Tidak pernah menerima key dari request/body.
 */
export function getApiKey() {
  return process.env.GMI_MAAS_API_KEY || process.env.GMI_INFERENCE_API_KEY || '';
}

/**
 * Susun urutan pilihan model:
 *   1. model yang diminta klien (hanya kalau ada di daftar model live)
 *   2. env DEFAULT_MODEL
 *   3. env GMI_MODELS (hanya kalau formatnya "org/nama-model")
 *   4. fallback hardcoded
 */
export async function resolveModel(requested) {
  const fromEnv = process.env.DEFAULT_MODEL
    || (process.env.GMI_MODELS && process.env.GMI_MODELS.includes('/') ? process.env.GMI_MODELS : '')
    || FALLBACK_MODEL;

  if (typeof requested !== 'string' || !requested.includes('/')) {
    return fromEnv;
  }

  // Kalau daftar live tersedia, hanya izinkan model yang benar-benar ada.
  const live = await listModels().catch(() => null);
  if (live && live.length > 0 && !live.includes(requested)) {
    return fromEnv;
  }
  return requested;
}

/**
 * Daftar model yang tersedia di GMI MaaS. Dis-cache 5 menit.
 * Balikin array of model id, atau null kalau key belum di-inject / API gagal.
 */
export async function listModels() {
  const token = getApiKey();
  if (!token) return null;

  const now = Date.now();
  if (modelCache.ids && now - modelCache.at < MODEL_CACHE_TTL_MS) {
    return modelCache.ids;
  }

  const response = await fetch(`${GMI_BASE_URL}/models`, {
    headers: { 'Authorization': `Bearer ${token}` },
    signal: AbortSignal.timeout(20000)
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`GMI API Error (${response.status}) saat /models: ${errorText}`);
  }

  const data = await response.json();
  const ids = (data.data || [])
    .map((m) => m.id)
    .filter((id) => typeof id === 'string' && id.includes('/'));

  modelCache = { at: now, ids };
  return ids;
}

export async function chatCompletion({ messages, model, stream = false }) {
  const token = getApiKey();
  if (!token) {
    throw new Error('GMI_MAAS_API_KEY tidak ditemukan. GMI meng-inject key ini otomatis saat sandbox berjalan.');
  }

  const resolvedModel = await resolveModel(model);

  const response = await fetch(`${GMI_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      model: resolvedModel,
      messages,
      stream
    }),
    signal: AbortSignal.timeout(120000)
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`GMI API Error (${response.status}): ${errorText}`);
  }

  return response;
}
