import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import crypto from "crypto";

dotenv.config();

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'secret-chetrika-rayz-key';
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/chetrikarayz';
const LOG_LEVEL = (process.env.LOG_LEVEL || 'INFO').toUpperCase();
const RING_SIZE = 200;
const DANGER_ZONE_PASSWORD = process.env.DANGER_ZONE_PASSWORD || 'admin@123';

const LOG_LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };
const currentLevel = LOG_LEVELS[LOG_LEVEL] ?? 1;

const ts = () => new Date().toISOString();

const logger = {
  debug: (...args) => { if (currentLevel <= 0) console.log(`[${ts()}] [DEBUG]`, ...args); },
  info: (...args) => { if (currentLevel <= 1) console.log(`[${ts()}] [INFO]`, ...args); },
  warn: (...args) => { if (currentLevel <= 2) console.warn(`[${ts()}] [WARN]`, ...args); },
  error: (...args) => { if (currentLevel <= 3) console.error(`[${ts()}] [ERROR]`, ...args); }
};

// ================ In-Memory State ================
const ringBuffers = {};  // { deviceId: [readingDoc, ...] }
let mockModeConfig = {};
let espHeartbeat = {};
let espConnected = {};
let energyAccum = {}; // { deviceId: { e1, e2, e3, lastT } }

const ESP_TIMEOUT_MS = 60000;

// ================ Mongoose Models ================
const ReadingSchema = new mongoose.Schema({
  s: { type: String, index: true },
  t: { type: Date },
  v: [Number], i: [Number], p: [Number],
  e: [Number], f: [Number], pf: [Number],
  n: Number
});
ReadingSchema.index({ s: 1, t: -1 });
ReadingSchema.index({ t: 1 }, { expireAfterSeconds: 7776000 }); // 90 day TTL

const Reading = mongoose.model("Reading", ReadingSchema);

const AdminSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['admin', 'superadmin'], default: 'admin' }
});
const Admin = mongoose.model("Admin", AdminSchema);

const PhaseSwapperSchema = new mongoose.Schema({
  name: { type: String, required: true },
  currentPhase: { type: String, enum: ['R', 'Y', 'B', 'NONE'], default: 'R' },
  loadType: { type: String, default: 'Residential' },
  status: { type: String, enum: ['active', 'inactive', 'fault'], default: 'active' },
  lastSwappedAt: { type: Date, default: null },
  switchDelay: { type: Number, default: 3000, min: 500, max: 30000 }
}, { timestamps: true });
const PhaseSwapper = mongoose.model("PhaseSwapper", PhaseSwapperSchema);

const FirmwareSchema = new mongoose.Schema({
  version: { type: String, required: true, unique: true },
  channel: { type: String, enum: ['stable', 'beta', 'rc'], default: 'stable' },
  filename: { type: String, required: true },
  size: { type: Number, required: true },
  sha256: { type: String, required: true },
  md5: { type: String, default: '' },
  binary: { type: Buffer, required: true }, // Stored in MongoDB
  changelog: { type: String, default: '' },
  isLatest: { type: Boolean, default: false },
  minDeviceVersion: { type: String, default: '0.0.0' },
  createdBy: { type: String, default: '' }
}, { timestamps: true });
FirmwareSchema.index({ version: -1 });
FirmwareSchema.index({ channel: 1, isLatest: 1 });
const Firmware = mongoose.model("Firmware", FirmwareSchema);

const OTAEventSchema = new mongoose.Schema({
  deviceId: { type: String, required: true },
  fromVersion: { type: String, required: true },
  toVersion: { type: String, default: '' },
  status: { type: String, enum: ['success', 'failed', 'in_progress', 'downloading'], required: true },
  detail: { type: String, default: '' },
  timestamp: { type: Date, default: Date.now }
});
OTAEventSchema.index({ deviceId: 1, timestamp: -1 });
const OTAEvent = mongoose.model("OTAEvent", OTAEventSchema);

const DeviceSchema = new mongoose.Schema({
  deviceId: { type: String, required: true, unique: true },
  firmwareVersion: { type: String, default: '0.0.0' },
  apiKey: { type: String, required: true },
  lastSeen: { type: Date, default: null },
  rssi: { type: Number, default: 0 },
  freeHeap: { type: Number, default: 0 },
  uptime: { type: Number, default: 0 },
  wifiStatus: { type: String, default: 'unknown' },
  restartReason: { type: String, default: 'unknown' },
  bootCount: { type: Number, default: 0 },
  ipAddress: { type: String, default: '' },
  status: { type: String, enum: ['online', 'offline', 'fault'], default: 'offline' },
  currentPhase: { type: String, enum: ['R', 'Y', 'B', ''], default: '' }
}, { timestamps: true });
DeviceSchema.index({ status: 1, lastSeen: -1 });
const Device = mongoose.model("Device", DeviceSchema);

const CommandSchema = new mongoose.Schema({
  deviceId: { type: String, required: true },
  command: {
    type: String,
    enum: ['restart', 'ota', 'reset_energy', 'clear_logs', 'sync_time', 'swap_phase', 'clear_fault', 'set_switch_delay'],
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'delivered', 'executed', 'failed'],
    default: 'pending'
  },
  params: { type: mongoose.Schema.Types.Mixed, default: {} },
  result: { type: String, default: '' },
  deliveredAt: { type: Date, default: null },
  executedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now }
});
CommandSchema.index({ deviceId: 1, status: 1, createdAt: -1 });
CommandSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7776000 });
const Command = mongoose.model("Command", CommandSchema);

const seedAdmin = async () => {
  const existingSuperAdmin = await Admin.findOne({ username: "superadmin" });
  if (!existingSuperAdmin) {
    const hashedPassword = await bcrypt.hash("superadmin123", 10);
    await Admin.create({ username: "superadmin", password: hashedPassword, role: "superadmin" });
    logger.info("✅ SuperAdmin user created (superadmin / superadmin123)");
  }
  const existingAdmin = await Admin.findOne({ username: "admin" });
  if (!existingAdmin) {
    const hashedPassword = await bcrypt.hash("password123", 10);
    await Admin.create({ username: "admin", password: hashedPassword, role: "admin" });
    logger.info("✅ Admin user created (admin / password123)");
  }
};

// ================ Middlewares ================
app.use(cors({
  origin: (origin, callback) => {
    const allowed = (process.env.FRONTEND_URL || '').replace(/\/$/, '');
    if (!origin || !allowed || allowed === origin) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  }
}));
app.use(express.json({ limit: '50mb' }));

app.use((req, res, next) => {
  const start = Date.now();

  if (req.method === 'POST' && req.body && Object.keys(req.body).length > 0) {
    const body = { ...req.body };
    const sensitive = ['password', 'token', 'authorization'];
    for (const key of sensitive) {
      if (body[key]) body[key] = '***';
    }
    logger.info(`⇉ ${req.method} ${req.originalUrl} body=${JSON.stringify(body)}`);
  }

  res.on("finish", () => {
    const ms = Date.now() - start;
    logger.info(`${req.method} ${req.originalUrl} → ${res.statusCode} (${ms}ms)`);
  });
  next();
});

app.use((req, res, next) => {
  req.setTimeout(30000, () => {
    if (!res.headersSent) {
      res.status(503).json({ error: "Request timeout" });
    }
    req.destroy();
  });
  next();
});

async function seedEnergyAccum() {
  try {
    const ids = await Reading.distinct('s');
    for (const id of ids) {
      const last = await Reading.findOne({ s: id }).sort({ t: -1 }).lean();
      if (last && last.e) {
        energyAccum[id] = { e1: last.e[0] || 0, e2: last.e[1] || 0, e3: last.e[2] || 0, lastT: last.t };
      }
    }
    if (ids.length > 0) logger.info(`⚡ Energy accumulators seeded from DB for devices: ${ids.join(', ')}`);
  } catch (err) {
    logger.warn("Energy seed skipped:", err.message);
  }
}

mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 5000 })
  .then(async () => {
    logger.info("✅ Connected to MongoDB");
    await mongoose.connection.syncIndexes();
    logger.info("✅ Indexes synced (old deviceId unique index dropped, new compound index created)");
    await seedAdmin();
    await seedEnergyAccum();
    loadCsvProfiles();
  })
  .catch(err => logger.error("❌ MongoDB connection error:", err.message));

// ================ Auth Middleware ================
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: "Access Denied" });
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: "Invalid Token" });
    req.user = user;
    next();
  });
};

const authorizeRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Not authenticated" });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Insufficient privileges" });
    }
    next();
  };
};

const DEVICE_API_KEY = process.env.DEVICE_API_KEY || 'cms-device-key-default';

const authenticateDevice = (req, res, next) => {
  const apiKey = req.headers['x-api-key'] || req.query.api_key;
  if (!apiKey || apiKey !== DEVICE_API_KEY) {
    return res.status(401).json({ error: "Invalid or missing API key" });
  }
  next();
};

// ================ Write Data Row ================
function writeDataRow(d, deviceId) {
  const v = [d.v1 ?? 0, d.v2 ?? 0, d.v3 ?? 0];
  const i = [d.i1 ?? 0, d.i2 ?? 0, d.i3 ?? 0];

  if (v.some(x => x > 300) || i.some(x => x > 200)) {
    logger.warn(`Rejected data for device ${deviceId}: voltage or current exceeds limit`, { v, i });
    return false;
  }

  const now = new Date();
  const p1 = d.p1 ?? 0, p2 = d.p2 ?? 0, p3 = d.p3 ?? 0;

  if (!energyAccum[deviceId]) {
    energyAccum[deviceId] = { e1: 0, e2: 0, e3: 0, lastT: null };
  }

  const acc = energyAccum[deviceId];
  if (acc.lastT) {
    const hours = (now - acc.lastT) / 3600000;
    acc.e1 += p1 * hours / 1000;
    acc.e2 += p2 * hours / 1000;
    acc.e3 += p3 * hours / 1000;
  }
  acc.lastT = now;

  const doc = {
    s: deviceId,
    t: now,
    v: [d.v1 ?? 0, d.v2 ?? 0, d.v3 ?? 0],
    i: [d.i1 ?? 0, d.i2 ?? 0, d.i3 ?? 0],
    p: [p1, p2, p3],
    e: [acc.e1, acc.e2, acc.e3],
    f: [d.f1 ?? 0, d.f2 ?? 0, d.f3 ?? 0],
    pf: [d.pf1 ?? 0, d.pf2 ?? 0, d.pf3 ?? 0],
    n: d.i_n ?? 0
  };

  Reading.create(doc).catch(err => logger.error("MongoDB insert error:", err.message));

  if (!ringBuffers[deviceId]) ringBuffers[deviceId] = [];
  ringBuffers[deviceId].push(doc);
  if (ringBuffers[deviceId].length > RING_SIZE) ringBuffers[deviceId].shift();

  espHeartbeat[deviceId] = Date.now();
  espConnected[deviceId] = true;
  return true;
}

function pad(n) { return String(n).padStart(2, '0'); }

function formatIST(date) {
  const d = new Date(date.getTime() + 330 * 60000);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, '0')}`;
}

function formatTimeOnly(date) {
  const d = new Date(date.getTime() + 330 * 60000);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// ================ CSV Time-Series Playback ================
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CSV_DIR = path.resolve(__dirname, '../../');

let csvTimeSeries = [];
let csvCursor = -1;

function parseCsvTimeSeries(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.trim().split('\n');
  if (lines.length < 2) return [];

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    if (cols.length < 19) continue;
    const timestamp = cols[0].trim();
    const t = new Date(timestamp);
    if (isNaN(t.getTime())) continue;
    rows.push({
      time: t,
      v1: parseFloat(cols[1]) || 0, i1: parseFloat(cols[2]) || 0, p1: parseFloat(cols[3]) || 0,
      e1: parseFloat(cols[4]) || 0, f1: parseFloat(cols[5]) || 0, pf1: parseFloat(cols[6]) || 0,
      v2: parseFloat(cols[7]) || 0, i2: parseFloat(cols[8]) || 0, p2: parseFloat(cols[9]) || 0,
      e2: parseFloat(cols[10]) || 0, f2: parseFloat(cols[11]) || 0, pf2: parseFloat(cols[12]) || 0,
      v3: parseFloat(cols[13]) || 0, i3: parseFloat(cols[14]) || 0, p3: parseFloat(cols[15]) || 0,
      e3: parseFloat(cols[16]) || 0, f3: parseFloat(cols[17]) || 0, pf3: parseFloat(cols[18]) || 0,
      i_n: 0
    });
  }
  return rows;
}

function initCsvCursor() {
  if (csvTimeSeries.length === 0) return;
  const now = new Date();
  const nowMs = now.getHours() * 3600000 + now.getMinutes() * 60000 + now.getSeconds() * 1000 + now.getMilliseconds();

  let bestIdx = 0;
  let bestDiff = Infinity;

  for (let i = 0; i < csvTimeSeries.length; i++) {
    const t = csvTimeSeries[i].time;
    const rowMs = t.getHours() * 3600000 + t.getMinutes() * 60000 + t.getSeconds() * 1000 + t.getMilliseconds();
    let diff = Math.abs(nowMs - rowMs);
    if (diff > 43200000) diff = 86400000 - diff;
    if (diff < bestDiff) {
      bestDiff = diff;
      bestIdx = i;
    }
  }
  csvCursor = bestIdx;
  logger.info(`📀 CSV playback synced at row ${bestIdx}/${csvTimeSeries.length} (CSV time ${csvTimeSeries[bestIdx].time.toISOString()} ≈ local ${now.toISOString()})`);
}

function loadCsvProfiles() {
  let files;
  try {
    files = fs.readdirSync(CSV_DIR).filter(f => f.endsWith('.csv') && (f.startsWith('dtms') || f.startsWith('regulator_data')));
  } catch {
    logger.warn('⚠️  Could not read CSV directory, using fallback mock data');
    return;
  }
  for (const file of files) {
    try {
      const rows = parseCsvTimeSeries(path.join(CSV_DIR, file));
      if (rows.length > 0) {
        rows.sort((a, b) => a.time - b.time);
        csvTimeSeries.push(...rows);
        logger.info(`📀 Loaded ${rows.length} rows from ${file} (${rows[0].time.toISOString()} → ${rows[rows.length - 1].time.toISOString()})`);
      }
    } catch (err) {
      logger.warn(`⚠️  Skipped CSV ${file}: ${err.message}`);
    }
  }
  logger.info(`📀 CSV time-series loaded: ${csvTimeSeries.length} total rows`);
}

// ================ Mock Data Generator ================
function generateMockPayload() {
  if (csvTimeSeries.length > 0) {
    if (csvCursor < 0) csvCursor = 0;
    const row = csvTimeSeries[csvCursor];
    csvCursor = (csvCursor + 1) % csvTimeSeries.length;
    return {
      v1: row.v1, i1: row.i1, p1: row.p1,
      e1: row.e1 || 0, f1: row.f1, pf1: row.pf1,
      v2: row.v2, i2: row.i2, p2: row.p2,
      e2: row.e2 || 0, f2: row.f2, pf2: row.pf2,
      v3: row.v3, i3: row.i3, p3: row.p3,
      e3: row.e3 || 0, f3: row.f3, pf3: row.pf3,
      i_n: row.i_n || 0
    };
  }

  const rng = (b, v) => parseFloat((b + (Math.random() - 0.5) * v * 2).toFixed(3));
  const rngPos = (b, v) => parseFloat(Math.max(0, b + (Math.random() - 0.5) * v * 2).toFixed(3));
  const v1 = rng(230, 5); const i1 = rngPos(1.5, 0.6);
  const v2 = rng(228, 6); const i2 = rngPos(2.0, 0.8);
  const v3 = rng(232, 4); const i3 = rngPos(1.2, 0.5);
  const pf1 = rng(0.92, 0.06); const pf2 = rng(0.88, 0.08); const pf3 = rng(0.95, 0.04);
  return {
    v1, i1, p1: parseFloat((v1 * i1 * (0.85 + Math.random() * 0.15)).toFixed(2)),
    e1: rngPos(150, 10), f1: rng(50, 0.3), pf1,
    v2, i2, p2: parseFloat((v2 * i2 * (0.85 + Math.random() * 0.15)).toFixed(2)),
    e2: rngPos(90, 8), f2: rng(49.9, 0.3), pf2,
    v3, i3, p3: parseFloat((v3 * i3 * (0.85 + Math.random() * 0.15)).toFixed(2)),
    e3: rngPos(200, 12), f3: rng(50.1, 0.2), pf3,
    i_n: rngPos(0.15, 0.12)
  };
}

function startMockGenerator(deviceId) {
  if (mockModeConfig[deviceId]?.interval) return;
  const interval = setInterval(() => {
    const d = generateMockPayload();
    writeDataRow(d, deviceId);
  }, 5000);
  mockModeConfig[deviceId] = { enabled: true, interval };
  logger.info(`🎭 Mock data started for device ${deviceId}`);
}

function stopMockGenerator(deviceId) {
  if (mockModeConfig[deviceId]?.interval) {
    clearInterval(mockModeConfig[deviceId].interval);
    mockModeConfig[deviceId] = { enabled: false, interval: null };
    logger.info(`🎭 Mock data stopped for device ${deviceId}`);
  }
}

// ================ Ring Buffer Helpers ================
function getBuffer(deviceId) {
  return ringBuffers[deviceId] || [];
}

function docToPhaseResponse(doc) {
  if (!doc) return null;
  const [v1 = 0, v2 = 0, v3 = 0] = doc.v || [];
  const [i1 = 0, i2 = 0, i3 = 0] = doc.i || [];
  const [p1 = 0, p2 = 0, p3 = 0] = doc.p || [];
  const [e1 = 0, e2 = 0, e3 = 0] = doc.e || [];
  const [f1 = 0, f2 = 0, f3 = 0] = doc.f || [];
  const [pf1 = 0, pf2 = 0, pf3 = 0] = doc.pf || [];
  const n = doc.n || 0;
  return {
    timestamp: doc.t ? doc.t.toISOString() : new Date().toISOString(),
    device_id: doc.s || 'unknown',
    phases: {
      R: { voltage: v1, current: i1, power: p1, energy: e1, frequency: f1, pf: pf1 },
      Y: { voltage: v2, current: i2, power: p2, energy: e2, frequency: f2, pf: pf2 },
      B: { voltage: v3, current: i3, power: p3, energy: e3, frequency: f3, pf: pf3 }
    },
    neutralCurrent: n
  };
}

// Helper: send JSON without chunked encoding (A7677S fails on chunked responses)
function sendJson(res, data, status = 200) {
  const jsonStr = JSON.stringify(data);
  res.set('Content-Length', Buffer.byteLength(jsonStr).toString());
  res.status(status).send(jsonStr);
}

// ================ ROUTES ================

app.get("/", (req, res) => {
  res.json({ message: "Chetrika Rayz Backend API is running" });
});

// ---------- IoT Data Ingestion ----------
app.post("/api/data", authenticateDevice, async (req, res) => {
  try {
    const d = req.body;
    if (!d || Object.keys(d).length === 0) {
      return sendJson(res, { error: "empty body" }, 400);
    }
    const deviceId = d.device_id || 'unknown';
    const fwVersion = d.fw_version || '0.0.0';

    // Remap swapper single-phase data (voltage/current/power) into the correct 3-phase slot
    if (d.current_phase && d.voltage !== undefined) {
      const phaseIndex = { R: 0, Y: 1, B: 2 }[d.current_phase];
      if (phaseIndex !== undefined) {
        d.v1 = d.v2 = d.v3 = 0;
        d.i1 = d.i2 = d.i3 = 0;
        d.p1 = d.p2 = d.p3 = 0;
        d.e1 = d.e2 = d.e3 = 0;
        d.f1 = d.f2 = d.f3 = 0;
        d.pf1 = d.pf2 = d.pf3 = 0;
        const slot = ['1', '2', '3'][phaseIndex];
        d[`v${slot}`] = d.voltage || 0;
        d[`i${slot}`] = d.current || 0;
        d[`p${slot}`] = d.power || 0;
        d[`e${slot}`] = d.energy || 0;
        d[`f${slot}`] = d.frequency || 0;
        d[`pf${slot}`] = d.pf || 0;
      }
    }

    if (!writeDataRow(d, deviceId)) {
      return sendJson(res, { error: "voltage or current exceeds limit" }, 400);
    }

    const updateFields = {
      firmwareVersion: fwVersion,
      lastSeen: new Date(),
      ipAddress: req.ip || '',
      status: 'online'
    };
    if (d.current_phase) updateFields.currentPhase = d.current_phase;

    // Auto-register or update device
    await Device.findOneAndUpdate({ deviceId }, {
      $set: updateFields,
      $setOnInsert: {
        apiKey: DEVICE_API_KEY
      }
    }, { upsert: true });

    // Sync PhaseSwapper document from device telemetry
    const swapperName = deviceId.startsWith("SW") ? deviceId : "SW" + deviceId;
    const swapperStatus = d.fault === true ? 'fault' : (d.current_phase ? 'active' : undefined);
    const swapperUpdate = {};
    if (d.current_phase) {
      swapperUpdate.currentPhase = d.current_phase;
      swapperUpdate.lastSwappedAt = new Date();
    }
    if (swapperStatus) swapperUpdate.status = swapperStatus;
    if (Object.keys(swapperUpdate).length > 0) {
      await PhaseSwapper.findOneAndUpdate(
        { name: { $in: [deviceId, swapperName] } },
        { $set: swapperUpdate }
      );
    }

    logger.info(`📥 Data — device=${deviceId} FW=${fwVersion} phase=${d.current_phase || '?'}`);

    // Check for pending OTA command
    const pendingCmd = await Command.findOneAndUpdate(
      { deviceId, command: 'ota', status: 'pending' },
      { $set: { status: 'delivered', deliveredAt: new Date() } },
      { sort: { createdAt: 1 } }
    ).lean();

    if (pendingCmd) {
      const params = pendingCmd.params || {};
      const version = params.version || null;
      const channel = params.channel || 'stable';
      let fw;
      if (version) {
        fw = await Firmware.findOne({ version }).lean();
      } else {
        fw = await Firmware.findOne({ channel, isLatest: true }).lean();
      }
      if (fw) {
        const downloadToken = jwt.sign(
          { deviceId, fwVersion: fw.version, purpose: 'firmware_download' },
          JWT_SECRET,
          { expiresIn: '1h' }
        );
        const downloadUrl = `https://${req.get('host')}/api/iot/firmware/download/${fw.version}?token=${downloadToken}`;
        logger.info(`📲 OTA triggered: ${deviceId} v${fwVersion} → v${fw.version}`);
        return sendJson(res, {
          received: true,
          firmware_url: downloadUrl,
          version: fw.version,
          md5: fw.md5 || '',
          sha256: fw.sha256,
          size: fw.size
        });
      }
    }

    sendJson(res, { received: true });
  } catch (err) {
    logger.error("Data write error:", err.message);
    sendJson(res, { error: "internal error" }, 500);
  }
});

// ---------- ESP32 Heartbeat (with health metrics) ----------
app.post("/api/heartbeat", authenticateDevice, async (req, res) => {
  try {
    const { device_id, fw_version, rssi, free_heap, uptime, wifi_status, restart_reason, boot_count } = req.body;
    if (!device_id) return res.status(400).json({ error: "device_id required" });

    espHeartbeat[device_id] = Date.now();
    espConnected[device_id] = true;

    const hbUpdate = {
      firmwareVersion: fw_version || '0.0.0',
      lastSeen: new Date(),
      rssi: rssi ?? 0,
      freeHeap: free_heap ?? 0,
      uptime: uptime ?? 0,
      wifiStatus: wifi_status || 'connected',
      restartReason: restart_reason || 'unknown',
      bootCount: boot_count ?? 0,
      ipAddress: req.ip || '',
      status: 'online'
    };

    const receivedPhase = req.body.phase || req.body.current_phase;
    if (receivedPhase) hbUpdate.currentPhase = receivedPhase;

    await Device.findOneAndUpdate({ deviceId: device_id }, {
      $set: hbUpdate,
      $setOnInsert: { apiKey: DEVICE_API_KEY }
    }, { upsert: true });

    res.status(200).send("ok");
  } catch (err) {
    logger.error("Heartbeat error:", err.message);
    res.status(500).send("error");
  }
});

// ---------- Auth ----------
app.post("/api/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: "Username and password are required" });
    }
    const user = await Admin.findOne({ username });
    if (!user) return res.status(401).json({ error: "Invalid credentials" });
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ error: "Invalid credentials" });
    const token = jwt.sign({ username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '8h' });
    return res.json({ token, role: user.role, message: "Login successful" });
  } catch (error) {
    logger.error("Login error:", error);
    return res.status(500).json({ error: "Internal server error", details: error.message });
  }
});

// ---------- Danger Zone Verification ----------
app.post("/api/auth/verify-danger", authenticateToken, authorizeRole('superadmin'), (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: "Password required" });
  if (password === DANGER_ZONE_PASSWORD) return res.json({ verified: true });
  res.status(403).json({ error: "Incorrect danger zone password" });
});

// ---------- List active devices (from MongoDB) ----------
app.get("/api/iot/active-devices", authenticateToken, async (req, res) => {
  try {
    const ids = await Reading.distinct('s');
    const devices = ids.map(id => ({ deviceId: id }));
    res.json({ devices });
  } catch {
    res.json({ devices: [] });
  }
});

// ---------- Debug: show time range of data in DB ----------
app.get("/api/iot/debug-times", authenticateToken, async (req, res) => {
  try {
    const deviceId = req.query.device_id || 'unknown';
    const [first, last] = await Promise.all([
      Reading.findOne({ s: deviceId }).sort({ t: 1 }).lean(),
      Reading.findOne({ s: deviceId }).sort({ t: -1 }).lean()
    ]);
    const count = await Reading.countDocuments({ s: deviceId });
    res.json({
      device_id: deviceId,
      count,
      firstTimestamp: first?.t?.toISOString() || null,
      lastTimestamp: last?.t?.toISOString() || null
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- Latest real-time data (from ring buffer) ----------
app.get("/api/iot/latest", authenticateToken, async (req, res) => {
  const deviceId = req.query.device_id || 'unknown';
  const buf = getBuffer(deviceId);
  const latest = buf.length > 0 ? buf[buf.length - 1] : null;
  if (!latest) return res.json({ error: "No data available yet" });

  const result = docToPhaseResponse(latest);

  // Attach current phase from device record for swapper support
  try {
    const device = await Device.findOne({ deviceId }).select('currentPhase').lean();
    if (device && device.currentPhase) {
      result.current_phase = device.currentPhase;
    }
  } catch {}

  res.json(result);
});

// ---------- History for charts (from ring buffer or MongoDB with time range) ----------
app.get("/api/iot/history", authenticateToken, async (req, res) => {
  const deviceId = req.query.device_id || 'unknown';
  const limit = parseInt(req.query.limit) || 60;
  const range = req.query.range || '';
  const from = req.query.from || '';
  const to = req.query.to || '';

  if (range || from) {
    try {
      let fromTime, toTime;
      if (from) {
        fromTime = new Date(from);
        toTime = to ? new Date(to) : new Date();
      } else {
        const now = new Date();
        switch (range) {
          case '24h': fromTime = new Date(now.getTime() - 24 * 60 * 60 * 1000); break;
          case '7d': fromTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); break;
          case '30d': fromTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); break;
          case 'all': fromTime = new Date(0); break;
          default: fromTime = new Date(now.getTime() - 3 * 60 * 60 * 1000);
        }
        toTime = new Date();
      }

      const filter = { s: deviceId, t: { $gte: fromTime, $lte: toTime } };
      const totalCount = await Reading.countDocuments(filter);
      const maxPoints = 500;

      let docs;
      if (totalCount > maxPoints) {
        docs = await Reading.aggregate([
          { $match: filter },
          { $sort: { t: 1 } },
          { $bucketAuto: { groupBy: "$t", buckets: maxPoints, output: { first: { $first: "$$ROOT" } } } },
          { $replaceRoot: { newRoot: "$first" } }
        ]).allowDiskUse(true);
      } else {
        docs = await Reading.find(filter).sort({ t: 1 }).lean();
      }

      const history = docs.map(doc => ({
        time: doc.t ? doc.t.toISOString() : '',
        R_current: (doc.i?.[0] || 0), Y_current: (doc.i?.[1] || 0), B_current: (doc.i?.[2] || 0),
        R_voltage: (doc.v?.[0] || 0), Y_voltage: (doc.v?.[1] || 0), B_voltage: (doc.v?.[2] || 0),
        R_power: (doc.p?.[0] || 0), Y_power: (doc.p?.[1] || 0), B_power: (doc.p?.[2] || 0),
        R_energy: (doc.e?.[0] || 0), Y_energy: (doc.e?.[1] || 0), B_energy: (doc.e?.[2] || 0),
        R_freq: (doc.f?.[0] || 0), Y_freq: (doc.f?.[1] || 0), B_freq: (doc.f?.[2] || 0),
        R_pf: (doc.pf?.[0] || 0), Y_pf: (doc.pf?.[1] || 0), B_pf: (doc.pf?.[2] || 0),
        neutral: (doc.n || 0)
      }));

      return res.json({ data: history, total: history.length });
    } catch (err) {
      logger.error("History query error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  const buf = getBuffer(deviceId);
  const slice = buf.slice(-limit);

  if (slice.length === 0) return res.json({ data: [] });

  const history = slice.map(doc => ({
    time: doc.t ? formatTimeOnly(doc.t) : '',
    R_current: (doc.i?.[0] || 0), Y_current: (doc.i?.[1] || 0), B_current: (doc.i?.[2] || 0),
    R_voltage: (doc.v?.[0] || 0), Y_voltage: (doc.v?.[1] || 0), B_voltage: (doc.v?.[2] || 0),
    R_power: (doc.p?.[0] || 0), Y_power: (doc.p?.[1] || 0), B_power: (doc.p?.[2] || 0),
    R_energy: (doc.e?.[0] || 0), Y_energy: (doc.e?.[1] || 0), B_energy: (doc.e?.[2] || 0),
    R_freq: (doc.f?.[0] || 0), Y_freq: (doc.f?.[1] || 0), B_freq: (doc.f?.[2] || 0),
    R_pf: (doc.pf?.[0] || 0), Y_pf: (doc.pf?.[1] || 0), B_pf: (doc.pf?.[2] || 0),
    neutral: (doc.n || 0)
  }));

  res.json({ data: history, total: history.length });
});

// ---------- Logs with pagination (from MongoDB) ----------
app.get("/api/iot/logs", authenticateToken, async (req, res) => {
  try {
    const deviceId = req.query.device_id || 'unknown';
    const from = req.query.from || null;
    const to = req.query.to || null;
    const page = parseInt(req.query.page) || 0;
    const pageSize = Math.min(parseInt(req.query.pageSize) || 20, 100);

    const filter = { s: deviceId };
    if (from || to) {
      filter.t = {};
      if (from) filter.t.$gte = new Date(from);
      if (to) filter.t.$lte = new Date(to);
    }

    const [docs, total] = await Promise.all([
      Reading.find(filter).sort({ t: -1 }).skip(page * pageSize).limit(pageSize).lean(),
      Reading.countDocuments(filter)
    ]);

    const data = docs.map(doc => {
      return {
        timestamp: doc.t ? doc.t.toISOString() : '',
        timestamp_display: doc.t ? formatIST(doc.t) : '',
        'v1(V)': doc.v?.[0] ?? 0, 'i1(A)': doc.i?.[0] ?? 0, 'p1(W)': doc.p?.[0] ?? 0,
        'e1(kWh)': doc.e?.[0] ?? 0, 'f1(Hz)': doc.f?.[0] ?? 0, pf1: doc.pf?.[0] ?? 0,
        'v2(V)': doc.v?.[1] ?? 0, 'i2(A)': doc.i?.[1] ?? 0, 'p2(W)': doc.p?.[1] ?? 0,
        'e2(kWh)': doc.e?.[1] ?? 0, 'f2(Hz)': doc.f?.[1] ?? 0, pf2: doc.pf?.[1] ?? 0,
        'v3(V)': doc.v?.[2] ?? 0, 'i3(A)': doc.i?.[2] ?? 0, 'p3(W)': doc.p?.[2] ?? 0,
        'e3(kWh)': doc.e?.[2] ?? 0, 'f3(Hz)': doc.f?.[2] ?? 0, pf3: doc.pf?.[2] ?? 0,
        'i_n(A)': doc.n ?? 0
      };
    });

    res.json({
      data,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      device_id: deviceId
    });
  } catch (err) {
    logger.error("Logs query error:", err.message);
    res.status(500).json({ error: "Failed to fetch logs" });
  }
});

// ---------- Stats (from MongoDB aggregation) ----------
app.get("/api/iot/stats", authenticateToken, async (req, res) => {
  try {
    const deviceId = req.query.device_id || 'unknown';

    const [latestDoc] = await Reading.find({ s: deviceId })
      .sort({ t: -1 }).limit(1).lean();

    if (!latestDoc) return res.json({});

    const v = latestDoc.v || [0, 0, 0];
    const i = latestDoc.i || [0, 0, 0];
    const p = latestDoc.p || [0, 0, 0];
    const n = latestDoc.n || 0;

    const totalPower = p[0] + p[1] + p[2];
    const avgVoltage = (v[0] + v[1] + v[2]) / 3;
    const imbalance = Math.max(Math.abs(i[0] - i[1]), Math.abs(i[1] - i[2]));
    const efficiency = Math.max(0, Math.min(100, 98 - (imbalance * 5)));

    const recentDocs = await Reading.find({ s: deviceId })
      .sort({ t: -1 }).limit(60).lean();

    let sumI1 = 0, sumI2 = 0, sumI3 = 0;
    for (const doc of recentDocs) {
      sumI1 += doc.i?.[0] || 0;
      sumI2 += doc.i?.[1] || 0;
      sumI3 += doc.i?.[2] || 0;
    }
    const nDocs = recentDocs.length || 1;
    const avgCurrent = ((sumI1 / nDocs) + (sumI2 / nDocs) + (sumI3 / nDocs)) / 3;

    res.json({
      totalPower: totalPower.toFixed(1),
      avgVoltage: avgVoltage.toFixed(1),
      avgCurrent: avgCurrent.toFixed(3),
      imbalance: imbalance.toFixed(3),
      efficiency: efficiency.toFixed(1),
      dataPoints: recentDocs.length,
      neutralCurrent: n
    });
  } catch (err) {
    logger.error("Stats error:", err.message);
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

// ---------- ESP Status ----------
app.get("/api/iot/esp-status", authenticateToken, (req, res) => {
  const deviceId = req.query.device_id || 'unknown';
  const lastContact = espHeartbeat[deviceId] || 0;
  const now = Date.now();
  const elapsed = now - lastContact;
  const isConnected = espConnected[deviceId] === true && elapsed < ESP_TIMEOUT_MS;
  const mockOn = mockModeConfig[deviceId]?.enabled || false;

  res.json({
    connected: isConnected || mockOn,
    mockMode: mockOn,
    lastContact: lastContact ? new Date(lastContact).toISOString() : null,
    secondsSinceLastContact: lastContact ? Math.floor(elapsed / 1000) : null,
    device_id: deviceId
  });
});

// ---------- Mock Mode Toggle ----------
app.post("/api/iot/mock-toggle", authenticateToken, authorizeRole('superadmin'), (req, res) => {
  const deviceId = req.body.device_id || 'mock-device-1';
  const enable = req.body.enable === true;
  if (enable) startMockGenerator(deviceId);
  else stopMockGenerator(deviceId);
  res.json({ mockMode: enable, device_id: deviceId });
});

app.get("/api/iot/mock-status", authenticateToken, (req, res) => {
  const deviceId = req.query.device_id || 'mock-device-1';
  res.json({
    mockMode: mockModeConfig[deviceId]?.enabled || false,
    device_id: deviceId
  });
});

// ---------- Energy Reset (superadmin or device-authenticated) ----------
const authenticateTokenOrDevice = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (token) {
    return authenticateToken(req, res, next);
  }
  return authenticateDevice(req, res, next);
};

app.post("/api/iot/reset-energy", authenticateTokenOrDevice, (req, res) => {
  const deviceId = req.body.device_id || 'unknown';

  energyAccum[deviceId] = { e1: 0, e2: 0, e3: 0, lastT: null };

  if (ringBuffers[deviceId]) {
    for (const doc of ringBuffers[deviceId]) {
      if (doc.e) doc.e = [0, 0, 0];
    }
  }

  logger.info(`⚡ Energy counters reset for device ${deviceId}`);
  res.json({ message: "Energy counters reset. Future readings will start from zero.", device_id: deviceId });
});

// ---------- CSV Export (generated from MongoDB) ----------
app.get("/api/iot/export-csv", authenticateToken, authorizeRole('superadmin'), async (req, res) => {
  try {
    const deviceId = req.query.device_id || 'unknown';
    const from = req.query.from || null;
    const to = req.query.to || null;

    const filter = { s: deviceId };
    if (from || to) {
      filter.t = {};
      if (from) filter.t.$gte = new Date(from);
      if (to) filter.t.$lte = new Date(to);
    }

    const headers = [
      "timestamp", "v1(V)", "i1(A)", "p1(W)", "e1(kWh)", "f1(Hz)", "pf1",
      "v2(V)", "i2(A)", "p2(W)", "e2(kWh)", "f2(Hz)", "pf2",
      "v3(V)", "i3(A)", "p3(W)", "e3(kWh)", "f3(Hz)", "pf3", "i_n(A)"
    ];

    const cursor = Reading.find(filter).sort({ t: 1 }).cursor();

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename=device_${deviceId}_data.csv`);
    res.write(headers.join(",") + "\n");

    let count = 0;
    try {
      for await (const doc of cursor) {
        const row = [
          doc.t ? formatIST(doc.t) : '',
          (doc.v?.[0] ?? 0).toFixed(3), (doc.i?.[0] ?? 0).toFixed(3),
          (doc.p?.[0] ?? 0).toFixed(3), (doc.e?.[0] ?? 0).toFixed(3),
          (doc.f?.[0] ?? 0).toFixed(3), (doc.pf?.[0] ?? 0).toFixed(3),
          (doc.v?.[1] ?? 0).toFixed(3), (doc.i?.[1] ?? 0).toFixed(3),
          (doc.p?.[1] ?? 0).toFixed(3), (doc.e?.[1] ?? 0).toFixed(3),
          (doc.f?.[1] ?? 0).toFixed(3), (doc.pf?.[1] ?? 0).toFixed(3),
          (doc.v?.[2] ?? 0).toFixed(3), (doc.i?.[2] ?? 0).toFixed(3),
          (doc.p?.[2] ?? 0).toFixed(3), (doc.e?.[2] ?? 0).toFixed(3),
          (doc.f?.[2] ?? 0).toFixed(3), (doc.pf?.[2] ?? 0).toFixed(3),
          (doc.n ?? 0).toFixed(3)
        ];
        res.write(row.join(",") + "\n");
        count++;
      }
    } finally {
      try { await cursor.close(); } catch {}
    }
    res.end();
    logger.info(`📤 Exported ${count} rows for device ${deviceId}`);
  } catch (err) {
    logger.error("CSV export error:", err.message);
    if (!res.headersSent) res.status(500).json({ error: "Failed to export CSV" });
  }
});

// ---------- Reset Data ----------
app.post("/api/iot/reset-csv", authenticateToken, authorizeRole('superadmin'), async (req, res) => {
  try {
    const deviceId = req.body.device_id || 'unknown';
    await Reading.deleteMany({ s: deviceId });
    ringBuffers[deviceId] = [];
    logger.info(`🗑️ Data cleared for device ${deviceId}`);
    res.json({ message: `All data cleared for device ${deviceId}` });
  } catch (err) {
    logger.error("Reset error:", err.message);
    res.status(500).json({ error: "Failed to reset data" });
  }
});

// ---------- Device phase assignment (ESP32 boot-phase restoration) ----------
app.get("/api/device/phase", authenticateDevice, async (req, res) => {
  try {
    const deviceId = req.query.device_id;
    if (!deviceId) return res.status(400).json({ error: "device_id query parameter required" });

    const swapperName = deviceId.startsWith("SW") ? deviceId : "SW" + deviceId;
    const swapper = await PhaseSwapper.findOne({ name: { $in: [deviceId, swapperName] } }).lean();
    if (!swapper) return sendJson(res, { phase: "NONE", switch_delay: 3000 });

    logger.info(`🔀 Phase lookup: ${deviceId} → ${swapper.currentPhase} delay=${swapper.switchDelay}ms`);
    sendJson(res, { phase: swapper.currentPhase, switch_delay: swapper.switchDelay || 3000 });
  } catch (err) {
    logger.error("Device phase lookup error:", err.message);
    sendJson(res, { phase: "NONE", switch_delay: 3000 });
  }
});

// ================ Remote Command System ================
// ESP32 polls for pending commands
app.get("/api/commands/:deviceId", authenticateDevice, async (req, res) => {
  try {
    const { device_id } = req.query;
    if (!device_id) return res.status(400).json({ error: "device_id query parameter required" });

    const command = await Command.findOneAndUpdate(
      { deviceId: device_id, status: 'pending' },
      { $set: { status: 'delivered', deliveredAt: new Date() } },
      { sort: { createdAt: 1 }, returnDocument: 'after' }
    ).lean();

    if (!command) return sendJson(res, { command: null });

    const response = {
      command: {
        id: command._id,
        type: command.command,
        params: command.params || {}
      }
    };

    if (command.command === 'ota') {
      const params = command.params || {};
      const version = params.version || null;
      const channel = params.channel || 'stable';
      let fw;
      if (version) {
        fw = await Firmware.findOne({ version }).lean();
      } else {
        fw = await Firmware.findOne({ channel, isLatest: true }).lean();
      }
      if (fw) {
        const downloadToken = jwt.sign(
          { deviceId: device_id, fwVersion: fw.version, purpose: 'firmware_download' },
          JWT_SECRET,
          { expiresIn: '1h' }
        );
        response.command.params.firmware_url = `https://${req.get('host')}/api/iot/firmware/download/${fw.version}?token=${downloadToken}`;
        response.command.params.version = fw.version;
        response.command.params.size = fw.size;
        response.command.params.md5 = fw.md5 || '';
        response.command.params.sha256 = fw.sha256;
      }
    }

    sendJson(res, response);
  } catch (err) {
    logger.error("Command poll error:", err.message);
    sendJson(res, { error: "Failed to fetch commands" }, 500);
  }
});

// ESP32 reports command execution result
app.post("/api/commands/:id/result", authenticateDevice, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, result } = req.body;

    if (!['executed', 'failed'].includes(status)) {
      return res.status(400).json({ error: "Status must be 'executed' or 'failed'" });
    }

    const command = await Command.findByIdAndUpdate(id, {
      $set: {
        status,
        result: result || '',
        executedAt: new Date()
      }
    });

    if (!command) return res.status(404).json({ error: "Command not found" });

    logger.info(`📋 Command ${command.command} for ${command.deviceId} → ${status}: ${result || 'ok'}`);
    res.json({ received: true });
  } catch (err) {
    logger.error("Command result error:", err.message);
    res.status(500).json({ error: "Failed to record command result" });
  }
});

// Dashboard: push command to device
app.post("/api/iot/devices/:deviceId/command", authenticateToken, authorizeRole('admin', 'superadmin'), async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { command, params } = req.body;

    const validCommands = ['restart', 'ota', 'reset_energy', 'clear_logs', 'sync_time', 'swap_phase', 'clear_fault', 'set_switch_delay'];
    if (!validCommands.includes(command)) {
      return res.status(400).json({ error: `Invalid command. Valid: ${validCommands.join(', ')}` });
    }

    const device = await Device.findOne({ deviceId });
    if (!device) return res.status(404).json({ error: "Device not found" });

    const cmd = await Command.create({
      deviceId,
      command,
      params: params || {}
    });

    logger.info(`📋 Command pushed: ${command} → ${deviceId}`);
    res.status(201).json({ message: `Command '${command}' pushed to ${deviceId}`, command: cmd });
  } catch (err) {
    logger.error("Push command error:", err.message);
    res.status(500).json({ error: "Failed to push command" });
  }
});

// ================ Device Management APIs ================
app.get("/api/iot/devices", authenticateToken, async (req, res) => {
  try {
    const devices = await Device.find().sort({ lastSeen: -1 }).lean();

    // Mark devices offline if not seen in 60s & compute counts
    const now = Date.now();
    let onlineCount = 0;
    let offlineCount = 0;
    for (const d of devices) {
      if (d.lastSeen && (now - new Date(d.lastSeen).getTime()) <= 60000) {
        d.status = 'online';
        onlineCount++;
      } else {
        d.status = 'offline';
        offlineCount++;
      }
    }

    res.json({ devices, onlineCount, offlineCount });
  } catch (err) {
    logger.error("Device list error:", err.message);
    res.status(500).json({ error: "Failed to fetch devices" });
  }
});

app.get("/api/iot/devices/online", authenticateToken, async (req, res) => {
  try {
    const devices = await Device.find({ status: 'online' }).sort({ lastSeen: -1 }).limit(100).lean();
    const now = Date.now();
    const online = devices.filter(d => d.lastSeen && (now - new Date(d.lastSeen).getTime()) <= 60000);
    res.json({ count: online.length, devices: online });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch online devices" });
  }
});

app.get("/api/iot/devices/offline", authenticateToken, async (req, res) => {
  try {
    const all = await Device.find().sort({ lastSeen: -1 }).lean();
    const now = Date.now();
    const offline = all.filter(d => !d.lastSeen || (now - new Date(d.lastSeen).getTime()) > 60000);
    res.json({ count: offline.length, devices: offline });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch offline devices" });
  }
});

app.get("/api/iot/devices/:deviceId", authenticateToken, async (req, res) => {
  try {
    const device = await Device.findOne({ deviceId: req.params.deviceId }).lean();
    if (!device) return res.status(404).json({ error: "Device not found" });
    const now = Date.now();
    if (device.lastSeen && (now - new Date(device.lastSeen).getTime()) > 60000) {
      device.status = 'offline';
    }
    res.json({ device });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch device" });
  }
});

// ================ Phase Swapper Management ================
app.get("/api/iot/phase-swappers", authenticateToken, async (req, res) => {
  try {
    const swappers = await PhaseSwapper.find().sort({ createdAt: -1 }).lean();
    res.json({ swappers });
  } catch (err) {
    logger.error("Phase swapper list error:", err.message);
    res.status(500).json({ error: "Failed to fetch phase swappers" });
  }
});

app.post("/api/iot/phase-swappers", authenticateToken, authorizeRole('admin', 'superadmin'), async (req, res) => {
  try {
    const { name, phase, loadType } = req.body;
    if (!name) return res.status(400).json({ error: "Name is required" });

    const existing = await PhaseSwapper.findOne({ name });
    if (existing) return res.status(409).json({ error: "A phase swapper with this name already exists" });

    const swapper = await PhaseSwapper.create({
      name,
      currentPhase: phase || 'R',
      loadType: loadType || 'Residential'
    });

    logger.info(`🔀 Phase swapper "${name}" registered on ${phase || 'R'}-phase`);
    res.status(201).json({ swapper });
  } catch (err) {
    logger.error("Phase swapper create error:", err.message);
    res.status(500).json({ error: "Failed to register phase swapper" });
  }
});

app.put("/api/iot/phase-swappers/:id/swap", authenticateToken, authorizeRole('admin', 'superadmin'), async (req, res) => {
  try {
    const { phase } = req.body;
    if (!phase || !['R', 'Y', 'B', 'NONE'].includes(phase)) {
      return res.status(400).json({ error: "Valid phase (R, Y, B, or NONE) is required" });
    }

    const swapper = await PhaseSwapper.findById(req.params.id);
    if (!swapper) return res.status(404).json({ error: "Phase swapper not found" });

    const previousPhase = swapper.currentPhase;
    swapper.currentPhase = phase;
    swapper.lastSwappedAt = new Date();
    await swapper.save();

    // Also push a swap_phase command to the device if it exists
    try {
      const hwId = swapper.name.startsWith("SW") ? swapper.name.slice(2) : swapper.name;
      const device = await Device.findOne({ deviceId: { $in: [swapper.name, hwId] } });
      if (device) {
        await Command.create({
          deviceId: hwId,
          command: 'swap_phase',
          params: { phase }
        });
        logger.info(`📋 Swap command pushed to device ${hwId}: → ${phase}`);
      } else {
        logger.warn(`🔀 No device found for swapper "${swapper.name}" — DB updated, but no command sent to hardware`);
      }
    } catch (cmdErr) {
      logger.warn(`🔀 Failed to push command to device: ${cmdErr.message}`);
    }

    logger.info(`🔀 Phase swapper "${swapper.name}" swapped: ${previousPhase} → ${phase}`);
    res.json({ swapper, message: `Swapped ${swapper.name} from ${previousPhase}-phase to ${phase}-phase` });
  } catch (err) {
    logger.error("Phase swapper swap error:", err.message);
    res.status(500).json({ error: "Failed to swap phase" });
  }
});

// ---------- Set Phase Swapper Switch Delay ----------
app.put("/api/iot/phase-swappers/:id/switch-delay", authenticateToken, authorizeRole('admin', 'superadmin'), async (req, res) => {
  try {
    const { delay_ms } = req.body;
    if (!delay_ms || typeof delay_ms !== 'number' || delay_ms < 500 || delay_ms > 30000) {
      return res.status(400).json({ error: "delay_ms must be a number between 500 and 30000" });
    }

    const swapper = await PhaseSwapper.findById(req.params.id);
    if (!swapper) return res.status(404).json({ error: "Phase swapper not found" });

    swapper.switchDelay = delay_ms;
    await swapper.save();

    // Push set_switch_delay command to the hardware device
    try {
      const hwId = swapper.name.startsWith("SW") ? swapper.name.slice(2) : swapper.name;
      const device = await Device.findOne({ deviceId: { $in: [swapper.name, hwId] } });
      if (device) {
        await Command.create({
          deviceId: hwId,
          command: 'set_switch_delay',
          params: { delay_ms }
        });
        logger.info(`⏱️ Switch-delay command pushed to device ${hwId}: ${delay_ms}ms`);
      } else {
        logger.warn(`⏱️ No device found for swapper "${swapper.name}" — DB updated, but no command sent to hardware`);
      }
    } catch (cmdErr) {
      logger.warn(`⏱️ Failed to push switch-delay command: ${cmdErr.message}`);
    }

    logger.info(`⏱️ Switch delay updated for "${swapper.name}": ${delay_ms}ms`);
    res.json({ swapper, message: `Switch delay set to ${delay_ms}ms for ${swapper.name}` });
  } catch (err) {
    logger.error("Switch delay update error:", err.message);
    res.status(500).json({ error: "Failed to update switch delay" });
  }
});

// ---------- Clear Phase Swapper Fault ----------
app.post("/api/iot/phase-swappers/:id/clear-fault", authenticateToken, authorizeRole('admin', 'superadmin'), async (req, res) => {
  try {
    const swapper = await PhaseSwapper.findById(req.params.id);
    if (!swapper) return res.status(404).json({ error: "Phase swapper not found" });

    // Push clear_fault command to the hardware device — DO NOT optimistically clear.
    // The device will re-check feedback and report via telemetry.
    const hwId = swapper.name.startsWith("SW") ? swapper.name.slice(2) : swapper.name;
    const device = await Device.findOne({ deviceId: { $in: [swapper.name, hwId] } });
    if (device) {
      await Command.create({
        deviceId: hwId,
        command: 'clear_fault',
        params: {}
      });
      logger.info(`🧹 Clear-fault command pushed to device ${hwId}`);
    } else {
      logger.warn(`🧹 No device found for swapper "${swapper.name}" — command not sent`);
    }

    logger.info(`🧹 Clear-fault requested for "${swapper.name}" — waiting for hardware verification`);
    res.json({ swapper, message: `Clear-fault command sent to ${swapper.name} — hardware will verify` });
  } catch (err) {
    logger.error("Clear fault error:", err.message);
    res.status(500).json({ error: "Failed to clear fault" });
  }
});

app.put("/api/iot/phase-swappers/:id", authenticateToken, authorizeRole('admin', 'superadmin'), async (req, res) => {
  try {
    const updates = {};
    const allowed = ['name', 'currentPhase', 'loadType', 'status'];
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    const swapper = await PhaseSwapper.findByIdAndUpdate(req.params.id, updates, { new: true });
    if (!swapper) return res.status(404).json({ error: "Phase swapper not found" });
    res.json({ swapper });
  } catch (err) {
    logger.error("Phase swapper update error:", err.message);
    res.status(500).json({ error: "Failed to update phase swapper" });
  }
});

app.delete("/api/iot/phase-swappers/:id", authenticateToken, authorizeRole('admin', 'superadmin'), async (req, res) => {
  try {
    const swapper = await PhaseSwapper.findByIdAndDelete(req.params.id);
    if (!swapper) return res.status(404).json({ error: "Phase swapper not found" });
    logger.info(`🗑️ Phase swapper "${swapper.name}" deleted`);
    res.json({ message: `Phase swapper "${swapper.name}" deleted` });
  } catch (err) {
    logger.error("Phase swapper delete error:", err.message);
    res.status(500).json({ error: "Failed to delete phase swapper" });
  }
});

// ================ Firmware Management ================
function semverGt(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const va = pa[i] || 0, vb = pb[i] || 0;
    if (va > vb) return true;
    if (va < vb) return false;
  }
  return false;
}

// ESP32 reports OTA update status
app.post("/api/iot/firmware/status", async (req, res) => {
  try {
    const { device_id, current_version, status, detail } = req.body;
    if (!device_id || !status) {
      return res.status(400).json({ error: "device_id and status required" });
    }

    await OTAEvent.create({
      deviceId: device_id,
      fromVersion: current_version || 'unknown',
      toVersion: status === 'success' ? (detail || '') : '',
      status,
      detail: typeof detail === 'string' ? detail : JSON.stringify(detail)
    });

    logger.info(`📲 OTA report: ${device_id} → ${status}${detail ? ' (' + detail + ')' : ''}`);
    res.json({ received: true });
  } catch (err) {
    logger.error("Firmware status error:", err.message);
    res.status(500).json({ error: "Failed to record status" });
  }
});

// ESP32 checks for available firmware update
app.post("/api/iot/firmware/check", async (req, res) => {
  try {
    const { device_id, current_version } = req.body;
    if (!device_id) return sendJson(res, { update_available: false, error: "device_id required" }, 400);

    const channel = req.body.channel || 'stable';
    const fw = await Firmware.findOne({ channel, isLatest: true }).lean();

    if (fw && semverGt(fw.version, current_version)) {
      const downloadToken = jwt.sign(
        { deviceId: device_id, fwVersion: fw.version, purpose: 'firmware_download' },
        JWT_SECRET,
        { expiresIn: '1h' }
      );
      const downloadUrl = `https://${req.get('host')}/api/iot/firmware/download/${fw.version}?token=${downloadToken}`;

      logger.info(`📲 OTA check: ${device_id} v${current_version} → v${fw.version} available`);
      return sendJson(res, {
        update_available: true,
        firmware_url: downloadUrl,
        version: fw.version,
        size: fw.size,
        md5: fw.md5 || '',
        sha256: fw.sha256
      });
    }

    sendJson(res, { update_available: false });
  } catch (err) {
    logger.error("Firmware check error:", err.message);
    sendJson(res, { update_available: false }, 500);
  }
});

// Download firmware binary (authenticated via token in query)
app.get("/api/iot/firmware/download/:version", async (req, res) => {
  try {
    const token = req.query.token;
    if (!token) {
      return res.status(401).json({ error: "Download token required" });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch {
      return res.status(403).json({ error: "Invalid or expired download token" });
    }

    if (decoded.purpose !== 'firmware_download') {
      return res.status(403).json({ error: "Invalid token purpose" });
    }

    const fw = await Firmware.findOne({ version: req.params.version }).lean();
    if (!fw) {
      return res.status(404).json({ error: "Firmware version not found" });
    }

    logger.info(`📲 OTA download: ${decoded.deviceId} requesting v${req.params.version} (${(fw.size / 1024).toFixed(1)} KB)`);
    const start = parseInt(req.query.start) || 0;
    const end = parseInt(req.query.end) || fw.size;
    const buf = Buffer.isBuffer(fw.binary) ? fw.binary : Buffer.from(fw.binary.buffer || fw.binary);
    const chunk = buf.slice(Math.max(0, start), Math.min(end, fw.size));

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${fw.filename}"`);
    res.setHeader('Content-Length', chunk.length);
    res.setHeader('Content-Range', `bytes ${start}-${start + chunk.length - 1}/${fw.size}`);
    res.setHeader('X-Total-Size', fw.size);
    if (chunk.length === fw.size) res.setHeader('X-SHA256', fw.sha256);
    res.status(chunk.length < fw.size ? 206 : 200).send(chunk);
  } catch (err) {
    logger.error("Firmware download error:", err.message);
    res.status(500).json({ error: "Failed to download firmware" });
  }
});

// Upload new firmware (admin+ only)
app.post("/api/iot/firmware/upload", authenticateToken, authorizeRole('admin', 'superadmin'), async (req, res) => {
  try {
    const { version, channel, binary_base64, changelog, minDeviceVersion } = req.body;

    if (!version || !binary_base64) {
      return res.status(400).json({ error: "version and binary_base64 required" });
    }

    // Validate version format (semver-like)
    if (!/^\d+\.\d+\.\d+/.test(version)) {
      return res.status(400).json({ error: "Version must follow semver (e.g., 2.0.1)" });
    }

    // Check duplicate
    const existing = await Firmware.findOne({ version });
    if (existing) {
      return res.status(409).json({ error: `Firmware version ${version} already exists` });
    }

    const binary = Buffer.from(binary_base64, 'base64');
    if (binary.length === 0) {
      return res.status(400).json({ error: "Invalid binary data" });
    }

    if (binary.length > 4 * 1024 * 1024) { // 4MB max
      return res.status(400).json({ error: "Firmware binary exceeds 4MB limit" });
    }

    // Compute SHA256 and MD5
    const sha256 = crypto.createHash('sha256').update(binary).digest('hex');
    const md5 = crypto.createHash('md5').update(binary).digest('hex');

    // Unmark previous latest in this channel
    await Firmware.updateMany(
      { channel: channel || 'stable' },
      { $set: { isLatest: false } }
    );

    const fw = await Firmware.create({
      version,
      channel: channel || 'stable',
      filename: `firmware_${version}.bin`,
      size: binary.length,
      sha256,
      md5,
      binary,
      changelog: changelog || '',
      isLatest: true,
      minDeviceVersion: minDeviceVersion || '0.0.0',
      createdBy: req.user.username
    });

    logger.info(`📦 Firmware uploaded: v${version} (${channel || 'stable'}) — ${(binary.length / 1024).toFixed(1)} KB`);
    res.status(201).json({
      message: `Firmware v${version} uploaded successfully`,
      version: fw.version,
      size: fw.size,
      sha256: fw.sha256,
      md5: fw.md5
    });
} catch (err) {
    logger.error("Firmware upload error:", err.message);
  }
});

// List firmware versions
app.get("/api/iot/firmware/versions", authenticateToken, async (req, res) => {
  try {
    const channel = req.query.channel || null;
    const filter = channel ? { channel } : {};
    const firmwares = await Firmware.find(filter, {
      version: 1, channel: 1, filename: 1, size: 1, sha256: 1, md5: 1,
      isLatest: 1, changelog: 1, minDeviceVersion: 1, createdAt: 1, createdBy: 1
    }).sort({ createdAt: -1 }).lean();

    res.json({ firmwares });
  } catch (err) {
    logger.error("Firmware list error:", err.message);
    res.status(500).json({ error: "Failed to list firmware" });
  }
});

// Get OTA event history
app.get("/api/iot/firmware/ota-events", authenticateToken, authorizeRole('admin', 'superadmin'), async (req, res) => {
  try {
    const deviceId = req.query.deviceId || null;
    const limit = parseInt(req.query.limit) || 50;
    const filter = deviceId ? { deviceId } : {};
    const events = await OTAEvent.find(filter)
      .sort({ timestamp: -1 }).limit(limit).lean();
    res.json({ events });
  } catch (err) {
    logger.error("OTA events error:", err.message);
    res.status(500).json({ error: "Failed to fetch OTA events" });
  }
});

// Delete firmware version (admin+ only)
app.delete("/api/iot/firmware/:version", authenticateToken, authorizeRole('admin', 'superadmin'), async (req, res) => {
  try {
    const fw = await Firmware.findOneAndDelete({ version: req.params.version });
    if (!fw) return res.status(404).json({ error: "Firmware version not found" });
    logger.info(`🗑️ Firmware v${req.params.version} deleted`);
    res.json({ message: `Firmware v${req.params.version} deleted` });
  } catch (err) {
    logger.error("Firmware delete error:", err.message);
    res.status(500).json({ error: "Failed to delete firmware" });
  }
});

app.listen(PORT, () => {
  logger.info(`Server running on http://localhost:${PORT}`);
});

// ================ HTTP Relay (for GSM modules without SSL) ================
// Starts an HTTP-only relay server when RELAY_PORT is set.
// The GSM module sends data here over plain HTTP; this server forwards
// it to the main HTTPS API. Run on a host that doesn't force HTTPS.
if (process.env.RELAY_PORT) {
  const RELAY_PORT = parseInt(process.env.RELAY_PORT) || 8080;
  const RELAY_API_KEY = process.env.RELAY_API_KEY || DEVICE_API_KEY;
  const TARGET_API = process.env.TARGET_API || 'https://chetrika-rayz.onrender.com';

  import('http').then(({ createServer }) => {
    import('https').then((https) => {
      const relayApp = express();
      relayApp.use(express.json());

      function forwardRequest(method, req, res) {
        const apiKey = req.headers['x-api-key'];
        if (!apiKey || apiKey !== RELAY_API_KEY) {
          return res.status(401).json({ error: 'Invalid API key' });
        }

        const targetPath = req.path === '/api/iot/data' ? '/api/data' : req.path;
        const targetUrl = new URL(TARGET_API);

        const options = {
          hostname: targetUrl.hostname,
          port: 443,
          path: targetPath + (req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : ''),
          method,
          headers: {
            'x-api-key': RELAY_API_KEY
          }
        };

        let bodyData = null;
        if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
          bodyData = JSON.stringify(req.body);
          options.headers['Content-Type'] = 'application/json';
          options.headers['Content-Length'] = Buffer.byteLength(bodyData);
        }

        const proxyReq = https.request(options, (proxyRes) => {
          let body = '';
          proxyRes.on('data', chunk => body += chunk);
          proxyRes.on('end', () => {
            try {
              res.status(proxyRes.statusCode).json(JSON.parse(body));
            } catch {
              res.status(proxyRes.statusCode).send(body);
            }
          });
        });

        proxyReq.on('error', (err) => {
          logger.error('[RELAY] Forward error:', err.message);
          res.status(502).json({ error: 'Relay upstream error' });
        });

        if (bodyData) proxyReq.write(bodyData);
        proxyReq.end();
      }

      relayApp.post('*', (req, res) => forwardRequest('POST', req, res));
      relayApp.get('*', (req, res) => forwardRequest('GET', req, res));
      relayApp.put('*', (req, res) => forwardRequest('PUT', req, res));

      const relayServer = createServer(relayApp);
      relayServer.listen(RELAY_PORT, () => {
        logger.info(`🔄 HTTP Relay listening on port ${RELAY_PORT} → ${TARGET_API}`);
      });
    });
  });
}
