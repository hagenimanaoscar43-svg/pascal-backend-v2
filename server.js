import express from "express";
import cors from "cors";
import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());

/* =========================
   🔧 CORS CONFIGURATION
========================= */
console.log("🔧 Loading CORS configuration...");

const allowedOrigins = [
  "http://localhost:5173",
  "https://pascal-app.onrender.com"
];

console.log("✅ Allowed origins:", allowedOrigins);

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.log("❌ Blocked by CORS:", origin);
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  })
);

/* =========================
   🔗 DATABASE CONNECTION
========================= */
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

pool.connect()
  .then(() => console.log("✅ Database connected"))
  .catch((err) => console.error("❌ DB connection error:", err));

/* =========================
   📦 INIT DATABASE TABLE
========================= */
const initDB = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS questions (
        id SERIAL PRIMARY KEY,
        question TEXT,
        answer TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("✅ Database initialized");
  } catch (err) {
    console.error("❌ DB INIT ERROR:", err);
  }
};

initDB();

/* =========================
   🔢 PASCAL TRIANGLE FUNCTION
========================= */
function generatePascalTriangle(n) {
  if (n < 0) throw new Error("n must be non-negative");
  if (n > 100000) throw new Error("n must be <= 100,000");
  
  const rows = [];
  
  for (let i = 0; i <= n; i++) {
    const row = [];
    let value = 1;
    
    for (let j = 0; j <= i; j++) {
      row.push(value);
      value = value * (i - j) / (j + 1);
    }
    
    rows.push(row);
  }
  
  return rows;
}

/* =========================
   📐 BINOMIAL EXPANSION FUNCTION
========================= */
function parseExpression(expression) {
  // Pattern: (ax^n + by^m)^p or (ax^n - by^m)^p
  const pattern = /^\(([+-]?\d*)([a-z])(?:\^(\d+))?([+-])(\d*)([a-z])(?:\^(\d+))?\)\^(\d+)$/i;
  const match = expression.match(pattern);
  
  if (!match) {
    throw new Error("Invalid format. Use: (ax^n + by^m)^p or (ax^n - by^m)^p");
  }
  
  const [, coeffAStr, varA, expAStr, operator, coeffBStr, varB, expBStr, powerStr] = match;
  
  let coeffA = coeffAStr === '' || coeffAStr === '+' ? 1 : 
               coeffAStr === '-' ? -1 : parseInt(coeffAStr);
  let coeffB = coeffBStr === '' || coeffBStr === '+' ? 1 : 
               coeffBStr === '-' ? -1 : parseInt(coeffBStr);
  
  if (operator === '-') coeffB = -coeffB;
  
  const powA = expAStr ? parseInt(expAStr) : 1;
  const powB = expBStr ? parseInt(expBStr) : 1;
  const p = parseInt(powerStr);
  
  if (p < 0 || p > 1000) {
    throw new Error("Power p must be between 0 and 1000");
  }
  
  return { coeffA, varA, powA, coeffB, varB, powB, p };
}

function binomialCoefficient(n, k) {
  if (k < 0 || k > n) return 0;
  let result = 1;
  k = Math.min(k, n - k);
  for (let i = 1; i <= k; i++) {
    result = result * (n - k + i) / i;
  }
  return Math.round(result);
}

function expandBinomial(expression) {
  const { coeffA, varA, powA, coeffB, varB, powB, p } = parseExpression(expression);
  
  if (p === 0) return [{ coeff: 1, powA: 0, powB: 0, varA, varB }];
  
  const terms = [];
  
  for (let k = 0; k <= p; k++) {
    const binom = binomialCoefficient(p, k);
    const coeff = binom * Math.pow(coeffA, p - k) * Math.pow(coeffB, k);
    
    if (coeff === 0) continue;
    
    const expA = powA * (p - k);
    const expB = powB * k;
    
    terms.push({
      coeff: coeff,
      powA: expA,
      powB: expB,
      varA: varA,
      varB: varB
    });
  }
  
  return terms;
}

function formatExpansion(terms) {
  if (terms.length === 0) return "0";
  
  return terms.map((term, index) => {
    let part = "";
    const absCoeff = Math.abs(term.coeff);
    
    if (index === 0) {
      part += term.coeff < 0 ? "-" : "";
    } else {
      part += term.coeff > 0 ? " + " : " - ";
    }
    
    const showCoeff = !(absCoeff === 1 && (term.powA > 0 || term.powB > 0));
    
    if (showCoeff && absCoeff !== 1) {
      part += absCoeff;
    } else if (absCoeff === 1 && term.powA === 0 && term.powB === 0) {
      part += "1";
    }
    
    if (term.powA > 0) {
      part += term.varA;
      if (term.powA > 1) part += `^${term.powA}`;
    }
    
    if (term.powB > 0) {
      part += term.varB;
      if (term.powB > 1) part += `^${term.powB}`;
    }
    
    return part;
  }).join("");
}

/* =========================
   🚀 API ROUTES
========================= */

app.get("/", (req, res) => {
  res.json({ 
    message: "Pascal Triangle & Binomial Expansion API 🚀",
    endpoints: {
      pascal: "POST /api/pascal - Generate Pascal Triangle up to row n",
      expand: "POST /api/expand - Expand binomial expression (ax^n + by^m)^p",
      history: "GET /api/history - Get calculation history"
    }
  });
});

// Pascal Triangle endpoint
app.post("/api/pascal", async (req, res) => {
  try {
    const { n } = req.body;
    
    if (n === undefined || n === null) {
      return res.status(400).json({ error: "Missing parameter: n" });
    }
    
    const nInt = parseInt(n);
    
    if (isNaN(nInt)) {
      return res.status(400).json({ error: "n must be a valid number" });
    }
    
    if (nInt < 0 || nInt > 100000) {
      return res.status(400).json({ error: "n must be between 0 and 100,000" });
    }
    
    const rows = generatePascalTriangle(nInt);
    
    res.json({
      n: nInt,
      rows: rows,
      totalRows: rows.length
    });
    
    // Store in history
    await pool.query(
      "INSERT INTO questions (question, answer) VALUES ($1, $2)",
      [`Pascal Triangle n=${nInt}`, JSON.stringify({ n: nInt, totalRows: rows.length })]
    );
    
  } catch (error) {
    console.error("Pascal API Error:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// Binomial Expansion endpoint
app.post("/api/expand", async (req, res) => {
  try {
    const { expression } = req.body;
    
    if (!expression) {
      return res.status(400).json({ error: "Missing parameter: expression" });
    }
    
    const terms = expandBinomial(expression);
    const expanded = formatExpansion(terms);
    
    const result = {
      expression: expression,
      expanded: expanded,
      terms: terms,
      power: terms.length > 0 ? terms[0].powA + terms[0].powB : 0
    };
    
    res.json(result);
    
    // Store in history
    await pool.query(
      "INSERT INTO questions (question, answer) VALUES ($1, $2)",
      [`Expand: ${expression}`, JSON.stringify(result)]
    );
    
  } catch (error) {
    console.error("Expansion API Error:", error);
    res.status(400).json({ error: error.message || "Invalid expression format" });
  }
});

// Get history
app.get("/api/history", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM questions ORDER BY id DESC LIMIT 50"
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// Get specific history item
app.get("/api/history/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      "SELECT * FROM questions WHERE id = $1",
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "History item not found" });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// Delete history
app.delete("/api/history", async (req, res) => {
  try {
    await pool.query("DELETE FROM questions");
    res.json({ message: "History cleared successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

/* =========================
   🌐 SERVER START
========================= */
const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
