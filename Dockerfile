# bAIwor Agentbox - runtime image untuk GMI Cloud Agentbox
#
# PENTING: pakai basis Debian (bookworm-slim), BUKAN alpine.
# Docs GMI (agentbox-sdk/agents.md): "The image needs `bash` if you use the shell."
# Perintah sandbox dieksekusi lewat bash, sedangkan alpine hanya punya busybox `ash`.
FROM node:22-bookworm-slim

WORKDIR /app

# Install app dependencies (layer cache)
COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force

# Copy application code (.dockerignore meniadakan .git, node_modules, dan .env)
COPY . .

# GMI Cloud Agentbox memetakan trafik eksternal ke Internal Port ini (default 8080)
EXPOSE 8080

# Environment defaults
ENV PORT=8080
ENV NODE_ENV=production

# Start bAIwor Agentbox
CMD ["node", "src/server.js"]
