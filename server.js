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
      // allow requests with no origin (like Postman)
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
        answer TEXT
      );
    `);
    console.log("✅ Database initialized");
  } catch (err) {
    console.error("❌ DB INIT ERROR:", err);
  }
};

initDB();

/* =========================
   🚀 ROUTES
========================= */

// test route
app.get("/", (req, res) => {
  res.send("Backend working 🚀");
});

// get all questions
app.get("/questions", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM questions ORDER BY id DESC");
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// add question
app.post("/questions", async (req, res) => {
  const { question, answer } = req.body;

  try {
    const result = await pool.query(
      "INSERT INTO questions (question, answer) VALUES ($1, $2) RETURNING *",
      [question, answer]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Insert failed" });
  }
});

/* =========================
   🌐 SERVER START
========================= */
const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});