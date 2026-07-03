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

// --- Endpoints de exploración (usar solo en local, quitar en producción) ---

app.get('/api/db-explore/databases', async (req, res) => {
  try {
    const [rows] = await dbPool.query('SHOW DATABASES');
    res.json(rows.map(r => Object.values(r)[0]));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/db-explore/all-tables', async (req, res) => {
  try {
    const [rows] = await dbPool.query(
      'SELECT TABLE_SCHEMA, TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA NOT IN (\'information_schema\',\'mysql\',\'performance_schema\',\'sys\') ORDER BY TABLE_SCHEMA, TABLE_NAME'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/db-explore/tables/:db', async (req, res) => {
  try {
    const db = req.params.db.replace(/[^a-zA-Z0-9_]/g, '');
    const [rows] = await dbPool.query(`SHOW TABLES FROM \`${db}\``);
    res.json(rows.map(r => Object.values(r)[0]));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/db-explore/columns/:db/:table', async (req, res) => {
  try {
    const db = req.params.db.replace(/[^a-zA-Z0-9_]/g, '');
    const table = req.params.table.replace(/[^a-zA-Z0-9_]/g, '');
    const [rows] = await dbPool.query(
      'SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT, COLUMN_KEY, EXTRA ' +
      'FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION',
      [db, table]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Fin endpoints exploración ---
 
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
