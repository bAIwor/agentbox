const messagesList = document.getElementById('messagesList');
const chatForm = document.getElementById('chatForm');
const userInput = document.getElementById('userInput');
const sendBtn = document.getElementById('sendBtn');
const modelSelect = document.getElementById('modelSelect');
const modelSourceNote = document.getElementById('modelSourceNote');
const clearChatBtn = document.getElementById('clearChatBtn');
const tokenInput = document.getElementById('tokenInput');
const tokenToggle = document.getElementById('tokenToggle');
const tokenWrap = document.getElementById('tokenWrap');

const TOKEN_STORAGE_KEY = 'baiwor.agent.token';

let chatHistory = [];

/* ------------------------------------------------------------------ *
 * Token akses (opsional)
 * Hanya dibutuhkan kalau server dijalankan dengan AGENT_ACCESS_TOKEN.
 * Disimpan di sessionStorage -> hilang saat tab ditutup, tidak pernah
 * ditulis ke disk atau dikirim ke server selain sebagai header.
 * ------------------------------------------------------------------ */
function getToken() {
  try {
    return sessionStorage.getItem(TOKEN_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

function setToken(value) {
  try {
    if (value) sessionStorage.setItem(TOKEN_STORAGE_KEY, value);
    else sessionStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // sessionStorage tidak tersedia (mis. mode privat) - token tetap jalan di memory
  }
}

function authHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers['X-Agent-Token'] = token;
  return headers;
}

if (tokenInput) {
  tokenInput.value = getToken();
  tokenInput.addEventListener('input', () => setToken(tokenInput.value.trim()));
}

if (tokenToggle && tokenWrap) {
  tokenToggle.addEventListener('click', () => {
    tokenWrap.classList.toggle('open');
  });
}

/* ------------------------------------------------------------------ *
 * Model live dari GMI Cloud
 * ------------------------------------------------------------------ */
async function loadModels() {
  try {
    const res = await fetch('/api/models', { headers: authHeaders() });
    const data = await res.json();
    if (data.models && data.models.length > 0) {
      modelSelect.innerHTML = '';
      data.models.forEach((m) => {
        const opt = document.createElement('option');
        opt.value = m;
        opt.textContent = m;
        modelSelect.appendChild(opt);
      });

      // Pilih model default server (DEFAULT_MODEL). Pakai .value - lebih
      // andal daripada option.selected, dan fallback ke index 0 kalau
      // model default tidak ada di daftar.
      if (data.default && data.models.includes(data.default)) {
        modelSelect.value = data.default;
      } else {
        modelSelect.selectedIndex = 0;
      }

      modelSourceNote.textContent = data.live ? '● Model live dari GMI Cloud' : 'Fallback model aktif';
      modelSourceNote.style.color = data.live ? '#10b981' : '#9ca3af';
    }
  } catch (err) {
    modelSourceNote.textContent = 'Gagal memuat model live';
  }
}

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
  let escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  escaped = escaped.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  escaped = escaped.replace(/`([^`]+)`/g, '<code>$1</code>');
  escaped = escaped.replace(/\n/g, '<br>');

  return escaped;
}

chatForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const prompt = userInput.value.trim();
  if (!prompt) return;

  userInput.value = '';
  userInput.style.height = 'auto';

  appendMessage('user', prompt);
  chatHistory.push({ role: 'user', content: prompt });

  const assistantBody = appendMessage('assistant', '...');
  sendBtn.disabled = true;

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        messages: chatHistory,
        model: modelSelect.value,
        stream: true
      })
    });

    if (!response.ok) {
      const errJson = await response.json().catch(() => ({}));
      const hint = response.status === 401
        ? ' - buka panel "Token Akses" di sidebar lalu isi AGENT_ACCESS_TOKEN.'
        : '';
      throw new Error((errJson.error || `HTTP ${response.status}`) + hint);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    // PENTING: penanda teks antar-chunk. Tanpa buffer ini, satu baris
    // "data: {...}" yang kepotong di tengah chunk akan gagal di-JSON.parse
    // dan isinya dibuang diam-diam.
    let buffer = '';
    let assistantText = '';
    let reasoningText = '';
    let streamDone = false;

    const render = () => {
      if (assistantText) {
        assistantBody.innerHTML = formatText(assistantText);
      } else {
        assistantBody.innerHTML = '<span class="thinking">🤔 Sedang berpikir…</span>';
      }
      messagesList.scrollTop = messagesList.scrollHeight;
    };

    const handleLine = (line) => {
      if (!line.startsWith('data: ')) return;
      const raw = line.slice(6).trim();
      if (raw === '[DONE]') {
        streamDone = true;
        return;
      }
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw);
        if (parsed.error) {
          assistantText += `\n*[Error: ${parsed.error}]*`;
          return;
        }
        const delta = parsed.choices && parsed.choices[0] && parsed.choices[0].delta;
        if (delta) {
          if (delta.reasoning_content) reasoningText += delta.reasoning_content;
          if (delta.content) assistantText += delta.content;
        }
      } catch {
        // bukan JSON (heartbeat / baris kumang) - abaikan
      }
    };

    render();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      // { stream: true } wajib: karakter multi-byte (—, ü, emoji) bisa
      // terpotong di batas chunk dan harus disambung, bukan di-decode ulang.
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';   // simpan baris terakhir yg belum lengkap

      for (const line of lines) {
        handleLine(line);
        if (streamDone) break;
      }

      render();
      if (streamDone) break;
    }

    // Sisa buffer kalau stream ditutup tanpa [DONE].
    if (!streamDone) {
      buffer += decoder.decode();
      if (buffer.trim()) handleLine(buffer);
    }
    render();

    await reader.cancel().catch(() => {});

    chatHistory.push({ role: 'assistant', content: assistantText });
  } catch (err) {
    assistantBody.innerHTML = `<span style="color:#ef4444;">Pesan gagal diproses: ${err.message}</span>`;
  } finally {
    sendBtn.disabled = false;
  }
});
