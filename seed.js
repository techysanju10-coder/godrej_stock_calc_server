import dotenv from 'dotenv';
import { connectDB, saveStockEntry } from './db.js';

dotenv.config();

const LOCATIONS = {
  "384192": "M H FILLING CENTRE",
  "740265": "M/S BALAJI SERVICE STATION",
  "195834": "ADHOC ARUN SERVICE STATION",
  "821649": "MSHSD AUTO CARE CENTRE NEWTOWN",
  "459310": "ADHOC SAROGI SERVICE STATION",
  "612783": "SHANKAR SERVICE STATION",
  "284951": "RAJRANI SERVICE STATION",
  "905138": "AUTO CARE CENTRE",
  "538216": "TOLLYGUNGE SERVICE STN",
  "164079": "COUNCIL SERVICE STATION",
  "873142": "NIBRA SERVICE STATION",
  "320954": "BHAWANIPUR AUTO CENTRE",
  "695128": "THAKURPUKUR AUTO CENTRE",
  "248371": "INDIA TRADING CO",
  "719463": "INDIA TRADING OIL COMPANY",
  "503619": "UNITED SERVICE STATION",
  "926481": "VIJAY SERVICE STATION",
  "137592": "R M SERVICE STATION",
  "684037": "GANERIWALA SUPER SERVICE"
};

// Seeded random number generator for deterministic data
function seededRand(seed) {
  let s = seed;
  return function () {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

function randInt(rand, min, max) {
  return Math.floor(rand() * (max - min + 1)) + min;
}

// Build list of all dates from 24/04/2026 to 24/05/2026 inclusive
function buildDateRange(startYMD, endYMD) {
  const dates = [];
  const [sy, sm, sd] = startYMD.split('-').map(Number);
  const [ey, em, ed] = endYMD.split('-').map(Number);
  const start = new Date(sy, sm - 1, sd);
  const end = new Date(ey, em - 1, ed);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    dates.push({
      ymd: `${year}-${month}-${day}`,
      dmy: `${day}/${month}/${year}`
    });
  }
  return dates;
}

async function seed() {
  console.log('🌱 Connecting to database...');
  await connectDB(process.env.MONGODB_URI);

  const dates = buildDateRange('2026-04-24', '2026-09-24');
  const locationCodes = Object.keys(LOCATIONS);

  let totalInserted = 0;

  for (const { ymd, dmy } of dates) {
    for (const locationCode of locationCodes) {
      const locationName = LOCATIONS[locationCode];

      // Use a deterministic seed based on date + code so results are consistent
      const seedNum = parseInt(ymd.replace(/-/g, '')) + parseInt(locationCode);
      const rand = seededRand(seedNum);

      const openingStock = randInt(rand, 50, 250);
      // ~30% chance supervisor adds stock
      const stockAddedBySupervisor = rand() < 0.3 ? randInt(rand, 5, 30) : 0;
      const finalOpeningStock = openingStock + stockAddedBySupervisor;

      // Units sold: between 5 and 60% of final opening stock (at least 1)
      const maxSold = Math.max(1, Math.floor(finalOpeningStock * 0.6));
      const stocksSaled = randInt(rand, 1, maxSold);
      const closingStock = finalOpeningStock - stocksSaled;
      const salesAmount = stocksSaled * 90;

      // Set createdAt to noon (12:00) IST of that date
      // IST = UTC+5:30, so noon IST = 06:30 UTC
      const createdAt = new Date(`${ymd}T06:30:00.000Z`);

      try {
        await saveStockEntry({
          date: ymd,
          displayDate: dmy,
          locationCode,
          locationName,
          openingStock,
          stockAddedBySupervisor,
          finalOpeningStock,
          closingStock,
          stocksSaled,
          salesAmount,
          createdAt
        });
        totalInserted++;
      } catch (err) {
        console.error(`  ❌ Failed: ${dmy} | ${locationCode} - ${err.message}`);
      }
    }
    console.log(`  ✅ Seeded ${locationCodes.length} entries for ${dmy}`);
  }

  console.log(`\n🎉 Seeding complete! ${totalInserted} entries inserted across ${dates.length} days.`);
  process.exit(0);
}

seed().catch(err => {
  console.error('Fatal seed error:', err);
  process.exit(1);
});
