
import express from "express";
import pool from "./db.js";
import { verifyTelegramInitData } from "./telegram.js";

const app = express();

app.use(express.json({ limit: "20kb" }));

const CONFIG = {
  APP_NAME: "CocoX Mining",
  CHANNEL_USERNAME: process.env.CHANNEL_USERNAME || "@CocoXMiningChannel",
  MINING_DAILY_REWARD: 50,
  MINING_DURATION_MS: 24 * 60 * 60 * 1000,
  DAILY_BONUS: 10,
  REFERRAL_REWARD: 100,
  CONVERSION_RATE: 500,
  MINIMUM_WITHDRAWAL: 500,
  NETWORK: "BEP20",
  MONETAG_ZONE_ID: "12165220",
  MONETAG_REWARD: 10,
  LINK_TASK_DURATION_SECONDS: 15,
  LINK_TASK_URL: "https://asiafilm.org/4/b2bb499d8d084e87ca1c63825be193ea"
};

const WALLET_REGEX = /^0x[a-fA-F0-9]{40}$/;

const LINK_TASKS = Array.from({ length: 10 }, (_, i) => ({
  id: `link_${i + 1}`,
  title: `Website Task ${i + 1}`,
  network: "Website",
  url: CONFIG.LINK_TASK_URL,
  durationSeconds: CONFIG.LINK_TASK_DURATION_SECONDS,
  reward: 0,
  rewardEnabled: false,
  active: true
}));

const MONETAG_TASKS = Array.from({ length: 10 }, (_, i) => ({
  id: `monetag_${i + 1}`,
  title: `Watch Monetag Ad ${i + 1}`,
  network: "Monetag",
  zoneId: CONFIG.MONETAG_ZONE_ID,
  reward: CONFIG.MONETAG_REWARD,
  rewardEnabled: false,
  active: true
}));

function sendError(res, status, message) {
  return res.status(status).json({ success: false, message });
}

function getTelegramUser(req) {
  return verifyTelegramInitData(req.headers["x-telegram-init-data"]);
}

async function auth(req, res, next) {
  try {
    const user = getTelegramUser(req);

    if (!user || !user.id) {
      return sendError(res, 401, "Telegram verification failed");
    }

    req.telegramUser = user;
    next();
  } catch (error) {
    console.error("Authentication error:", error.message);
    return sendError(res, 401, "Authentication failed");
  }
}

function isAdmin(telegramId) {
  const ids = (process.env.ADMIN_TELEGRAM_IDS || "")
    .split(",")
    .map(id => id.trim())
    .filter(Boolean);

  return ids.includes(String(telegramId));
}

function requireAdmin(req, res, next) {
  if (!isAdmin(req.telegramUser.id)) {
    return sendError(res, 403, "Admin access denied");
  }

  next();
}

async function checkChannelMembership(telegramId) {
  const token = process.env.BOT_TOKEN;

  if (!token) {
    throw new Error("BOT_TOKEN is missing");
  }

  const response = await fetch(
    `https://api.telegram.org/bot${token}/getChatMember`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: CONFIG.CHANNEL_USERNAME,
        user_id: Number(telegramId)
      })
    }
  );

  const data = await response.json();

  if (!data.ok) {
    throw new Error(data.description || "Telegram membership check failed");
  }

  const member = data.result;

  return (
    member.status === "creator" ||
    member.status === "administrator" ||
    member.status === "member" ||
    (member.status === "restricted" && member.is_member === true)
  );
}

async function getUser(telegramId, client = pool) {
  const result = await client.query(
    `SELECT telegram_id, username, first_name, balance,
            mining_started_at, last_claim_at, channel_joined
     FROM users
     WHERE telegram_id = $1`,
    [String(telegramId)]
  );

  return result.rows[0] || null;
}

async function saveTransaction(client, telegramId, type, amount, description) {
  await client.query(
    `INSERT INTO transactions
      (telegram_id, type, amount, description)
     VALUES ($1, $2, $3, $4)`,
    [String(telegramId), type, amount, description]
  );
}

async function rewardPendingReferral(client, referredTelegramId) {
  const result = await client.query(
    `SELECT id, referrer_telegram_id
     FROM referrals
     WHERE referred_telegram_id = $1
       AND status = 'pending'
       AND reward_paid = FALSE
     FOR UPDATE`,
    [String(referredTelegramId)]
  );

  if (!result.rows.length) return false;

  const referral = result.rows[0];

  const updated = await client.query(
    `UPDATE users
     SET balance = balance + $1
     WHERE telegram_id = $2`,
    [CONFIG.REFERRAL_REWARD, String(referral.referrer_telegram_id)]
  );

  if (!updated.rowCount) return false;

  await saveTransaction(
    client,
    referral.referrer_telegram_id,
    "referral",
    CONFIG.REFERRAL_REWARD,
    "Referral reward"
  );

  await client.query(
    `UPDATE referrals
     SET status = 'approved', reward_paid = TRUE
     WHERE id = $1`,
    [referral.id]
  );

  return true;
}

/* HEALTH & CONFIG */

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    app: CONFIG.APP_NAME,
    status: "running"
  });
});

app.get("/api/config", (req, res) => {
  res.json({
    appName: CONFIG.APP_NAME,
    miningDailyReward: CONFIG.MINING_DAILY_REWARD,
    miningDurationHours: 24,
    dailyBonus: CONFIG.DAILY_BONUS,
    referralReward: CONFIG.REFERRAL_REWARD,
    conversion: CONFIG.CONVERSION_RATE,
    minimumWithdrawal: CONFIG.MINIMUM_WITHDRAWAL,
    network: CONFIG.NETWORK,
    channel: CONFIG.CHANNEL_USERNAME
  });
});

/* PROFILE & REGISTRATION */

app.post("/api/profile", auth, async (req, res) => {
  const client = await pool.connect();
  let transactionStarted = false;

  try {
    const user = req.telegramUser;
    const telegramId = String(user.id);

    await client.query("BEGIN");
    transactionStarted = true;

    await client.query(
      `INSERT INTO users
        (telegram_id, username, first_name, mining_started_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (telegram_id)
       DO UPDATE SET
         username = EXCLUDED.username,
         first_name = EXCLUDED.first_name,
         mining_started_at = COALESCE(users.mining_started_at, NOW())`,
      [
        telegramId,
        user.username || null,
        user.first_name || null
      ]
    );

    const startParam = String(req.body?.startParam || "");
    const match = startParam.match(/^ref_(\d+)$/);

    if (match && match[1] !== telegramId) {
      const referrerId = match[1];

      const referrer = await client.query(
        "SELECT telegram_id FROM users WHERE telegram_id = $1",
        [referrerId]
      );

      if (referrer.rows.length) {
        await client.query(
          `INSERT INTO referrals
            (referrer_telegram_id, referred_telegram_id)
           VALUES ($1, $2)
           ON CONFLICT (referred_telegram_id) DO NOTHING`,
          [referrerId, telegramId]
        );
      }
    }

    await client.query("COMMIT");
    transactionStarted = false;

    const profile = await getUser(telegramId);

    res.json({ success: true, user: profile });
  } catch (error) {
    if (transactionStarted) await client.query("ROLLBACK");
    console.error("Profile error:", error.message);
    sendError(res, 500, "Could not load profile");
  } finally {
    client.release();
  }
});

/* CHANNEL JOIN VERIFICATION */

app.post("/api/channel/verify", auth, async (req, res) => {
  const client = await pool.connect();
  let transactionStarted = false;

  try {
    const telegramId = String(req.telegramUser.id);
    const joined = await checkChannelMembership(telegramId);

    if (!joined) {
      return sendError(res, 403, "Please join our Telegram channel first");
    }

    await client.query("BEGIN");
    transactionStarted = true;

    await client.query(
      `UPDATE users SET channel_joined = TRUE
       WHERE telegram_id = $1`,
      [telegramId]
    );

    const referralRewarded = await rewardPendingReferral(client, telegramId);

    await client.query("COMMIT");
    transactionStarted = false;

    res.json({ success: true, joined: true, referralRewarded });
  } catch (error) {
    if (transactionStarted) await client.query("ROLLBACK");
    console.error("Channel verification error:", error.message);
    sendError(res, 500, "Could not verify channel membership");
  } finally {
    client.release();
  }
});

/* MINING STATUS */

app.get("/api/mining/status", auth, async (req, res) => {
  try {
    const user = await getUser(req.telegramUser.id);

    if (!user) return sendError(res, 404, "User not found");
    if (!user.channel_joined) {
      return sendError(res, 403, "Join the channel before mining");
    }

    const startedAt = user.mining_started_at
      ? new Date(user.mining_started_at).getTime()
      : Date.now();

    const elapsed = Math.max(0, Math.min(
      Date.now() - startedAt,
      CONFIG.MINING_DURATION_MS
    ));

    const amount = Number(
      (elapsed / CONFIG.MINING_DURATION_MS *
        CONFIG.MINING_DAILY_REWARD).toFixed(8)
    );

    res.json({
      success: true,
      miningAmount: amount,
      elapsedMilliseconds: elapsed,
      remainingMilliseconds: Math.max(
        0,
        CONFIG.MINING_DURATION_MS - elapsed
      ),
      dailyReward: CONFIG.MINING_DAILY_REWARD
    });
  } catch (error) {
    console.error("Mining status error:", error.message);
    sendError(res, 500, "Could not load mining status");
  }
});

/* MINING CLAIM */

app.post("/api/mining/claim", auth, async (req, res) => {
  const client = await pool.connect();
  let transactionStarted = false;

  try {
    const telegramId = String(req.telegramUser.id);

    await client.query("BEGIN");
    transactionStarted = true;

    const result = await client.query(
      `SELECT balance, mining_started_at, channel_joined
       FROM users WHERE telegram_id = $1 FOR UPDATE`,
      [telegramId]
    );

    if (!result.rows.length) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return sendError(res, 404, "User not found");
    }

    const user = result.rows[0];

    if (!user.channel_joined) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return sendError(res, 403, "Join the channel before mining");
    }

    if (!user.mining_started_at) {
      await client.query(
        `UPDATE users SET mining_started_at = NOW()
         WHERE telegram_id = $1`,
        [telegramId]
      );

      await client.query("COMMIT");
      transactionStarted = false;

      return res.json({
        success: true,
        claimed: 0,
        message: "Mining started. Claim your reward later."
      });
    }

    const startedAt = new Date(user.mining_started_at).getTime();
    const elapsed = Math.max(0, Math.min(
      Date.now() - startedAt,
      CONFIG.MINING_DURATION_MS
    ));

    const reward = Number(
      (elapsed / CONFIG.MINING_DURATION_MS *
        CONFIG.MINING_DAILY_REWARD).toFixed(8)
    );

    if (reward <= 0) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return sendError(res, 400, "No mining reward available yet");
    }

    await client.query(
      `UPDATE users
       SET balance = balance + $1,
           mining_started_at = NOW(),
           last_claim_at = NOW()
       WHERE telegram_id = $2`,
      [reward, telegramId]
    );

    await saveTransaction(
      client, telegramId, "mining", reward, "Mining reward claimed"
    );

    await client.query("COMMIT");
    transactionStarted = false;

    res.json({
      success: true,
      claimed: reward,
      message: "Mining reward claimed successfully"
    });
  } catch (error) {
    if (transactionStarted) await client.query("ROLLBACK");
    console.error("Mining claim error:", error.message);
    sendError(res, 500, "Mining claim failed");
  } finally {
    client.release();
  }
});

/* DAILY BONUS */

app.post("/api/bonus/claim", auth, async (req, res) => {
  const client = await pool.connect();
  let transactionStarted = false;

  try {
    const telegramId = String(req.telegramUser.id);

    await client.query("BEGIN");
    transactionStarted = true;

    const userResult = await client.query(
      `SELECT channel_joined FROM users
       WHERE telegram_id = $1 FOR UPDATE`,
      [telegramId]
    );

    if (!userResult.rows.length) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return sendError(res, 404, "User not found");
    }

    if (!userResult.rows[0].channel_joined) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return sendError(res, 403, "Join the channel before claiming bonus");
    }

    const alreadyClaimed = await client.query(
      `SELECT id FROM transactions
       WHERE telegram_id = $1
         AND type = 'daily_bonus'
         AND (created_at AT TIME ZONE 'UTC')::date =
             (NOW() AT TIME ZONE 'UTC')::date
       LIMIT 1`,
      [telegramId]
    );

    if (alreadyClaimed.rows.length) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return sendError(res, 400, "Today's bonus has already been claimed");
    }

    await client.query(
      "UPDATE users SET balance = balance + $1 WHERE telegram_id = $2",
      [CONFIG.DAILY_BONUS, telegramId]
    );

    await saveTransaction(
      client, telegramId, "daily_bonus",
      CONFIG.DAILY_BONUS, "Daily bonus"
    );

    await client.query("COMMIT");
    transactionStarted = false;

    res.json({ success: true, reward: CONFIG.DAILY_BONUS });
  } catch (error) {
    if (transactionStarted) await client.query("ROLLBACK");
    console.error("Bonus error:", error.message);
    sendError(res, 500, "Could not claim daily bonus");
  } finally {
    client.release();
  }
});

/* REFERRAL */

app.get("/api/referral", auth, async (req, res) => {
  try {
    const telegramId = String(req.telegramUser.id);
    const botUsername = process.env.BOT_USERNAME || "CocoXMiningBot";

    const result = await pool.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE status = 'approved')::int AS approved
       FROM referrals WHERE referrer_telegram_id = $1`,
      [telegramId]
    );

    res.json({
      success: true,
      referralLink: `https://t.me/${botUsername}?start=ref_${telegramId}`,
      totalReferrals: result.rows[0].total,
      approvedReferrals: result.rows[0].approved,
      rewardPerReferral: CONFIG.REFERRAL_REWARD
    });
  } catch (error) {
    console.error("Referral error:", error.message);
    sendError(res, 500, "Could not load referral information");
  }
});

/* TASKS */

app.get("/api/tasks", auth, async (req, res) => {
  try {
    const telegramId = String(req.telegramUser.id);

    const user = await getUser(telegramId);

    if (!user) return sendError(res, 404, "User not found");
    if (!user.channel_joined) {
      return sendError(res, 403, "Join the channel before doing tasks");
    }

    const claims = await pool.query(
      `SELECT task_id, network, status, started_at, completed_at
       FROM task_claims
       WHERE telegram_id = $1`,
      [telegramId]
    );

    const claimMap = new Map(
      claims.rows.map(row => [row.task_id, row])
    );

    const tasks = [...LINK_TASKS, ...MONETAG_TASKS].map(task => ({
      ...task,
      claim: claimMap.get(task.id) || null
    }));

    res.json({ success: true, tasks });
  } catch (error) {
    console.error("Tasks error:", error.message);
    sendError(res, 500, "Could not load tasks");
  }
});

/* START A TASK */

app.post("/api/tasks/:taskId/start", auth, async (req, res) => {
  const client = await pool.connect();

  try {
    const telegramId = String(req.telegramUser.id);
    const taskId = String(req.params.taskId);

    const task = [...LINK_TASKS, ...MONETAG_TASKS]
      .find(item => item.id === taskId && item.active);

    if (!task) {
      return sendError(res, 404, "Task not found");
    }

    const user = await getUser(telegramId);

    if (!user) return sendError(res, 404, "User not found");
    if (!user.channel_joined) {
      return sendError(res, 403, "Join the channel before doing tasks");
    }

    const inserted = await client.query(
      `INSERT INTO task_claims
        (telegram_id, task_id, network, reward, status, started_at)
       VALUES ($1, $2, $3, $4, 'pending', NOW())
       ON CONFLICT (telegram_id, task_id) DO NOTHING
       RETURNING task_id, status, started_at`,
      [telegramId, task.id, task.network, task.reward]
    );

    if (!inserted.rows.length) {
      const existing = await client.query(
        `SELECT task_id, status, started_at, completed_at
         FROM task_claims
         WHERE telegram_id = $1 AND task_id = $2`,
        [telegramId, task.id]
      );

      return res.json({
        success: true,
        alreadyStarted: true,
        claim: existing.rows[0]
      });
    }

    res.json({
      success: true,
      task: {
        id: task.id,
        network: task.network,
        url: task.url || null,
        zoneId: task.zoneId || null,
        durationSeconds: task.durationSeconds || null
      },
      claim: inserted.rows[0],
      message: task.network === "Website"
        ? "Open the website and wait for the task timer."
        : "Monetag task started. Reward requires verified ad postback."
    });
  } catch (error) {
    console.error("Start task error:", error.message);
    sendError(res, 500, "Could not start task");
  } finally {
    client.release();
  }
});

/* COMPLETE WEBSITE TIMER TASK */

app.post("/api/tasks/:taskId/complete", auth, async (req, res) => {
  const client = await pool.connect();
  let transactionStarted = false;

  try {
    const telegramId = String(req.telegramUser.id);
    const taskId = String(req.params.taskId);

    const task = LINK_TASKS.find(item => item.id === taskId);

    if (!task) {
      return sendError(res, 400, "This endpoint only completes website tasks");
    }

    await client.query("BEGIN");
    transactionStarted = true;

    const result = await client.query(
      `SELECT status, started_at
       FROM task_claims
       WHERE telegram_id = $1 AND task_id = $2
       FOR UPDATE`,
      [telegramId, taskId]
    );

    if (!result.rows.length) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return sendError(res, 404, "Start this task first");
    }

    const claim = result.rows[0];

    if (claim.status === "completed") {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return sendError(res, 409, "Task already completed");
    }

    const elapsed = Date.now() - new Date(claim.started_at).getTime();
    const required = task.durationSeconds * 1000;

    if (!Number.isFinite(elapsed) || elapsed < required) {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return res.status(400).json({
        success: false,
        message: "Please wait until the task timer finishes",
        remainingMilliseconds: Math.max(0, required - elapsed)
      });
    }

    await client.query(
      `UPDATE task_claims
       SET status = 'completed', completed_at = NOW()
       WHERE telegram_id = $1 AND task_id = $2`,
      [telegramId, taskId]
    );

    await client.query("COMMIT");
    transactionStarted = false;

    res.json({
      success: true,
      completed: true,
      reward: 0,
      message: "Task completed. This timer-only task has no verified reward."
    });
  } catch (error) {
    if (transactionStarted) await client.query("ROLLBACK");
    console.error("Complete task error:", error.message);
    sendError(res, 500, "Could not complete task");
  } finally {
    client.release();
  }
});

/* WALLET */

app.get("/api/wallet", auth, async (req, res) => {
  try {
    const telegramId = String(req.telegramUser.id);
    const user = await getUser(telegramId);

    if (!user) return sendError(res, 404, "User not found");

    const [transactions, withdrawals] = await Promise.all([
      pool.query(
        `SELECT id, type, amount, description, created_at
         FROM transactions WHERE telegram_id = $1
         ORDER BY created_at DESC LIMIT 50`,
        [telegramId]
      ),
      pool.query(
        `SELECT id, amount, wallet_address, network, status, created_at
         FROM withdrawals WHERE telegram_id = $1
         ORDER BY created_at DESC LIMIT 50`,
        [telegramId]
      )
    ]);

    res.json({
      success: true,
      balance: user.balance,
      conversionRate: CONFIG.CONVERSION_RATE,
      usdValue: Number(user.balance) / CONFIG.CONVERSION_RATE,
      minimumWithdrawal: CONFIG.MINIMUM_WITHDRAWAL,
      transactions: transactions.rows,
      withdrawals: withdrawals.rows
    });
  } catch (error) {
    console.error("Wallet error:", error.message);
    sendError(res, 500, "Could not load wallet");
  }
});

/* WITHDRAWAL REQUEST */

app.post("/api/withdrawals", auth, async (req, res) => {
  const client = await pool.connect();
  let transactionStarted = false;

  try {
    const telegramId = String(req.telegramUser.id);
    const amount = Number(req.body?.amount);
    const walletAddress = String(req.body?.walletAddress || "").trim();

    if (
      !Number.isFinite(amount) ||
      amount < CONFIG.MINIMUM_WITHDRAWAL ||
      !/^\d+(\.\d{1,8})?$/.test(String(req.body?.amount))
    ) {
      return sendError(res, 400, "Invalid amount or minimum withdrawal is 500 Coconut");
    }

    if (!WALLET_REGEX.test(walletAddress)) {
      return sendError(res, 400, "Invalid BEP20 wallet address");
    }

    await client.query("BEGIN");
    transactionStarted = true;

    const userResult = await client.query(
      `SELECT balance, channel_joined FROM users
       WHERE telegram_id = $1 FOR UPDATE`,
      [telegramId]
    );

    if (!userResult.rows.length) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return sendError(res, 404, "User not found");
    }

    const user = userResult.rows[0];

    if (!user.channel_joined) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return sendError(res, 403, "Join the channel before withdrawal");
    }

    if (Number(user.balance) < amount) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return sendError(res, 400, "Insufficient balance");
    }

    await client.query(
      "UPDATE users SET balance = balance - $1 WHERE telegram_id = $2",
      [amount, telegramId]
    );

    const withdrawal = await client.query(
      `INSERT INTO withdrawals
        (telegram_id, amount, wallet_address, network)
       VALUES ($1, $2, $3, $4)
       RETURNING id, amount, wallet_address, network, status, created_at`,
      [telegramId, amount, walletAddress, CONFIG.NETWORK]
    );

    await saveTransaction(
      client, telegramId, "withdrawal", -amount,
      "Withdrawal request submitted"
    );

    await client.query("COMMIT");
    transactionStarted = false;

    res.json({
      success: true,
      withdrawal: withdrawal.rows[0],
      message: "Withdrawal request submitted for admin review"
    });
  } catch (error) {
    if (transactionStarted) await client.query("ROLLBACK");
    console.error("Withdrawal error:", error.message);
    sendError(res, 500, "Could not submit withdrawal");
  } finally {
    client.release();
  }
});

/* ADMIN DASHBOARD */

app.get("/api/admin/dashboard", auth, requireAdmin, async (req, res) => {
  try {
    const [users, pending, paid] = await Promise.all([
      pool.query("SELECT COUNT(*)::int AS total FROM users"),
      pool.query(
        "SELECT COUNT(*)::int AS total FROM withdrawals WHERE status = 'pending'"
      ),
      pool.query(
        "SELECT COALESCE(SUM(amount), 0) AS total FROM withdrawals WHERE status = 'approved'"
      )
    ]);

    res.json({
      success: true,
      totalUsers: users.rows[0].total,
      pendingWithdrawals: pending.rows[0].total,
      approvedWithdrawalAmount: paid.rows[0].total
    });
  } catch (error) {
    console.error("Admin dashboard error:", error.message);
    sendError(res, 500, "Could not load admin dashboard");
  }
});

/* ADMIN USERS */

app.get("/api/admin/users", auth, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT telegram_id, username, first_name, balance,
              channel_joined, created_at
       FROM users ORDER BY created_at DESC LIMIT 200`
    );

    res.json({ success: true, users: result.rows });
  } catch (error) {
    console.error("Admin users error:", error.message);
    sendError(res, 500, "Could not load users");
  }
});

/* ADMIN WITHDRAWALS */

app.get("/api/admin/withdrawals", auth, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, telegram_id, amount, wallet_address,
              network, status, created_at
       FROM withdrawals ORDER BY created_at DESC LIMIT 200`
    );

    res.json({ success: true, withdrawals: result.rows });
  } catch (error) {
    console.error("Admin withdrawals error:", error.message);
    sendError(res, 500, "Could not load withdrawals");
  }
});

app.post(
  "/api/admin/withdrawals/:id/approve",
  auth,
  requireAdmin,
  async (req, res) => {
    try {
      const result = await pool.query(
        `UPDATE withdrawals SET status = 'approved'
         WHERE id = $1 AND status = 'pending'
         RETURNING id, telegram_id, amount, status`,
        [req.params.id]
      );

      if (!result.rows.length) {
        return sendError(res, 404, "Pending withdrawal not found");
      }

      res.json({
        success: true,
        withdrawal: result.rows[0],
        message: "Marked approved. Send payment manually."
      });
    } catch (error) {
      console.error("Approve withdrawal error:", error.message);
      sendError(res, 500, "Could not approve withdrawal");
    }
  }
);

app.post(
  "/api/admin/withdrawals/:id/reject",
  auth,
  requireAdmin,
  async (req, res) => {
    const client = await pool.connect();
    let transactionStarted = false;

    try {
      await client.query("BEGIN");
      transactionStarted = true;

      const result = await client.query(
        `SELECT id, telegram_id, amount FROM withdrawals
         WHERE id = $1 AND status = 'pending' FOR UPDATE`,
        [req.params.id]
      );

      if (!result.rows.length) {
        await client.query("ROLLBACK");
        transactionStarted = false;
        return sendError(res, 404, "Pending withdrawal not found");
      }

      const withdrawal = result.rows[0];

      await client.query(
        "UPDATE withdrawals SET status = 'rejected' WHERE id = $1",
        [withdrawal.id]
      );

      await client.query(
        "UPDATE users SET balance = balance + $1 WHERE telegram_id = $2",
        [withdrawal.amount, withdrawal.telegram_id]
      );

      await saveTransaction(
        client, withdrawal.telegram_id, "withdrawal_refund",
        withdrawal.amount, "Rejected withdrawal refunded"
      );

      await client.query("COMMIT");
      transactionStarted = false;

      res.json({
        success: true,
        message: "Withdrawal rejected and balance refunded"
      });
    } catch (error) {
      if (transactionStarted) await client.query("ROLLBACK");
      console.error("Reject withdrawal error:", error.message);
      sendError(res, 500, "Could not reject withdrawal");
    } finally {
      client.release();
    }
  }
);

/* ADMIN TASK MANAGEMENT */

app.post("/api/admin/tasks", auth, requireAdmin, async (req, res) => {
  try {
    const title = String(req.body?.title || "").trim();
    const network = String(req.body?.network || "").trim();
    const taskUrl = String(req.body?.taskUrl || "").trim();
    const reward = Number(req.body?.reward);

    if (!title || !["Monetag", "Adsterra"].includes(network)) {
      return sendError(res, 400, "Invalid task title or network");
    }

    if (!Number.isFinite(reward) || reward <= 0) {
      return sendError(res, 400, "Invalid task reward");
    }

    let parsedUrl;

    try {
      parsedUrl = new URL(taskUrl);
    } catch {
      return sendError(res, 400, "Invalid task URL");
    }

    if (!["https:", "http:"].includes(parsedUrl.protocol)) {
      return sendError(res, 400, "Only HTTP or HTTPS URLs are allowed");
    }

    const result = await pool.query(
      `INSERT INTO tasks (title, network, reward, task_url, active)
       VALUES ($1, $2, $3, $4, TRUE)
       RETURNING id, title, network, reward, task_url, active`,
      [title, network, reward, taskUrl]
    );

    res.json({ success: true, task: result.rows[0] });
  } catch (error) {
    console.error("Create task error:", error.message);
    sendError(res, 500, "Could not create task");
  }
});

app.patch("/api/admin/tasks/:id", auth, requireAdmin, async (req, res) => {
  try {
    const active = req.body?.active;

    if (typeof active !== "boolean") {
      return sendError(res, 400, "The active field must be true or false");
    }

    const result = await pool.query(
      `UPDATE tasks SET active = $1
       WHERE id = $2
       RETURNING id, title, network, reward, task_url, active`,
      [active, req.params.id]
    );

    if (!result.rows.length) {
      return sendError(res, 404, "Task not found");
    }

    res.json({ success: true, task: result.rows[0] });
  } catch (error) {
    console.error("Update task error:", error.message);
    sendError(res, 500, "Could not update task");
  }
});

/* API NOT FOUND & ERROR HANDLING */

app.use("/api", (req, res) => {
  sendError(res, 404, "API endpoint not found");
});

app.use((error, req, res, next) => {
  console.error("Server error:", error.message);
  sendError(res, 500, "Internal server error");
});

export default app;

if (process.env.VERCEL !== "1") {
  const PORT = process.env.PORT || 3000;

  app.listen(PORT, () => {
    console.log(`CocoX Mining running on port ${PORT}`);
  });
}
