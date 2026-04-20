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
const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:3000",
  "https://pascal-app.onrender.com",
  "https://pascal-backend-v2.onrender.com"
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      console.log("❌ Blocked by CORS:", origin);
      return callback(new Error("Not allowed by CORS"));
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
  ssl: process.env.DATABASE_URL
    ? { rejectUnauthorized: false }
    : false,
});

pool.connect()
  .then(() => console.log("✅ Database connected"))
  .catch((err) => console.error("❌ DB error:", err.message));

/* =========================
   📦 INIT TABLE
========================= */
async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS history (
        id SERIAL PRIMARY KEY,
        type VARCHAR(50),
        input TEXT,
        result JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("✅ History table initialized");
  } catch (err) {
    console.error("❌ DB init error:", err.message);
  }
}
initDB();

/* =========================
   🔢 PASCAL TRIANGLE
========================= */
function generatePascalTriangle(n) {
  const rows = [];

  for (let i = 0; i <= n; i++) {
    const row = [];
    let value = 1n;

    for (let j = 0; j <= i; j++) {
      row.push(value.toString());
      value = (value * BigInt(i - j)) / BigInt(j + 1);
    }

    rows.push(row);
  }

  return rows;
}

/* =========================
   📐 BINOMIAL EXPANSION
========================= */
function parseExpression(expression) {
  const regex =
    /^\(([+-]?\d*)([a-z])(?:\^(\d+))?([+-])(\d*)([a-z])(?:\^(\d+))?\)\^(\d+)$/i;

  const match = expression.match(regex);

  if (!match) {
    throw new Error("Invalid format: (ax^n + by^m)^p");
  }

  const [, aC, aV, aE, op, bC, bV, bE, p] = match;

  let coeffA = aC === "" || aC === "+" ? 1 : aC === "-" ? -1 : parseInt(aC);
  let coeffB = bC === "" || bC === "+" ? 1 : bC === "-" ? -1 : parseInt(bC);

  if (op === "-") coeffB = -coeffB;

  return {
    coeffA,
    varA: aV,
    powA: aE ? parseInt(aE) : 1,
    coeffB,
    varB: bV,
    powB: bE ? parseInt(bE) : 1,
    p: parseInt(p),
  };
}

function binomialCoefficient(n, k) {
  let res = 1;
  k = Math.min(k, n - k);

  for (let i = 1; i <= k; i++) {
    res = (res * (n - k + i)) / i;
  }

  return Math.round(res);
}

function expandBinomial(expr) {
  const { coeffA, varA, powA, coeffB, varB, powB, p } =
    parseExpression(expr);

  const terms = [];

  for (let k = 0; k <= p; k++) {
    const binom = binomialCoefficient(p, k);

    const coeff =
      binom *
      Math.pow(coeffA, p - k) *
      Math.pow(coeffB, k);

    const term = {
      coeff,
      powA: powA * (p - k),
      powB: powB * k,
      varA,
      varB,
    };

    terms.push(term);
  }

  return terms;
}

function formatExpansion(terms) {
  return terms
    .map((t, i) => {
      let part = "";

      const abs = Math.abs(t.coeff);

      if (i === 0) {
        part += t.coeff < 0 ? "-" : "";
      } else {
        part += t.coeff < 0 ? " - " : " + ";
      }

      if (!(abs === 1 && (t.powA || t.powB))) {
        part += abs;
      }

      if (t.powA > 0) {
        part += t.varA;
        if (t.powA > 1) part += `^${t.powA}`;
      }

      if (t.powB > 0) {
        part += t.varB;
        if (t.powB > 1) part += `^${t.powB}`;
      }

      return part;
    })
    .join("");
}

/* =========================
   🚀 ROUTES
========================= */

app.get("/", (req, res) => {
  res.json({
    message: "Pascal Triangle & Binomial Expansion API 🚀",
    endpoints: {
      pascal: "POST /api/pascal",
      expand: "POST /api/expand",
      history: "GET /api/history",
    },
  });
});

/* ---------- PASCAL ---------- */
app.post("/api/pascal", async (req, res) => {
  try {
    const { n } = req.body;

    const rows = generatePascalTriangle(parseInt(n));

    const result = { n, rows };

    await pool.query(
      "INSERT INTO history (type, input, result) VALUES ($1,$2,$3)",
      ["pascal", `n=${n}`, JSON.stringify(result)]
    );

    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/* ---------- EXPAND ---------- */
app.post("/api/expand", async (req, res) => {
  try {
    const { expression } = req.body;

    const terms = expandBinomial(expression);
    const expanded = formatExpansion(terms);

    const result = { expression, expanded, terms };

    await pool.query(
      "INSERT INTO history (type, input, result) VALUES ($1,$2,$3)",
      ["expand", expression, JSON.stringify(result)]
    );

    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/* ---------- HISTORY ---------- */
app.get("/api/history", async (req, res) => {
  const data = await pool.query(
    "SELECT * FROM history ORDER BY created_at DESC LIMIT 50"
  );
  res.json(data.rows);
});

/* ---------- SERVER ---------- */
const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
