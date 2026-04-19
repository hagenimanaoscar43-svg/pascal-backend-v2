import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import pg from "pg";
const { Pool } = pg;
const app = express();

// ========== CORS CONFIGURATION ==========
console.log('🚀 Starting backend with CORS for production...');

// Allow specific origins
const allowedOrigins = [
  'http://localhost:5173',
  'https://pascal-app.onrender.com'
];

console.log('Allowed origins:', allowedOrigins);

// CORS middleware
app.use((req, res, next) => {
  const origin = req.headers.origin;
  console.log('Request from origin:', origin);
  
  if (allowedOrigins.includes(origin)) {
    res.setHeader(' Oscar Access-Control-Allow-Origin', origin);
    console.log('✅ CORS allowed for:', origin);
  } else if (origin && origin.includes('pascal-app.onrender.com')) {
    // Fallback for any subdomain
    res.setHeader('Access-Control-Allow-Origin', origin);
    console.log('✅ CORS allowed for (wildcard):', origin);
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json());

// ========== DATABASE ==========
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

pool.query("SELECT 1")
  .then(() => console.log("✅ Database connected"))
  .catch(err => console.error("❌ Database error:", err.message));

// ========== INIT DB ==========
const initDB = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS history (
        id SERIAL PRIMARY KEY,
        type VARCHAR(50),
        input TEXT,
        output TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("✅ Database initialized");
  } catch (err) {
    console.error("❌ DB init error:", err.message);
  }
};
initDB();

// ========== ROUTES ==========
app.get("/", (req, res) => {
  res.send("Pascal Backend Running 🚀");
});

app.get("/api/history", async (req, res) => {
  try {
    const data = await pool.query("SELECT * FROM history ORDER BY id DESC");
    res.json(data.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/history/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const data = await pool.query("SELECT * FROM history WHERE id = $1", [id]);
    res.json(data.rows[0] || null);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/history", async (req, res) => {
  try {
    const { type, input, result } = req.body;
    const data = await pool.query(
      `INSERT INTO history (type, input, output) VALUES ($1, $2, $3) RETURNING *`,
      [type, input, JSON.stringify(result)]
    );
    res.json(data.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/history", async (req, res) => {
  try {
    await pool.query("DELETE FROM history");
    res.json({ message: "History cleared" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/pascal", (req, res) => {
  try {
    const num = parseInt(req.body.n);
    if (isNaN(num) || num < 0) {
      return res.status(400).json({ error: "Invalid n value" });
    }
    let rows = [];
    for (let i = 0; i <= num; i++) {
      let row = [];
      for (let j = 0; j <= i; j++) {
        if (j === 0 || j === i) {
          row.push(1);
        } else {
          row.push(rows[i - 1][j - 1] + rows[i - 1][j]);
        }
      }
      rows.push(row);
    }
    res.json({ rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/expand", (req, res) => {
  try {
    const expression = req.body.expression;
    const match = expression.match(/\((.+)\)\^(\d+)/);
    if (!match) {
      return res.status(400).json({ error: "Invalid format. Use (ax^n + by^m)^p" });
    }
    const inside = match[1];
    const power = parseInt(match[2]);
    const parts = inside.split("+").map(s => s.trim());
    if (parts.length !== 2) {
      return res.status(400).json({ error: "Only binomial expressions supported: (A + B)^n" });
    }
    const parseTerm = (term) => {
      const m = term.match(/([0-9]*)?([a-zA-Z])(\^(\d+))?/);
      return {
        coeff: parseInt(m?.[1] || "1"),
        variable: m?.[2],
        power: parseInt(m?.[4] || "1")
      };
    };
    const A = parseTerm(parts[0]);
    const B = parseTerm(parts[1]);
    const factorial = (n) => (n <= 1 ? 1 : n * factorial(n - 1));
    const comb = (n, r) => factorial(n) / (factorial(r) * factorial(n - r));
    let terms = [];
    for (let k = 0; k <= power; k++) {
      const coeff = comb(power, k) * Math.pow(A.coeff, power - k) * Math.pow(B.coeff, k);
      terms.push({
        coeff,
        varA: A.variable,
        powA: A.power * (power - k),
        varB: B.variable,
        powB: B.power * k,
        index: k
      });
    }
    res.json({ expression, power, terms });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
