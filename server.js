/**
 * Live Signature Wall Pro
 * Sign-only terminal + visual studio + strict non-overlapping LED wall.
 */

'use strict';

const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const QRCode = require('qrcode');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 12 * 1024 * 1024,
  transports: ['polling', 'websocket']
});

const PORT = Number(process.env.PORT || 3000);
const MAX_SIGNATURES = Math.max(20, Number(process.env.MAX_SIGNATURES || 1000));
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const UPLOAD_DIR = path.join(ROOT, 'uploads');
const SIGNATURE_DIR = path.join(UPLOAD_DIR, 'signatures');
const BACKGROUND_DIR = path.join(UPLOAD_DIR, 'backgrounds');
const DATA_FILE = path.join(DATA_DIR, 'entries.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

for (const dir of [PUBLIC_DIR, DATA_DIR, SIGNATURE_DIR, BACKGROUND_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

const DEFAULT_SETTINGS = Object.freeze({
  version: 4,
  event: {
    title: '云上青春 · 梦想交汇',
    subtitle: '电子签名墙',
    titleAlignment: 'left',
    fontFamily: 'system',
    titleColor: '#f7f9ff',
    subtitleColor: '#b8cbf4',
    titleSize: 52,
    subtitleSize: 21,
    showTitle: true,
    showStatus: true,
    showFooter: true
  },
  background: {
    mode: 'cosmos',
    preset: 'cosmos',
    color1: '#03091e',
    color2: '#071a45',
    color3: '#123c83',
    angle: 150,
    image: '',
    fit: 'cover',
    position: 'center center',
    overlayColor: '#020817',
    overlayOpacity: 0.22,
    blur: 0,
    stars: true
  },
  wall: {
    gap: 18,
    maxPerPage: 96,
    pageInterval: 10,
    showPageIndicator: true,
    signatureOpacity: 0.98,
    signatureGlow: true,
    glowColor: '#4f8cff',
    glowStrength: 0.56,
    wallPadding: 20,
    autoPageSize: true,
    minCellWidth: 280,
    minCellHeight: 120,
    cellPadding: 8,
    order: 'oldest'
  },
  signer: {
    defaultPenType: 'round',
    defaultLineStyle: 'solid',
    defaultPenColor: '#111827',
    defaultPenWidth: 6,
    defaultOpacity: 1,
    showAdvancedTools: true,
    canvasColor: '#ffffff'
  }
});

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function readJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return deepClone(fallback);
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    console.error(`Failed to read ${path.basename(filePath)}:`, error.message);
    return deepClone(fallback);
  }
}

function writeJsonAtomic(filePath, value) {
  const temp = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2), 'utf8');
  fs.renameSync(temp, filePath);
}

function clampNumber(value, fallback, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

function cleanText(value, fallback, maxLength) {
  if (typeof value !== 'string') return fallback;
  return value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, maxLength);
}

function cleanColor(value, fallback) {
  if (typeof value !== 'string') return fallback;
  const color = value.trim();
  return /^(#[0-9a-fA-F]{6}|#[0-9a-fA-F]{8}|rgba?\([\d\s.,%]+\))$/.test(color) ? color : fallback;
}

function cleanEnum(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function cleanBoolean(value, fallback) {
  return typeof value === 'boolean' ? value : fallback;
}

function cleanImageUrl(value, fallback = '') {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  if (!trimmed) return '';
  return /^\/uploads\/backgrounds\/[A-Za-z0-9._-]+$/.test(trimmed) ? trimmed : fallback;
}

function sanitizeSettings(input, baseSettings = DEFAULT_SETTINGS) {
  const base = deepClone(baseSettings || DEFAULT_SETTINGS);
  const source = input && typeof input === 'object' ? input : {};
  const event = source.event && typeof source.event === 'object' ? source.event : {};
  const background = source.background && typeof source.background === 'object' ? source.background : {};
  const wall = source.wall && typeof source.wall === 'object' ? source.wall : {};
  const signer = source.signer && typeof source.signer === 'object' ? source.signer : {};

  return {
    version: 4,
    event: {
      title: cleanText(event.title, base.event.title, 100),
      subtitle: cleanText(event.subtitle, base.event.subtitle, 100),
      titleAlignment: cleanEnum(event.titleAlignment, ['left', 'center', 'right'], base.event.titleAlignment),
      fontFamily: cleanEnum(event.fontFamily, ['system', 'serif', 'rounded', 'mono'], base.event.fontFamily),
      titleColor: cleanColor(event.titleColor, base.event.titleColor),
      subtitleColor: cleanColor(event.subtitleColor, base.event.subtitleColor),
      titleSize: clampNumber(event.titleSize, base.event.titleSize, 24, 96),
      subtitleSize: clampNumber(event.subtitleSize, base.event.subtitleSize, 12, 48),
      showTitle: cleanBoolean(event.showTitle, base.event.showTitle),
      showStatus: cleanBoolean(event.showStatus, base.event.showStatus),
      showFooter: cleanBoolean(event.showFooter, base.event.showFooter)
    },
    background: {
      mode: cleanEnum(background.mode, ['cosmos', 'gradient', 'solid', 'image'], base.background.mode),
      preset: cleanEnum(background.preset, ['cosmos', 'aurora', 'midnight', 'sunrise', 'pearl', 'custom'], base.background.preset),
      color1: cleanColor(background.color1, base.background.color1),
      color2: cleanColor(background.color2, base.background.color2),
      color3: cleanColor(background.color3, base.background.color3),
      angle: clampNumber(background.angle, base.background.angle, 0, 360),
      image: cleanImageUrl(background.image, base.background.image),
      fit: cleanEnum(background.fit, ['cover', 'contain', 'fill'], base.background.fit),
      position: cleanEnum(background.position, ['left top', 'center top', 'right top', 'left center', 'center center', 'right center', 'left bottom', 'center bottom', 'right bottom'], base.background.position),
      overlayColor: cleanColor(background.overlayColor, base.background.overlayColor),
      overlayOpacity: clampNumber(background.overlayOpacity, base.background.overlayOpacity, 0, 0.9),
      blur: clampNumber(background.blur, base.background.blur, 0, 20),
      stars: cleanBoolean(background.stars, base.background.stars)
    },
    wall: {
      gap: clampNumber(wall.gap, base.wall.gap, 4, 52),
      maxPerPage: Math.round(clampNumber(wall.maxPerPage, base.wall.maxPerPage, 4, 240)),
      pageInterval: Math.round(clampNumber(wall.pageInterval, base.wall.pageInterval, 4, 60)),
      showPageIndicator: cleanBoolean(wall.showPageIndicator, base.wall.showPageIndicator),
      signatureOpacity: clampNumber(wall.signatureOpacity, base.wall.signatureOpacity, 0.25, 1),
      signatureGlow: cleanBoolean(wall.signatureGlow, base.wall.signatureGlow),
      glowColor: cleanColor(wall.glowColor, base.wall.glowColor),
      glowStrength: clampNumber(wall.glowStrength, base.wall.glowStrength, 0, 1),
      wallPadding: clampNumber(wall.wallPadding, base.wall.wallPadding, 0, 80),
      autoPageSize: cleanBoolean(wall.autoPageSize, base.wall.autoPageSize),
      minCellWidth: Math.round(clampNumber(wall.minCellWidth, base.wall.minCellWidth, 80, 600)),
      minCellHeight: Math.round(clampNumber(wall.minCellHeight, base.wall.minCellHeight, 48, 360)),
      cellPadding: Math.round(clampNumber(wall.cellPadding, base.wall.cellPadding, 0, 40)),
      order: cleanEnum(wall.order, ['oldest', 'newest'], base.wall.order)
    },
    signer: {
      defaultPenType: cleanEnum(signer.defaultPenType, ['round', 'fountain', 'marker', 'neon'], base.signer.defaultPenType),
      defaultLineStyle: cleanEnum(signer.defaultLineStyle, ['solid', 'dashed', 'dotted', 'dashdot'], base.signer.defaultLineStyle),
      defaultPenColor: cleanColor(signer.defaultPenColor, base.signer.defaultPenColor),
      defaultPenWidth: clampNumber(signer.defaultPenWidth, base.signer.defaultPenWidth, 1, 24),
      defaultOpacity: clampNumber(signer.defaultOpacity, base.signer.defaultOpacity, 0.2, 1),
      showAdvancedTools: cleanBoolean(signer.showAdvancedTools, base.signer.showAdvancedTools),
      canvasColor: cleanColor(signer.canvasColor, base.signer.canvasColor)
    }
  };
}

function loadEntries() {
  const data = readJson(DATA_FILE, []);
  return Array.isArray(data)
    ? data.filter(item => item && typeof item.id === 'string' && typeof item.signature === 'string')
    : [];
}

function loadSettings() {
  const stored = readJson(SETTINGS_FILE, DEFAULT_SETTINGS);
  return sanitizeSettings(stored, DEFAULT_SETTINGS);
}

let entries = loadEntries();
let settings = loadSettings();
writeJsonAtomic(SETTINGS_FILE, settings);

function persistEntries() {
  writeJsonAtomic(DATA_FILE, entries);
}

function persistSettings() {
  writeJsonAtomic(SETTINGS_FILE, settings);
}

function removeUploadedFile(url, expectedPrefix, directory) {
  if (typeof url !== 'string' || !url.startsWith(expectedPrefix)) return;
  const filename = path.basename(url);
  const filePath = path.join(directory, filename);
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (error) {
    console.warn('Could not remove uploaded file:', error.message);
  }
}

function removeSignatureFile(entry) {
  if (entry) removeUploadedFile(entry.signature, '/uploads/signatures/', SIGNATURE_DIR);
}

function parseImageDataUrl(value, allowedTypes, maxBytes) {
  if (typeof value !== 'string') throw new Error('缺少图片数据');
  const match = value.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/);
  if (!match || !allowedTypes.includes(match[1])) throw new Error('图片格式无效');
  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length < 100) throw new Error('图片内容为空');
  if (buffer.length > maxBytes) throw new Error('图片文件过大');
  return { buffer, extension: match[1] === 'jpeg' ? 'jpg' : match[1] };
}

function createEntry(payload) {
  const parsed = parseImageDataUrl(payload && payload.signature, ['png'], 4 * 1024 * 1024);
  const id = crypto.randomUUID();
  const filename = `${id}.png`;
  fs.writeFileSync(path.join(SIGNATURE_DIR, filename), parsed.buffer);

  const styleSource = payload && payload.style && typeof payload.style === 'object' ? payload.style : {};
  const entry = {
    id,
    timestamp: new Date().toISOString(),
    signature: `/uploads/signatures/${filename}`,
    style: {
      penType: cleanEnum(styleSource.penType, ['round', 'fountain', 'marker', 'neon'], 'round'),
      lineStyle: cleanEnum(styleSource.lineStyle, ['solid', 'dashed', 'dotted', 'dashdot'], 'solid'),
      color: cleanColor(styleSource.color, '#111827'),
      width: clampNumber(styleSource.width, 6, 1, 24),
      opacity: clampNumber(styleSource.opacity, 1, 0.2, 1)
    }
  };

  entries.push(entry);
  while (entries.length > MAX_SIGNATURES) removeSignatureFile(entries.shift());
  persistEntries();
  return entry;
}

function adminAuthorized(req) {
  const expected = process.env.WALL_ADMIN_TOKEN;
  if (!expected) return true;
  const supplied = req.get('x-wall-admin-token') || req.query.token;
  return typeof supplied === 'string' && crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
}

function requireAdmin(req, res, next) {
  try {
    if (adminAuthorized(req)) return next();
  } catch (_error) {
    // Length mismatch in timingSafeEqual means unauthorized.
  }
  return res.status(403).json({ success: false, error: '管理口令错误' });
}

app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  next();
});
app.use(express.json({ limit: '14mb' }));
app.use(express.static(PUBLIC_DIR, { extensions: ['html'], etag: true }));
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '1h', etag: true }));

app.get('/', (_req, res) => res.redirect('/sign'));
app.get(['/admin', '/sign'], (_req, res) => res.sendFile(path.join(PUBLIC_DIR, 'admin.html')));
app.get(['/display', '/wall'], (_req, res) => res.sendFile(path.join(PUBLIC_DIR, 'display.html')));
app.get(['/studio', '/settings', '/control'], (_req, res) => res.sendFile(path.join(PUBLIC_DIR, 'studio.html')));

app.get('/api/entries', (_req, res) => {
  res.json({ success: true, count: entries.length, entries });
});

app.get('/api/settings', (_req, res) => {
  res.json({ success: true, settings });
});

app.put('/api/settings', requireAdmin, (req, res) => {
  settings = sanitizeSettings(req.body && req.body.settings ? req.body.settings : req.body, settings);
  persistSettings();
  io.emit('settings:update', settings);
  res.json({ success: true, settings });
});

app.post('/api/settings/reset', requireAdmin, (_req, res) => {
  const oldImage = settings.background.image;
  settings = deepClone(DEFAULT_SETTINGS);
  persistSettings();
  if (oldImage) removeUploadedFile(oldImage, '/uploads/backgrounds/', BACKGROUND_DIR);
  io.emit('settings:update', settings);
  res.json({ success: true, settings });
});

app.post('/api/background', requireAdmin, (req, res) => {
  try {
    const parsed = parseImageDataUrl(req.body && req.body.image, ['png', 'jpeg', 'webp'], 10 * 1024 * 1024);
    const filename = `${crypto.randomUUID()}.${parsed.extension}`;
    fs.writeFileSync(path.join(BACKGROUND_DIR, filename), parsed.buffer);
    const previous = settings.background.image;
    settings = sanitizeSettings({
      background: {
        ...settings.background,
        mode: 'image',
        preset: 'custom',
        image: `/uploads/backgrounds/${filename}`
      }
    }, settings);
    persistSettings();
    if (previous && previous !== settings.background.image) {
      removeUploadedFile(previous, '/uploads/backgrounds/', BACKGROUND_DIR);
    }
    io.emit('settings:update', settings);
    res.json({ success: true, url: settings.background.image, settings });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

app.delete('/api/background', requireAdmin, (_req, res) => {
  const previous = settings.background.image;
  settings = sanitizeSettings({
    background: { ...settings.background, mode: 'cosmos', preset: 'cosmos', image: '' }
  }, settings);
  persistSettings();
  if (previous) removeUploadedFile(previous, '/uploads/backgrounds/', BACKGROUND_DIR);
  io.emit('settings:update', settings);
  res.json({ success: true, settings });
});

app.get('/api/qr', async (req, res) => {
  try {
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const url = `${protocol}://${req.get('host')}/sign`;
    const qr = await QRCode.toDataURL(url, {
      width: 360,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: { dark: '#08122b', light: '#ffffff' }
    });
    res.json({ success: true, url, qr });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/stats', (_req, res) => {
  res.json({
    success: true,
    totalEntries: entries.length,
    connectedClients: io.engine.clientsCount,
    uptime: Math.round(process.uptime()),
    version: 4
  });
});

app.delete('/api/entries/:id', requireAdmin, (req, res) => {
  const index = entries.findIndex(item => item.id === req.params.id);
  if (index < 0) return res.status(404).json({ success: false, error: '签名不存在' });
  const [removed] = entries.splice(index, 1);
  removeSignatureFile(removed);
  persistEntries();
  io.emit('signature:removed', removed.id);
  io.emit('signature:count', entries.length);
  return res.json({ success: true, id: removed.id, count: entries.length });
});

app.delete('/api/entries', requireAdmin, (_req, res) => {
  entries.forEach(removeSignatureFile);
  entries = [];
  persistEntries();
  io.emit('wall:cleared');
  io.emit('signature:count', 0);
  return res.json({ success: true });
});

io.on('connection', socket => {
  socket.emit('wall:init', { entries, count: entries.length, settings });
  io.emit('client:count', io.engine.clientsCount);

  socket.on('signature:submit', (payload, acknowledge) => {
    const reply = typeof acknowledge === 'function' ? acknowledge : () => {};
    try {
      const entry = createEntry(payload);
      reply({ success: true, entry });
      io.emit('signature:new', entry);
      io.emit('signature:count', entries.length);
    } catch (error) {
      console.error('Signature submission failed:', error.message);
      reply({ success: false, error: error.message || '提交失败' });
    }
  });

  socket.on('disconnect', () => {
    io.emit('client:count', io.engine.clientsCount);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\nLive Signature Wall Pro v3.2 is online`);
  console.log(`Signer:  http://localhost:${PORT}/sign`);
  console.log(`LED Wall: http://localhost:${PORT}/display`);
  console.log(`Studio:   http://localhost:${PORT}/studio`);
  console.log(`Stats:    http://localhost:${PORT}/api/stats`);

  const addresses = [];
  for (const interfaces of Object.values(os.networkInterfaces())) {
    for (const item of interfaces || []) {
      if (item.family === 'IPv4' && !item.internal) addresses.push(item.address);
    }
  }
  for (const address of [...new Set(addresses)]) {
    console.log(`LAN Signer:  http://${address}:${PORT}/sign`);
    console.log(`LAN LED Wall: http://${address}:${PORT}/display`);
    console.log(`LAN Studio:   http://${address}:${PORT}/studio`);
  }
  if (process.env.WALL_ADMIN_TOKEN) console.log('Studio write operations are protected by WALL_ADMIN_TOKEN.');
  console.log('');
});
