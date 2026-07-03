FROM node:18-alpine
WORKDIR /app
COPY app.js index.html styles.css supabase.js dev-server.js ./
CMD ["node", "dev-server.js"]
