const messagesList = document.getElementById('messagesList');
const chatForm = document.getElementById('chatForm');
const userInput = document.getElementById('userInput');
const sendBtn = document.getElementById('sendBtn');
const modelSelect = document.getElementById('modelSelect');
const modelSourceNote = document.getElementById('modelSourceNote');
const clearChatBtn = document.getElementById('clearChatBtn');

let chatHistory = [];

// Fetch live models from GMI Cloud
async function loadModels() {
  try {
    const res = await fetch('/api/models');
    const data = await res.json();
    if (data.models && data.models.length > 0) {
      modelSelect.innerHTML = '';
      data.models.forEach((m, idx) => {
        const opt = document.createElement('option');
        opt.value = m;
        opt.textContent = m;
        if (idx === 0) opt.selected = true;
        modelSelect.appendChild(opt);
      });
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: chatHistory,
        model: modelSelect.value,
        stream: true
      })
    });

    if (!response.ok) {
      const errJson = await response.json().catch(() => ({}));
      throw new Error(errJson.error || `HTTP ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let assistantText = '';
    assistantBody.innerHTML = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const raw = line.slice(6).trim();
          if (raw === '[DONE]') break;
          try {
            const parsed = JSON.parse(raw);
            if (parsed.error) {
              assistantText += `\n*[Error: ${parsed.error}]*`;
            } else if (parsed.choices && parsed.choices[0]?.delta?.content) {
              assistantText += parsed.choices[0].delta.content;
            }
          } catch {
            // ignore non-json
          }
        }
      }
      assistantBody.innerHTML = formatText(assistantText || '...');
      messagesList.scrollTop = messagesList.scrollHeight;
    }

    chatHistory.push({ role: 'assistant', content: assistantText });
  } catch (err) {
    assistantBody.innerHTML = `<span style="color:#ef4444;">Pesan gagal diproses: ${err.message}</span>`;
  } finally {
    sendBtn.disabled = false;
  }
});
