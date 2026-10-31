const messagesList = document.getElementById('messagesList');
const chatForm = document.getElementById('chatForm');
const userInput = document.getElementById('userInput');
const sendBtn = document.getElementById('sendBtn');
const modelSelect = document.getElementById('modelSelect');
const clearChatBtn = document.getElementById('clearChatBtn');
const refreshWalletBtn = document.getElementById('refreshWalletBtn');

const bnbBal = document.getElementById('bnbBal');
const iaoBal = document.getElementById('iaoBal');
const iaoSym = document.getElementById('iaoSym');
const agentIdVal = document.getElementById('agentIdVal');
const modelHint = document.getElementById('modelHint');
const walletStatus = document.getElementById('walletStatus');

const IAO_CONTRACT = '0x0810c5eb5d86d1b8d408f75bd1f5abefb6d79999';

let chatHistory = [];

// Access token opsional (hanya relevan kalau server dikunci AGENT_ACCESS_TOKEN).
// Sumber: parameter ?token=... di URL, atau localStorage.
const urlToken = new URLSearchParams(window.location.search).get('token');
if (urlToken) {
  try { localStorage.setItem('baiwor_access_token', urlToken); } catch { /* storage diblokir */ }
}
function getAccessToken() {
  try { return localStorage.getItem('baiwor_access_token') || ''; } catch { return ''; }
}

const fmtAmount = (value, maxFrac = 6) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('en-US', { maximumFractionDigits: maxFrac });
};

// Muat daftar model live dari GMI MaaS. Server yang memanggil API-nya,
// jadi model yang tampil selalu model yang benar-benar tersedia.
async function loadModels() {
  try {
    const res = await fetch('/api/models');
    const data = await res.json();
    const models = Array.isArray(data.models) ? data.models : [];
    if (!models.length) {
      modelHint.textContent = 'Daftar model tidak tersedia.';
      return;
    }
    const current = modelSelect.value;
    modelSelect.innerHTML = '';
    for (const id of models) {
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = id;
      modelSelect.appendChild(opt);
    }
    if (models.includes(current)) modelSelect.value = current;
    modelHint.textContent = data.degraded
      ? `${models.length} model (mode fallback: ${data.reason || 'tidak diketahui'})`
      : `${models.length} model live dari GMI MaaS`;
  } catch (err) {
    console.error('Model list failed:', err);
    modelHint.textContent = 'Gagal memuat daftar model.';
  }
}

// Fetch live Web3 wallet info (read-only on-chain, tanpa private key).
async function loadWalletInfo() {
  bnbBal.textContent = '...';
  iaoBal.textContent = '...';
  walletStatus.textContent = 'Mengambil data on-chain...';
  try {
    const res = await fetch('/api/wallet');
    const data = await res.json();
    if (data.agentId) agentIdVal.textContent = data.agentId;

    if (data.available === false) {
      bnbBal.textContent = '—';
      iaoBal.textContent = '—';
      walletStatus.textContent = '⚠️ RPC tidak tersedia';
      console.warn('Wallet data unavailable:', data.reason);
      return;
    }

    if (Array.isArray(data.balances)) {
      const bnb = data.balances.find(b => b.symbol === 'BNB');
      const iao = data.balances.find(b => (b.contract || '').toLowerCase() === IAO_CONTRACT);
      if (bnb) bnbBal.textContent = fmtAmount(bnb.balance, 6);
      if (iao) {
        iaoBal.textContent = fmtAmount(iao.balance, 2);
        if (iao.symbol && iao.symbol !== 'UNKNOWN') iaoSym.textContent = iao.symbol;
      }
    }
    walletStatus.textContent = 'Ptah Trade IAO Verified';
  } catch (err) {
    console.error('Wallet fetch failed:', err);
    bnbBal.textContent = '—';
    iaoBal.textContent = '—';
    walletStatus.textContent = '⚠️ Gagal menghubungi server';
  }
}

refreshWalletBtn.addEventListener('click', loadWalletInfo);
loadWalletInfo();
loadModels();

// Textarea auto-resize
userInput.addEventListener('input', () => {
  userInput.style.height = 'auto';
  userInput.style.height = `${Math.min(userInput.scrollHeight, 120)}px`;
});

// Submit on Enter (without Shift)
userInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    chatForm.dispatchEvent(new Event('submit'));
  }
});

// Quick prompts
document.querySelectorAll('.quick-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    userInput.value = btn.dataset.prompt;
    chatForm.dispatchEvent(new Event('submit'));
  });
});

clearChatBtn.addEventListener('click', () => {
  chatHistory = [];
  const intro = document.querySelector('.message.intro');
  messagesList.innerHTML = '';
  if (intro) messagesList.appendChild(intro);
});

function appendMessage(role, text) {
  const msgEl = document.createElement('div');
  msgEl.className = `message ${role}`;

  const avatar = document.createElement('div');
  avatar.className = 'msg-avatar';
  avatar.textContent = role === 'user' ? 'W' : '🎭';

  const body = document.createElement('div');
  body.className = 'msg-body';
  body.innerHTML = formatText(text);

  msgEl.appendChild(avatar);
  msgEl.appendChild(body);
  messagesList.appendChild(msgEl);
  messagesList.scrollTop = messagesList.scrollHeight;

  return body;
}

function formatText(text) {
  // Simple markdown formatting
  let escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Bold
  escaped = escaped.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  // Inline code
  escaped = escaped.replace(/`([^`]+)`/g, '<code>$1</code>');
  // Line breaks
  escaped = escaped.replace(/\n/g, '<br>');

  return escaped;
}

chatForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const prompt = userInput.value.trim();
  if (!prompt) return;

  userInput.value = '';
  userInput.style.height = 'auto';

  // Append user message
  appendMessage('user', prompt);
  chatHistory.push({ role: 'user', content: prompt });

  // Assistant placeholder
  const assistantBody = appendMessage('assistant', '...');
  sendBtn.disabled = true;

  try {
    const headers = { 'Content-Type': 'application/json' };
    const token = getAccessToken();
    if (token) headers['X-Agent-Token'] = token;

    const response = await fetch('/api/chat', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        messages: chatHistory,
        model: modelSelect.value,
        stream: true
      })
    });

    if (!response.ok) {
      let detail = `HTTP Error: ${response.status}`;
      try {
        const errBody = await response.json();
        if (errBody && errBody.error) detail = errBody.error;
      } catch { /* body bukan JSON */ }
      throw new Error(detail);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let assistantText = '';
    let buffer = '';
    assistantBody.innerHTML = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      // stream: true supaya karakter multi-byte tidak terpotong di tengah chunk
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      // Sisa baris terakhir belum lengkap - tahan dulu sampai chunk berikutnya.
      buffer = lines.pop();

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const raw = line.slice(6).trim();
          if (raw === '[DONE]') continue;
          try {
            const parsed = JSON.parse(raw);
            if (parsed.error) {
              assistantText += `\n*[Error: ${parsed.error}]*`;
            } else if (parsed.choices && parsed.choices[0]?.delta?.content) {
              assistantText += parsed.choices[0].delta.content;
            }
          } catch {
            // baris non-json, abaikan
          }
        }
      }
      assistantBody.innerHTML = formatText(assistantText || '...');
      messagesList.scrollTop = messagesList.scrollHeight;
    }

    chatHistory.push({ role: 'assistant', content: assistantText });
  } catch (err) {
    assistantBody.innerHTML = `<span style="color:#ef4444;">Error: ${err.message}</span>`;
  } finally {
    sendBtn.disabled = false;
  }
});
