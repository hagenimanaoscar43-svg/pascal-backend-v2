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

// Check if DATABASE_URL exists
if (!process.env.DATABASE_URL) {
  console.error("❌ WARNING: DATABASE_URL environment variable is missing");
  console.log("📝 App will run with in-memory storage only");
}

const pool = process.env.DATABASE_URL ? new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes("localhost") 
    ? false 
    : { rejectUnauthorized: false },
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
}) : null;

// Database state
let useDatabase = !!pool;
let inMemoryHistory = [];
let dbInitAttempted = false;

/* =========================
   📦 DATABASE INITIALIZATION
========================= */
async function initDatabase() {
  if (!pool) {
    console.log("📝 No database configured, using in-memory storage");
    return false;
  }

  if (dbInitAttempted) return useDatabase;
  dbInitAttempted = true;

  try {
    // Test connection
    const client = await pool.connect();
    await client.query('SELECT 1');
    console.log("✅ Database connected successfully");
    
    // Create table if not exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS history (
        id SERIAL PRIMARY KEY,
        type VARCHAR(50),
        input TEXT,
        result JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Create index for better performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_history_created_at 
      ON history(created_at DESC)
    `);
    
    client.release();
    console.log("✅ History table ready");
    useDatabase = true;
    return true;
    
  } catch (err) {
    console.error("❌ Database initialization failed:", err.message);
    console.log("📝 Falling back to in-memory storage");
    useDatabase = false;
    return false;
  }
}

/* =========================
   💾 HISTORY STORAGE WRAPPER
========================= */
async function saveToHistory(type, input, result) {
  if (useDatabase && pool) {
    try {
      await pool.query(
        "INSERT INTO history (type, input, result) VALUES ($1, $2, $3)",
        [type, input, JSON.stringify(result)]
      );
      console.log(`✅ Saved to database: ${type}`);
      return true;
    } catch (dbError) {
      console.error("❌ Database save failed:", dbError.message);
      useDatabase = false;
      // Fall through to memory
    }
  }
  
  // In-memory fallback
  const historyEntry = {
    id: inMemoryHistory.length + 1,
    type,
    input,
    result,
    created_at: new Date().toISOString()
  };
  
  inMemoryHistory.unshift(historyEntry);
  
  // Keep only last 100 items
  if (inMemoryHistory.length > 100) {
    inMemoryHistory = inMemoryHistory.slice(0, 100);
  }
  
  console.log(`💾 Saved to memory: ${type}`);
  return true;
}

async function getHistory(limit = 50) {
  if (useDatabase && pool) {
    try {
      const result = await pool.query(
        "SELECT * FROM history ORDER BY created_at DESC LIMIT $1",
        [limit]
      );
      return { success: true, storage: "database", data: result.rows };
    } catch (dbError) {
      console.error("❌ Database read failed:", dbError.message);
      useDatabase = false;
      // Fall through to memory
    }
  }
  
  // In-memory fallback
  return { 
    success: true, 
    storage: "memory", 
    data: inMemoryHistory.slice(0, limit) 
  };
}

// Initialize database on startup (don't block)
initDatabase();

/* =========================
   🔢 PASCAL TRIANGLE
========================= */
function generatePascalTriangle(n) {
  const rows = [];
  const numRows = parseInt(n);

  for (let i = 0; i <= numRows; i++) {
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
  // Support format: (ax^n + by^m)^p or (ax + by)^p
  const regex = /^\(([+-]?\d*)([a-z])(?:\^(\d+))?([+-])(\d*)([a-z])(?:\^(\d+))?\)\^(\d+)$/i;

  const match = expression.match(regex);

  if (!match) {
    throw new Error("Invalid format. Expected: (ax^n + by^m)^p");
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

function expandBinomial(expression) {
  const { coeffA, varA, powA, coeffB, varB, powB, p } =
    parseExpression(expression);

  const terms = [];

  for (let k = 0; k <= p; k++) {
    const binom = binomialCoefficient(p, k);
    const coeff = binom * Math.pow(coeffA, p - k) * Math.pow(coeffB, k);

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
      const absCoeff = Math.abs(t.coeff);

      // Handle sign
      if (i === 0) {
        part += t.coeff < 0 ? "-" : "";
      } else {
        part += t.coeff < 0 ? " - " : " + ";
      }

      // Add coefficient (skip 1 if there's a variable)
      if (!(absCoeff === 1 && (t.powA > 0 || t.powB > 0))) {
        part += absCoeff;
      }

      // Add first variable
      if (t.powA > 0) {
        part += t.varA;
        if (t.powA > 1) part += `^${t.powA}`;
      }

      // Add second variable
      if (t.powB > 0) {
        part += t.varB;
        if (t.powB > 1) part += `^${t.powB}`;
      }

      // Handle case when both powers are 0 (constant term)
      if (t.powA === 0 && t.powB === 0 && absCoeff === 1) {
        part += "1";
      }

      return part;
    })
    .join("");
}

/* =========================
   🚀 ROUTES
========================= */

// Root endpoint
app.get("/", (req, res) => {
  res.json({
    message: "Pascal Triangle & Binomial Expansion API 🚀",
    version: "2.0.0",
    storage: useDatabase ? "database" : "memory",
    endpoints: {
      pascal: "POST /api/pascal - Body: { n: number }",
      expand: "POST /api/expand - Body: { expression: string }",
      history: "GET /api/history",
      diagnostic: "GET /api/diagnostic",
      health: "GET /api/health"
    },
    examples: {
      pascal: { n: 5 },
      expand: { expression: "(2x+3y)^4" }
    }
  });
});

// Health check
app.get("/api/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    storage: useDatabase ? "database" : "memory",
    uptime: process.uptime()
  });
});

// Diagnostic endpoint
app.get("/api/diagnostic", async (req, res) => {
  const diagnostic = {
    environment: {
      node_version: process.version,
      platform: process.platform,
      node_env: process.env.NODE_ENV || "development",
      port: process.env.PORT || 10000,
      has_database_url: !!process.env.DATABASE_URL,
      database_url_source: process.env.DATABASE_URL ? "configured" : "missing"
    },
    storage: {
      type: useDatabase ? "postgresql" : "in-memory",
      initialized: dbInitAttempted
    },
    database: {
      connected: false,
      table_exists: false,
      error: null
    },
    memory_storage: {
      entries_count: inMemoryHistory.length,
      max_entries: 100
    }
  };
  
  // Test database if configured
  if (pool && useDatabase) {
    try {
      const client = await pool.connect();
      diagnostic.database.connected = true;
      
      // Check if table exists
      const tableCheck = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = 'history'
        )
      `);
      diagnostic.database.table_exists = tableCheck.rows[0].exists;
      
      // Get count if table exists
      if (diagnostic.database.table_exists) {
        const countResult = await client.query('SELECT COUNT(*) FROM history');
        diagnostic.database.record_count = parseInt(countResult.rows[0].count);
      }
      
      client.release();
    } catch (err) {
      diagnostic.database.error = err.message;
      diagnostic.database.connected = false;
    }
  }
  
  res.json(diagnostic);
});

// Pascal Triangle endpoint
app.post("/api/pascal", async (req, res) => {
  try {
    const { n } = req.body;
    
    if (n === undefined || n === null) {
      return res.status(400).json({ error: "Missing parameter: n" });
    }
    
    const numN = parseInt(n);
    if (isNaN(numN) || numN < 0) {
      return res.status(400).json({ error: "n must be a non-negative integer" });
    }
    
    const rows = generatePascalTriangle(numN);
    const result = { 
      n: numN, 
      rows,
      timestamp: new Date().toISOString()
    };
    
    // Save to history
    await saveToHistory("pascal", `n=${numN}`, result);
    
    res.json(result);
  } catch (err) {
    console.error("Pascal error:", err);
    res.status(400).json({ error: err.message });
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
      expression, 
      expanded, 
      terms,
      timestamp: new Date().toISOString()
    };
    
    // Save to history
    await saveToHistory("expand", expression, result);
    
    res.json(result);
  } catch (err) {
    console.error("Expand error:", err);
    res.status(400).json({ error: err.message });
  }
});

// History endpoint
app.get("/api/history", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const { success, storage, data } = await getHistory(limit);
    
    res.json({
      success,
      storage,
      count: data.length,
      data,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error("History error:", err);
    res.status(500).json({ 
      error: "Failed to fetch history",
      details: err.message 
    });
  }
});

// Clear history (for memory storage)
app.delete("/api/history", async (req, res) => {
  try {
    if (useDatabase && pool) {
      await pool.query("DELETE FROM history");
      res.json({ success: true, message: "Database history cleared" });
    } else {
      inMemoryHistory = [];
      res.json({ success: true, message: "Memory history cleared" });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 404 handler for undefined routes
app.use((req, res) => {
  res.status(404).json({ 
    error: "Endpoint not found",
    available_endpoints: [
      "GET /",
      "GET /api/health",
      "GET /api/diagnostic",
      "POST /api/pascal",
      "POST /api/expand",
      "GET /api/history",
      "DELETE /api/history"
    ]
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("Server error:", err);
  res.status(500).json({ 
    error: "Internal server error",
    message: err.message 
  });
});

/* =========================
   🚀 SERVER STARTUP
========================= */
const PORT = process.env.PORT || 10000;

const server = app.listen(PORT, () => {
  console.log(`
║     PASCAL TRIANGLE & BINOMIAL API v2.0          ║

║  🚀 Server running on port: ${PORT}                   
║  💾 Storage mode: ${useDatabase ? "PostgreSQL" : "In-Memory"}         
║  📍 Environment: ${process.env.NODE_ENV || "development"}           
  `);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received, closing server...");
  server.close(async () => {
    if (pool) {
      await pool.end();
      console.log("Database pool closed");
    }
    process.exit(0);
  });
});

export default app;
