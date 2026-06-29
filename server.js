require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const mysql = require('mysql2/promise');

const app = express();
app.use(cors());
app.use(express.json({ limit: '20mb' }));

const PORT = process.env.PORT || 3000;

const dbPool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || undefined,
  waitForConnections: true,
  connectionLimit: 10
});

app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'Entregas API' });
});

app.get('/api/db-test', async (req, res) => {
  try {
    const [rows] = await dbPool.query('SELECT 1 AS ok');
    res.json({ connected: true, result: rows });
  } catch (err) {
    res.status(500).json({ connected: false, error: err.message });
  }
});
 
// Telegram notification endpoint
app.post('/api/telegram', async (req, res) => {
  try {
    const { mensaje, chatId, token } = req.body;
    const tToken = token || process.env.TELEGRAM_TOKEN;
    const tChat = chatId || process.env.TELEGRAM_CHAT_ID;
    if (!tToken || !tChat) return res.status(400).json({ error: 'Token o chatId no configurado' });
    const response = await fetch(`https://api.telegram.org/bot${tToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: tChat,
        text: mensaje,
        parse_mode: 'HTML'
      })
    });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
 
app.post('/api/claude', async (req, res) => {
  try {
    const { system, user, mcp, image } = req.body;
    const apiKey = req.headers['x-api-key'];
    if (!apiKey) return res.status(401).json({ error: 'API key required' });
 
    let userContent;
    if (image) {
      userContent = [
        { type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.base64 } },
        { type: 'text', text: user }
      ];
    } else {
      userContent = user;
    }
 
    const body = {
      model: 'claude-sonnet-4-5',
      max_tokens: 2000,
      system,
      messages: [{ role: 'user', content: userContent }]
    };
    if (mcp) body.mcp_servers = mcp;
 
    const headers = {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    };
    if (mcp) headers['anthropic-beta'] = 'mcp-client-2025-04-04';
 
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });
 
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
 
app.listen(PORT, () => {
  console.log('Servidor Entregas corriendo en puerto ' + PORT);
});
