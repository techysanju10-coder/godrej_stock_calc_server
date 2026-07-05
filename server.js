import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import { connectDB, saveStockEntry, getStockEntriesForDate, getAllStockEntries } from './db.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'godrej_secret_fallback';

app.use(cors({
  origin: "https://godrej-stock-calc.vercel.app",
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Connect to database (either MongoDB or JSON Fallback)
connectDB(process.env.MONGODB_URI);

// JWT Verification Middleware for Admin Routes
const authenticateAdmin = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized', message: 'No authentication token provided.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.admin = decoded;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Forbidden', message: 'Invalid or expired authentication token.' });
  }
};

// ----------------------------------------------------
// Public APIs
// ----------------------------------------------------

// Submit stock entry
app.post('/api/entries', async (req, res) => {
  const {
    date,
    displayDate,
    locationName,
    promoterName,
    openingStock,
    stockAddedBySupervisor,
    stockRemovedBySupervisor,
    closingStock
  } = req.body;

  // Required field validation
  if (!date || !displayDate || !locationName || !promoterName || openingStock === undefined || closingStock === undefined) {
    return res.status(400).json({ error: 'Validation Error', message: 'Missing required fields.' });
  }

  const openStockInt    = parseInt(openingStock, 10);
  const addedStockInt   = parseInt(stockAddedBySupervisor || 0, 10);
  const removedStockInt = parseInt(stockRemovedBySupervisor || 0, 10);
  const closeStockInt   = parseInt(closingStock, 10);

  if (isNaN(openStockInt) || openStockInt < 0) {
    return res.status(400).json({ error: 'Validation Error', message: 'Opening Stock must be a non-negative integer.' });
  }
  if (isNaN(addedStockInt) || addedStockInt < 0) {
    return res.status(400).json({ error: 'Validation Error', message: 'Stock Added by Supervisor must be a non-negative integer.' });
  }
  if (isNaN(removedStockInt) || removedStockInt < 0) {
    return res.status(400).json({ error: 'Validation Error', message: 'Stock Removed by Supervisor must be a non-negative integer.' });
  }

  const finalOpeningStock = openStockInt + addedStockInt - removedStockInt;

  if (finalOpeningStock < 0) {
    return res.status(400).json({ error: 'Validation Error', message: 'Stock Removed cannot exceed Opening Stock plus Stock Added.' });
  }

  if (isNaN(closeStockInt) || closeStockInt < 0 || closeStockInt > finalOpeningStock) {
    return res.status(400).json({
      error: 'Validation Error',
      message: `Closing stock must be a non-negative integer less than or equal to Final Opening Stock (${finalOpeningStock}).`
    });
  }

  const stocksSaled = finalOpeningStock - closeStockInt;
  const salesAmount = stocksSaled * 90;

  try {
    const savedEntry = await saveStockEntry({
      date,
      displayDate,
      locationName,
      promoterName,
      openingStock: openStockInt,
      stockAddedBySupervisor: addedStockInt,
      stockRemovedBySupervisor: removedStockInt,
      finalOpeningStock,
      closingStock: closeStockInt,
      stocksSaled,
      salesAmount
    });

    res.status(201).json({
      message: 'Entry submitted successfully.',
      data: savedEntry
    });
  } catch (error) {
    console.error('Error saving entry:', error);
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to save stock entry to database.' });
  }
});

// ----------------------------------------------------
// Admin APIs
// ----------------------------------------------------

// Admin Login
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Bad Request', message: 'Username and Password are required.' });
  }

  if (username === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD) {
    const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '2h' });
    return res.json({
      success: true,
      message: 'Authentication successful.',
      token
    });
  }

  return res.status(401).json({ error: 'Unauthorized', message: 'Invalid username or password.' });
});

// Get entries for selected date
app.get('/api/admin/entries', authenticateAdmin, async (req, res) => {
  const { date } = req.query; // Expects "YYYY-MM-DD"
  if (!date) {
    return res.status(400).json({ error: 'Bad Request', message: 'Date parameter is required.' });
  }

  try {
    const entries = await getStockEntriesForDate(date);
    res.json({
      success: true,
      date,
      entries
    });
  } catch (error) {
    console.error('Error fetching admin entries:', error);
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to retrieve stock entries.' });
  }
});

// Get ALL entries across all dates (for extensive Excel report)
app.get('/api/admin/entries/all', authenticateAdmin, async (req, res) => {
  try {
    const entries = await getAllStockEntries();
    res.json({ success: true, entries });
  } catch (error) {
    console.error('Error fetching all entries:', error);
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to retrieve all stock entries.' });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', time: new Date() });
});

// Start Server
app.listen(PORT, () => {
  console.log(`🚀 Godrej Stock Server running on port ${PORT}`);
});

// Self-ping to prevent Render server from sleeping
setInterval(async () => {
  try {
    await fetch(`https://godrej-stock-calc-server.onrender.com/api/health`, { method: "GET" });
  } catch (e) {
    console.log("Keep-alive ping failed target instance.");
  }
}, 14 * 60 * 1000);