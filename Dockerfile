# Multi-stage lightweight Node.js 22 runtime for GMI Agentbox
FROM node:22-alpine

WORKDIR /app

# Install app dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy application code
COPY . .

# GMI Cloud Agentbox uses port 8080 by default
EXPOSE 8080

# Environment defaults
ENV PORT=8080
ENV NODE_ENV=production

# Start bAIwor Agentbox
CMD ["node", "src/server.js"]
