const {
  makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
  makeInMemoryStore,
} = require('@whiskeysockets/baileys');
const QRCode = require('qrcode');
const pino = require('pino');
const path = require('path');
const fs = require('fs');

const AUTH_DIR = path.join(__dirname, '.wa-auth');
const STORE_FILE = path.join(__dirname, '.wa-store.json');
const TARGET_LABELS = (process.env.WA_LABELS || 'llevar,enviar')
  .toLowerCase().split(',').map(s => s.trim());

if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });

const logger = pino({ level: 'silent' });
const store = makeInMemoryStore({ logger });

try { store.readFromFile(STORE_FILE); } catch (e) {}
setInterval(() => { try { store.writeToFile(STORE_FILE); } catch (e) {} }, 30000);

// label id -> label name, chat jid -> [labelId]
const labelsMap = {};
const chatLabels = {};

const waState = { connected: false, qrBase64: null, sock: null, error: null };

async function startWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger,
    printQRInTerminal: true,
    browser: ['COMAR Entregas', 'Chrome', '1.0'],
    syncFullHistory: false,
  });

  store.bind(sock.ev);
  waState.sock = sock;
  waState.error = null;

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      waState.qrBase64 = await QRCode.toDataURL(qr);
      waState.connected = false;
    }
    if (connection === 'open') {
      waState.connected = true;
      waState.qrBase64 = null;
      console.log('[WhatsApp] Conectado');
    }
    if (connection === 'close') {
      waState.connected = false;
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code === DisconnectReason.loggedOut) {
        console.log('[WhatsApp] Sesion cerrada. Elimina .wa-auth y reinicia para escanear QR.');
        waState.error = 'loggedOut';
      } else {
        console.log('[WhatsApp] Desconectado, reconectando en 5s...');
        setTimeout(startWhatsApp, 5000);
      }
    }
  });

  // Registrar etiquetas
  sock.ev.on('labels.edit', label => {
    labelsMap[label.id] = label.name;
  });

  // Registrar asociaciones chat <-> etiqueta
  sock.ev.on('labels.association', ({ association, type }) => {
    const { chatId, labelId } = association;
    if (!chatLabels[chatId]) chatLabels[chatId] = [];
    if (type === 'add' && !chatLabels[chatId].includes(labelId)) {
      chatLabels[chatId].push(labelId);
    } else if (type === 'remove') {
      chatLabels[chatId] = chatLabels[chatId].filter(id => id !== labelId);
    }
  });

  return sock;
}

function getTargetLabelIds() {
  return Object.entries(labelsMap)
    .filter(([, name]) => TARGET_LABELS.includes((name || '').toLowerCase()))
    .map(([id]) => id);
}

function extractText(msg) {
  if (!msg || !msg.message) return '';
  return msg.message.conversation
    || msg.message.extendedTextMessage?.text
    || msg.message.imageMessage?.caption
    || msg.message.videoMessage?.caption
    || '';
}

function phoneFromJid(jid) {
  const raw = jid.replace('@s.whatsapp.net', '').replace('@g.us', '');
  // Quitar prefijo de pais 34 (España)
  return raw.startsWith('34') && raw.length === 11 ? raw.slice(2) : raw;
}

function parseLineasPedido(texto) {
  return texto
    .split('\n')
    .map(l => l.trim().replace(/^[-*•]\s*/, ''))
    .filter(l => l.length > 0)
    .map(linea => {
      // "pan de molde x2" o "2x leche entera"
      const mFin = linea.match(/^(.+?)\s*[xX]\s*(\d+)\s*$/);
      const mIni = linea.match(/^(\d+)\s*[xX]\s+(.+)$/);
      if (mFin) return { descripcion: mFin[1].trim(), cantidad: parseInt(mFin[2]) };
      if (mIni) return { descripcion: mIni[2].trim(), cantidad: parseInt(mIni[1]) };
      return { descripcion: linea, cantidad: 1 };
    });
}

function getLabeledChats() {
  if (!waState.connected) return null;

  const targetIds = getTargetLabelIds();
  if (!targetIds.length) return [];

  const result = [];

  // Usar el store + chatLabels acumulado de eventos
  const allChats = store.chats?.all ? store.chats.all() : Object.values(store.chats || {});

  allChats.forEach(chat => {
    // Etiquetas del store o de los eventos recibidos
    const storeLabelIds = chat.labels || [];
    const eventLabelIds = chatLabels[chat.id] || [];
    const allLabelIds = [...new Set([...storeLabelIds, ...eventLabelIds])];

    const matched = allLabelIds.filter(id => targetIds.includes(id));
    if (!matched.length) return;

    // Ultimo mensaje del chat
    const msgs = store.messages[chat.id];
    let ultimoTexto = '';
    let ts = 0;
    if (msgs) {
      const arr = msgs.array || [];
      for (let i = arr.length - 1; i >= 0; i--) {
        const txt = extractText(arr[i]);
        if (txt.trim()) { ultimoTexto = txt; ts = arr[i].messageTimestamp || 0; break; }
      }
    }

    result.push({
      jid: chat.id,
      phone: phoneFromJid(chat.id),
      nombre: chat.name || chat.pushName || phoneFromJid(chat.id),
      etiquetas: matched.map(id => labelsMap[id] || id),
      mensaje: ultimoTexto,
      lineas: ultimoTexto ? parseLineasPedido(ultimoTexto) : [],
      timestamp: ts,
    });
  });

  return result.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
}

function getStatus() {
  return {
    connected: waState.connected,
    qrBase64: waState.qrBase64,
    error: waState.error,
    labels: labelsMap,
    chatLabelsCount: Object.keys(chatLabels).length,
  };
}

module.exports = { startWhatsApp, getStatus, getLabeledChats };
