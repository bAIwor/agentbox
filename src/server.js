import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { chatCompletion, getApiKey } from './gmi.js';
import { getWalletInfo } from './web3.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;

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

// Healthcheck for GMI Agentbox
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    agent: 'bAIwor Agentbox',
    version: '1.0.0',
    platform: 'GMI Cloud Agentbox',
    hasGmiKey: Boolean(getApiKey()),
    defaultPort: PORT,
    timestamp: new Date().toISOString()
  });
});

// Wallet Info endpoint
app.get('/api/wallet', async (req, res) => {
  const address = req.query.address || '0x176524995515Cc187950CfFDad0Ee2F869872e02';
  const info = await getWalletInfo(address);
  res.json(info);
});

// Chat endpoint (supports streaming SSE)
app.post('/api/chat', async (req, res) => {
  try {
    const { messages = [], model, stream = true, apiKey } = req.body;

    const fullMessages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...messages
    ];

    if (!stream) {
      const response = await chatCompletion({ messages: fullMessages, model, stream: false, apiKey });
      const data = await response.json();
      return res.json(data);
    }

    // Streaming response (SSE)
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const gmiResponse = await chatCompletion({ messages: fullMessages, model, stream: true, apiKey });

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
});
