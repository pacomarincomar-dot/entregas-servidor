const express = require(‘express’);
const cors = require(‘cors’);
const fetch = require(‘node-fetch’);

const app = express();
app.use(cors());
app.use(express.json({ limit: ‘20mb’ }));

const PORT = process.env.PORT || 3000;

app.get(’/’, (req, res) => {
res.json({ status: ‘ok’, service: ‘Entregas API’ });
});

app.post(’/api/claude’, async (req, res) => {
try {
const { system, user, mcp, image } = req.body;
const apiKey = req.headers[‘x-api-key’];
if (!apiKey) return res.status(401).json({ error: ‘API key required’ });

```
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
```

} catch (err) {
res.status(500).json({ error: err.message });
}
});

app.listen(PORT, () => {
console.log(’Servidor Entregas corriendo en puerto ’ + PORT);
});
