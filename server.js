require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const mysql = require('mysql2/promise');
const wa = require('./whatsapp');

const app = express();
app.use(cors());
app.use(express.json({ limit: '20mb' }));

const PORT = process.env.PORT || 3000;

const dbPool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'nura_comar',
  waitForConnections: true,
  connectionLimit: 10
});

// BD Ionos (entregas_data)
const ionosPool = mysql.createPool({
  host: process.env.IONOS_DB_HOST || 'db5020454613.hosting-data.io',
  port: process.env.IONOS_DB_PORT || 3306,
  user: process.env.IONOS_DB_USER || 'dbu120493',
  password: process.env.IONOS_DB_PASS,
  database: process.env.IONOS_DB_NAME || 'dbs15673372',
  waitForConnections: true,
  connectionLimit: 5,
  connectTimeout: 10000,
});

// Cache del JSON principal (TTL 60s)
let entregasCache = null;
let entregasCacheTs = 0;

async function getEntregasData(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && entregasCache && (now - entregasCacheTs) < 60000) {
    return entregasCache;
  }
  const [[row]] = await ionosPool.query(
    "SELECT data_value FROM entregas_data WHERE data_key = 'main' LIMIT 1"
  );
  entregasCache = JSON.parse(row.data_value);
  entregasCacheTs = now;
  return entregasCache;
}

function round4(n) { return Math.round(n * 10000) / 10000; }
function round2(n) { return Math.round(n * 100) / 100; }

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

app.get('/api/db-explore/grants', async (req, res) => {
  try {
    const [grants] = await dbPool.query('SHOW GRANTS FOR CURRENT_USER()');
    const [user] = await dbPool.query('SELECT CURRENT_USER() AS u');
    res.json({ user: user[0].u, grants: grants.map(r => Object.values(r)[0]) });
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

// POST /api/facturas-simplificadas
// Body: { fecha, cliente: {codigo, nombre, nif}, lineas: [{codigo, descripcion, cantidad, precio, piva, descuento}], cobro: {idfpa, importe} }
app.post('/api/facturas-simplificadas', async (req, res) => {
  const { fecha, cliente, lineas, cobro } = req.body;
  if (!lineas || !lineas.length) return res.status(400).json({ error: 'Se requieren lineas' });

  const conn = await dbPool.getConnection();
  try {
    await conn.beginTransaction();

    // Calcular totales por línea
    const lines = lineas.map((l, i) => {
      const precio  = parseFloat(l.precio)    || 0;
      const piva    = parseFloat(l.piva)      || 0;
      const cant    = parseFloat(l.cantidad)  || 1;
      const dto     = parseFloat(l.descuento) || 0;
      const precioIva   = round4(precio * (1 + piva / 100));
      const ivaUnit     = round4(precio * piva / 100);
      return {
        orden: i + 1,
        codigo:      l.codigo      || 'ENTREGA',
        descripcion: l.descripcion || '',
        cant, precio, piva, dto,
        precioIva,
        ivaUnit,
        totalSinIva: round4(precio * cant),
        totalConIva: round4(precioIva * cant),
        totalIva:    round4(ivaUnit * cant),
      };
    });

    // Agrupar bases por % IVA (máx 3 tramos)
    const ivaMap = {};
    lines.forEach(l => {
      if (!ivaMap[l.piva]) ivaMap[l.piva] = { base: 0, cuota: 0, pct: l.piva };
      ivaMap[l.piva].base  = round4(ivaMap[l.piva].base  + l.totalSinIva);
      ivaMap[l.piva].cuota = round4(ivaMap[l.piva].cuota + l.totalIva);
    });
    const slots    = Object.values(ivaMap).slice(0, 3);
    const totalFac = round2(lines.reduce((s, l) => s + l.totalConIva, 0));
    const sumaBases = round4(lines.reduce((s, l) => s + l.totalSinIva, 0));

    // Siguiente INUMFAC para canal TK
    const [lastRow] = await conn.query(
      "SELECT MAX(CAST(INUMFAC AS UNSIGNED)) AS u FROM FACCLISIM WHERE VCODCAN = 'TK'"
    );
    const inumfac  = String((lastRow[0].u || 0) + 1).padStart(9, '0');
    const fechaDoc = fecha || new Date().toISOString().slice(0, 10);
    const entrega  = cobro?.importe ? round2(parseFloat(cobro.importe)) : totalFac;
    const cambio   = round2(Math.max(0, entrega - totalFac));

    // Insertar cabecera FACCLISIM
    const [ins] = await conn.query(
      `INSERT INTO FACCLISIM
         (ID_EMP, ID_EJE, VIMPRESO, VESTADOCAN, VESTADO, INUMFAC, VCODCAN, FFDOCFAC,
          VCODCLI, VNCOMCLI, VNFISCLI,
          DSUMA_IMPONIBLES, DTOTALFAC, DSUBTOTAL,
          DIMP1FAC, DPIVA1FAC, DIIVA1FAC, DPRE1FAC,
          DIMP2FAC, DPIVA2FAC, DIIVA2FAC, DPRE2FAC,
          DIMP3FAC, DPIVA3FAC, DIIVA3FAC, DPRE3FAC,
          DSUMA_LINB1, DSUMA_LINB2, DSUMA_LINB3,
          DSUMA_ARTI_B1, DSUMA_ARTI_B2, DSUMA_ARTI_B3,
          IDALM, ENTREGA, CAMBIO,
          DDTOFAC, DIDTOFAC, DDPPFAC, DIPPFAC, DSUMDTOFAC,
          DTPORTES_COSTE, DTPORTES_VENTA, DBASE_DGEN, DBASE_DPP,
          DSUMA_PORTES_B1, DSUMA_PORTES_B2, DSUMA_PORTES_B3,
          DPIRPF, DIIRPF, DBASE_IRPF)
       VALUES
         (1, NULL, 'N', 'A', 'A', ?, 'TK', ?,
          ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?, 0,
          ?, ?, ?, 0,
          ?, ?, ?, 0,
          ?, ?, ?,
          ?, ?, ?,
          13, ?, ?,
          0, 0, 0, 0, 0,
          0, 0, 0, 0,
          0, 0, 0,
          0, 0, 0)`,
      [
        inumfac, fechaDoc,
        cliente?.codigo || null, cliente?.nombre || null, cliente?.nif || null,
        sumaBases, totalFac, totalFac,
        slots[0]?.base || 0, slots[0]?.pct || 0, slots[0]?.cuota || 0,
        slots[1]?.base || 0, slots[1]?.pct || 0, slots[1]?.cuota || 0,
        slots[2]?.base || 0, slots[2]?.pct || 0, slots[2]?.cuota || 0,
        slots[0]?.base || 0, slots[1]?.base || 0, slots[2]?.base || 0,
        slots[0]?.base || 0, slots[1]?.base || 0, slots[2]?.base || 0,
        entrega, cambio
      ]
    );
    const idfac = ins.insertId;

    // Insertar líneas FACCLISIM_LIN
    for (const l of lines) {
      await conn.query(
        `INSERT INTO FACCLISIM_LIN
           (IDFAC, IORDFACD, VESTADOCAN, VCODARTI, VDESARTI,
            DCANTIDAD, DPREFACD, DPIVAFACD, DPRUFACD, DPDTOFACD, DTOTFACD,
            DPRUFACD_NETO, DTOTFACD_NETO, DPRUFACD_IVA, DTOTFACD_IVA,
            IORDEN, IDALM, VTIPOLINEA,
            DPRUFACD_LIQUIDO, DTOTFACD_LIQUIDO, DPDTO2FACD,
            DPRUFACD_NETO_LINEA, DPCOSTE, DTCOSTE, DMARGEN, DMARGEN_GM,
            DCOSTE_AGENTE, DTCOSTE_AGENTE, DCANTIDAD_CAN)
         VALUES (?, ?, 'A', ?, ?,
                 ?, ?, ?, ?, ?, ?,
                 ?, ?, ?, ?,
                 ?, 13, 'A',
                 ?, ?, 0,
                 ?, 0, 0, 0, 0,
                 0, 0, ?)`,
        [
          idfac, l.orden, l.codigo, l.descripcion,
          l.cant, l.precio, l.piva, l.precioIva, l.dto, l.totalConIva,
          l.precio, l.totalSinIva, l.ivaUnit, l.totalIva,
          l.orden,
          l.precioIva, l.totalConIva,
          l.precio,
          l.cant
        ]
      );
    }

    // Insertar cobro FACCLISIM_COB
    if (cobro) {
      await conn.query(
        'INSERT INTO FACCLISIM_COB (IDFPA, IMPORTE, FECHA_COBRO, IDFAC) VALUES (?, ?, NOW(), ?)',
        [cobro.idfpa || 149, entrega, idfac]
      );
    }

    await conn.commit();
    res.json({ ok: true, idfac, inumfac, total: totalFac });

  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
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
 
// ===== WHATSAPP =====

app.get('/api/whatsapp/status', (req, res) => {
  res.json(wa.getStatus());
});

app.get('/api/whatsapp/chats', (req, res) => {
  const chats = wa.getLabeledChats();
  if (chats === null) return res.status(503).json({ error: 'WhatsApp no conectado' });
  res.json(chats);
});

app.delete('/api/whatsapp/sesion', (req, res) => {
  const fs = require('fs');
  const path = require('path');
  const authDir = path.join(__dirname, '.wa-auth');
  try {
    fs.rmSync(authDir, { recursive: true, force: true });
    res.json({ ok: true, msg: 'Sesion eliminada. Reinicia el servidor para escanear QR.' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===== CLIENTES (BD Ionos - entregas_data) =====
app.get('/api/clientes/buscar', async (req, res) => {
  const { telefono, q } = req.query;
  try {
    const data = await getEntregasData();
    const clientes = data.clientes || [];

    let resultado;
    if (telefono) {
      const ultNueve = telefono.replace(/\s/g, '').slice(-9);
      resultado = clientes.filter(c => {
        const tel = (c.telefono || '').replace(/\s/g, '');
        return tel.slice(-9) === ultNueve;
      });
    } else if (q) {
      const term = q.toLowerCase();
      resultado = clientes.filter(c =>
        (c.nombre || '').toLowerCase().includes(term)
      ).slice(0, 10);
    } else {
      return res.status(400).json({ error: 'Falta telefono o q' });
    }
    res.json(resultado);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== PRODUCTOS (BD Ionos - entregas_data) =====
app.get('/api/articulos/buscar', async (req, res) => {
  const { q } = req.query;
  if (!q || q.length < 2) return res.status(400).json({ error: 'Parametro q requerido (min 2 chars)' });
  try {
    const data = await getEntregasData();
    const productos = data.productos || [];
    const terminos = q.trim().toLowerCase().split(/\s+/).filter(t => t.length >= 2);
    const resultado = productos.filter(p => {
      const nombre = (p.nombre || '').toLowerCase();
      return terminos.every(t => nombre.includes(t));
    }).slice(0, 8);
    res.json(resultado);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== ENTREGAS (Ionos - crea pedido desde WhatsApp) =====
app.post('/api/entregas', async (req, res) => {
  try {
    const data = await getEntregasData();
    if (!data.entregas) data.entregas = [];
    const id = Date.now();
    const entrega = { id, fecha: new Date().toISOString(), ...req.body };
    data.entregas.unshift(entrega);
    await ionosPool.query(
      "UPDATE entregas_data SET data_value = ? WHERE data_key = 'main'",
      [JSON.stringify(data)]
    );
    entregasCache = data;
    entregasCacheTs = Date.now();
    res.json({ ok: true, id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Servir WhatsApp UI
app.get('/whatsapp', (req, res) => {
  const path = require('path');
  res.sendFile(path.join(__dirname, 'WhatsApp.html'));
});

// ===== INICIO =====
app.listen(PORT, () => {
  console.log('Servidor Entregas corriendo en puerto ' + PORT);
  wa.startWhatsApp().catch(err => console.error('[WhatsApp] Error al iniciar:', err.message));
});
