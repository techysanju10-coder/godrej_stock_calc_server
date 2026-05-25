import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import { connectDB, saveStockEntry, getLatestEntryForLocation, getStockEntriesForDate, getAllStockEntries } from './db.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'godrej_secret_fallback';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

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

// Middleware: Route Guard for Submission Locking
// Prevents writing a new record for a locationCode if a submission already exists
// and the current time is before 8:00 PM (20:00) of the following day.
const submissionLockGuard = async (req, res, next) => {
  const { locationCode } = req.body;
  if (!locationCode) {
    return res.status(400).json({ error: 'Bad Request', message: 'Location Code is required.' });
  }

  try {
    const latestEntry = await getLatestEntryForLocation(locationCode);
    if (!latestEntry) {
      // No previous entry, safe to proceed
      return next();
    }

    const createdAt = new Date(latestEntry.createdAt);

    // Unlock date threshold: 8:00 PM (20:00:00) of the following day
    const unlockDate = new Date(createdAt);
    unlockDate.setDate(unlockDate.getDate() + 1); // Add 1 day
    unlockDate.setHours(20, 0, 0, 0); // Set to 20:00:00.000 local/server time

    const now = new Date();
    if (now < unlockDate) {
      // Block entry and return 403
      const options = { 
        timeZone: 'Asia/Kolkata', 
        year: 'numeric', month: 'numeric', day: 'numeric', 
        hour: 'numeric', minute: 'numeric', 
        hour12: true 
      };
      const formattedUnlock = unlockDate.toLocaleString('en-IN', options);
      
      return res.status(403).json({
        error: 'Location Locked',
        message: `Submission blocked. A previous entry for this location code already exists. Submissions are locked until ${formattedUnlock} (8:00 PM of the following day).`
      });
    }

    next();
  } catch (error) {
    console.error('Error in submission lock guard:', error);
    res.status(500).json({ error: 'Internal Server Error', message: 'Could not process locking validation.' });
  }
};

// ----------------------------------------------------
// Public APIs
// ----------------------------------------------------

// Submit stock entry
app.post('/api/entries', submissionLockGuard, async (req, res) => {
  const {
    date,
    displayDate,
    locationCode,
    locationName,
    openingStock,
    stockAddedBySupervisor,
    closingStock
  } = req.body;

  // Simple input validation
  if (!date || !displayDate || !locationCode || !locationName || openingStock === undefined || closingStock === undefined) {
    return res.status(400).json({ error: 'Validation Error', message: 'Missing required fields.' });
  }

  const openStockInt = parseInt(openingStock, 10);
  const supervisorStockInt = parseInt(stockAddedBySupervisor || 0, 10);
  const closeStockInt = parseInt(closingStock, 10);

  if (isNaN(openStockInt) || openStockInt <= 0) {
    return res.status(400).json({ error: 'Validation Error', message: 'Opening Stock must be an integer greater than 0.' });
  }
  if (isNaN(supervisorStockInt) || supervisorStockInt < 0) {
    return res.status(400).json({ error: 'Validation Error', message: 'Stock Added by Supervisor must be a non-negative integer.' });
  }

  const finalOpeningStock = openStockInt + supervisorStockInt;

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
      locationCode,
      locationName,
      openingStock: openStockInt,
      stockAddedBySupervisor: supervisorStockInt,
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

// cron job
setInterval(async () => {
  await fetch(`https://godrej-stock-calc-server.onrender.com/api/health`, { method: "GET" });
}, 14 * 60 * 1000);
