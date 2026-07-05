import mongoose from 'mongoose';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FALLBACK_FILE_PATH = path.join(__dirname, 'db_fallback.json');

// Mongoose Schemas
const StockEntrySchema = new mongoose.Schema({
  date: { type: String, required: true }, // YYYY-MM-DD
  displayDate: { type: String, required: true }, // DD/MM/YYYY
  locationName: { type: String, required: true },
  promoterName: { type: String, default: '' },
  openingStock: { type: Number, required: true },
  stockAddedBySupervisor: { type: Number, default: 0 },
  stockRemovedBySupervisor: { type: Number, default: 0 },
  finalOpeningStock: { type: Number, required: true },
  closingStock: { type: Number, required: true },
  stocksSaled: { type: Number, required: true },
  salesAmount: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now }
});

const StockEntry = mongoose.model('StockEntry', StockEntrySchema);

let isFallbackMode = false;

// Helper for Fallback JSON Database
async function readFallbackFile() {
  try {
    const data = await fs.readFile(FALLBACK_FILE_PATH, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      const initialData = { entries: [] };
      await fs.writeFile(FALLBACK_FILE_PATH, JSON.stringify(initialData, null, 2), 'utf-8');
      return initialData;
    }
    throw error;
  }
}

async function writeFallbackFile(data) {
  await fs.writeFile(FALLBACK_FILE_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

export async function connectDB(mongoUri) {
  if (!mongoUri) {
    console.warn('⚠️ No MONGODB_URI provided. Falling back to local JSON database.');
    isFallbackMode = true;
    return;
  }

  try {
    // Set a short connection timeout so we fall back quickly if DB is not running
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 3000
    });
    console.log('✅ Connected to MongoDB successfully.');
  } catch (error) {
    console.error('❌ MongoDB Connection failed:', error.message);
    console.warn('⚠️ Falling back to local JSON database (db_fallback.json).');
    isFallbackMode = true;
  }
}

// data may optionally include a 'createdAt' field (used by the seed script)
export async function saveStockEntry(data) {
  const { createdAt, ...rest } = data;
  if (isFallbackMode) {
    const db = await readFallbackFile();
    const newEntry = {
      _id: Math.random().toString(36).substring(2, 9),
      ...rest,
      createdAt: createdAt ? new Date(createdAt).toISOString() : new Date().toISOString()
    };
    db.entries.push(newEntry);
    await writeFallbackFile(db);
    return newEntry;
  } else {
    const newEntry = new StockEntry({ ...rest, createdAt: createdAt ? new Date(createdAt) : new Date() });
    return await newEntry.save();
  }
}

export async function getStockEntriesForDate(date) {
  if (isFallbackMode) {
    const db = await readFallbackFile();
    return db.entries
      .filter(e => e.date === date)
      .sort((a, b) => a.locationName.localeCompare(b.locationName));
  } else {
    return await StockEntry.find({ date })
      .sort({ locationName: 1 })
      .exec();
  }
}

// Returns ALL entries sorted by date ASC then locationName ASC (for extensive report)
export async function getAllStockEntries() {
  if (isFallbackMode) {
    const db = await readFallbackFile();
    return [...db.entries].sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return (a.locationName || '').localeCompare(b.locationName || '');
    });
  } else {
    return await StockEntry.find({})
      .sort({ date: 1, locationName: 1 })
      .exec();
  }
}
