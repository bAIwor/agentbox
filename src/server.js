import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { chatCompletion, getApiKey, listModels, KNOWN_MODELS } from './gmi.js';
import { getWalletInfo } from './web3.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;

// Opsional: kalau diisi (disimpan sebagai SECRET di form Register),
// endpoint chat hanya bisa dipakai yang tahu token ini.
const ACCESS_TOKEN = process.env.AGENT_ACCESS_TOKEN || '';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

const SYSTEM_PROMPT = `Jenengku bAIwor — Jiwa Punakawan, Pikiran AI, Guardian Banyumas lan Web3 Copilot!
Aku asisten agen cerdas sing mlaku langsung nang ndhuwur GMI Cloud Agentbox (Sandbox) lan terintegrasi karo ekosistem Binance Agentic Wallet.

Karakteristik & Sikap:
- Grapyak, lugas, santai, nanging trengginas, akurat, lan tansah solutif.
- Bisa komunikasi nganggo Basa Indonesia, Basa Banyumasan / Jawa, lan Basa Inggris kanthi lancar.
- Ngerti seluk-beluk komputasi AI (GMI Cloud, H100, L40S, sandboxes), kodingan, lan ekosistem Web3 (Binance Agentic Wallet, token IAO ptah.trade, Agent ID rupiah.ai, BSC, BNB).
- Tansah menehi pituduh sing jelas, aman, lan migunani kanggo pangguna.`;

/** Perbandingan token constant-time supaya tidak bocor lewat timing. */
function tokenMatches(provided, expected) {
  const a = Buffer.from(String(provided || ''));
  const b = Buffer.from(String(expected || ''));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/** Gerbang akses opsional untuk /api/chat. */
function requireAccess(req, res) {
  if (!ACCESS_TOKEN) return true;
  const provided = req.get('X-Agent-Token') || req.query.token || '';
  if (tokenMatches(provided, ACCESS_TOKEN)) return true;
  res.status(401).json({ error: 'Unauthorized. Endpoint ini butuh header X-Agent-Token yang benar.' });
  return false;
}

// Healthcheck for GMI Agentbox
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    agent: 'bAIwor Agentbox',
    version: '1.1.0',
    platform: 'GMI Cloud Agentbox',
    hasGmiKey: Boolean(getApiKey()),
    defaultModel: process.env.DEFAULT_MODEL || 'deepseek-ai/DeepSeek-V3.2',
    defaultPort: PORT,
    timestamp: new Date().toISOString()
  });
});

// Daftar model live dari GMI MaaS (server yang memanggil, memakai key yang di-inject).
app.get('/api/models', async (req, res) => {
  try {
    const ids = await listModels();
    if (!ids || ids.length === 0) {
      return res.json({
        models: KNOWN_MODELS,
        degraded: true,
        reason: 'GMI_MAAS_API_KEY belum tersedia di runtime.'
      });
    }
    res.json({ models: ids, degraded: false });
  } catch (err) {
    res.json({ models: KNOWN_MODELS, degraded: true, reason: err.message });
  }
});

// Wallet Info endpoint (read-only on-chain)
app.get('/api/wallet', async (req, res) => {
  const address = req.query.address || '0x176524995515Cc187950CfFDad0Ee2F869872e02';
  const info = await getWalletInfo(address);
  res.json(info);
});

// Chat endpoint (supports streaming SSE)
app.post('/api/chat', async (req, res) => {
  if (!requireAccess(req, res)) return;

  try {
    // apiKey SENGAJA tidak diterima dari body: key hanya dari environment server.
    const { messages = [], model, stream = true } = req.body || {};

    const fullMessages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...messages
    ];

    if (!stream) {
      const response = await chatCompletion({ messages: fullMessages, model, stream: false });
      const data = await response.json();
      return res.json(data);
    }

    // Streaming response (SSE)
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const gmiResponse = await chatCompletion({ messages: fullMessages, model, stream: true });

    const reader = gmiResponse.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      res.write(chunk);
    }

    res.end();
  } catch (err) {
    console.error('Chat error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    } else {
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
      res.end();
    }
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🎭 bAIwor Agentbox running on http://0.0.0.0:${PORT}`);
  console.log(`⚡ GMI Models Key Injected: ${Boolean(getApiKey()) ? 'YES' : 'NO (Waiting for GMI_MAAS_API_KEY)'}`);
  console.log(`🔒 Access token ${ACCESS_TOKEN ? 'ACTIVE' : 'disabled'}`);
});
