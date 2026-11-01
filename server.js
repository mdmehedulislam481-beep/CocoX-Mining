import express from "express";
import pool from "./db.js";
import { verifyTelegramInitData } from "./telegram.js";

const app = express();

app.use(express.json({ limit: "20kb" }));

// Health check
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    app: "CocoX Mining",
    status: "running"
  });
});

// App configuration
app.get("/api/config", (req, res) => {
  res.json({
    appName: "CocoX Mining",
    miningDailyReward: 50,
    dailyBonus: 10,
    referralReward: 100,
    conversion: 500,
    minimumWithdrawal: 500
  });
});

// Telegram authentication
app.post("/api/profile", async (req, res) => {
  try {
    const initData = req.headers["x-telegram-init-data"];
    const user = verifyTelegramInitData(initData);

    if (!user || !user.id) {
      return res.status(401).json({
        success: false,
        message: "Telegram verification failed"
      });
    }

    const result = await pool.query(
      `INSERT INTO users
       (telegram_id, username, first_name)
       VALUES ($1, $2, $3)
       ON CONFLICT (telegram_id)
       DO UPDATE SET
         username = EXCLUDED.username,
         first_name = EXCLUDED.first_name
       RETURNING telegram_id, username, first_name, balance`,
      [
        String(user.id),
        user.username || null,
        user.first_name || null
      ]
    );

    res.json({
      success: true,
      user: result.rows[0]
    });

  } catch (error) {
    console.error("Profile error:", error.message);

    res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
});

// API not found
app.use("/api", (req, res) => {
  res.status(404).json({
    success: false,
    message: "API endpoint not found"
  });
});

// Start server
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`CocoX Mining running on port ${PORT}`);
});
