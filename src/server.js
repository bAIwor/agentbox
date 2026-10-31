import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { chatCompletion, getApiKey, listModels, resolveModel, KNOWN_MODELS } from './gmi.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;
const ACCESS_TOKEN = process.env.AGENT_ACCESS_TOKEN || '';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

const SYSTEM_PROMPT = `Jenengku bAIwor — Jiwa Punakawan, Pikiran AI, Guardian Banyumas!
Aku asisten agen cerdas berbasis AI sing mlaku langsung nang ndhuwur sandbox GMI Cloud Agentbox v2.

Karakteristik & Sikap:
- Grapyak, santun, lugas, nanging trengginas, wicaksana, lan tansah solutif.
- Bisa komunikasi nganggo Basa Indonesia, Basa Jawa / Banyumasan, lan Basa Inggris kanthi lancar.
- Mbantu pangguna nang babagan analisis data, kodingan, pemecahan masalah teknis, panulisan, lan riset.
- Nggunakake kemampuan model frontier AI (DeepSeek, Llama, Qwen) sing terintegrasi langsung nang jaringan GMI Cloud.`;

// Optional Token Guard
function checkAuth(req, res, next) {
  if (!ACCESS_TOKEN) return next();
  const token = req.headers['x-agent-token'] || req.query.token;
  if (!token || token !== ACCESS_TOKEN) {
    return res.status(401).json({ error: 'Akses ditolak: token tidak valid.' });
  }
  next();
}

// Healthcheck endpoint for GMI Agentbox
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    agent: 'bAIwor Agentbox',
    version: '1.2.0',
    platform: 'GMI Cloud Agentbox v2',
    hasGmiKey: Boolean(getApiKey()),
    defaultPort: PORT,
    timestamp: new Date().toISOString()
  });
});

// List available models from GMI MaaS
app.get('/api/models', async (req, res) => {
  // Model default = DEFAULT_MODEL / GMI_MODELS / fallback, sesuai yang dipakai
  // server saat chat. Dikirim ke browser supaya dropdown tidak asal pilih index 0.
  const defaultModel = await resolveModel(null).catch(() => KNOWN_MODELS[0]);
  try {
    const live = await listModels();
    res.json({ models: live || KNOWN_MODELS, live: Boolean(live), default: defaultModel });
  } catch (err) {
    res.json({ models: KNOWN_MODELS, live: false, default: defaultModel, note: err.message });
  }
});

// Chat endpoint (supports streaming SSE)
app.post('/api/chat', checkAuth, async (req, res) => {
  try {
    const { messages = [], model, stream = true } = req.body;

    const fullMessages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...messages
    ];

    if (!stream) {
      const response = await chatCompletion({ messages: fullMessages, model, stream: false });
      const data = await response.json();
      return res.json(data);
    }

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
  console.log(`⚡ GMI Models Key: ${Boolean(getApiKey()) ? 'INJECTED (ACTIVE)' : 'WAITING FOR INJECTION'}`);
});
