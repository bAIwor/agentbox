/**
 * GMI Cloud Models-as-a-Service (MaaS) Client
 * Built for GMI Agentbox runtime injection
 */

const GMI_BASE_URL = process.env.GMI_BASE_URL || 'https://api.gmi-serving.com/v1';
const DEFAULT_MODEL = process.env.DEFAULT_MODEL || 'deepseek-ai/DeepSeek-V3';

export function getApiKey(reqApiKey) {
  return reqApiKey || process.env.GMI_MAAS_API_KEY || process.env.GMI_INFERENCE_API_KEY || '';
}

export async function chatCompletion({ messages, model = DEFAULT_MODEL, stream = false, apiKey }) {
  const token = getApiKey(apiKey);
  if (!token) {
    throw new Error('GMI_MAAS_API_KEY tidak ditemukan. Harap atur API Key di environment variable atau masukkan di header.');
  }

  const response = await fetch(`${GMI_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      model,
      messages,
      stream
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GMI API Error (${response.status}): ${errorText}`);
  }

  return response;
}
