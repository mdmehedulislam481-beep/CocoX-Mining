
/* CocoX Mining - Frontend App */

(() => {
  "use strict";

  const tg = window.Telegram?.WebApp;
  const $ = id => document.getElementById(id);

  const state = {
    user: null,
    tasks: [],
    channelJoined: false,
    loading: false
  };

  if (tg) {
    tg.ready();
    tg.expand();
  }

  function setText(id, value) {
    const element = $(id);
    if (element) element.textContent = value;
  }

  function showStatus(id, message) {
    setText(id, message);
  }

  async function api(path, method = "GET", body = null) {
    if (!tg?.initData) {
      throw new Error("Telegram App-এর ভিতর থেকে খুলুন।");
    }

    const options = {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-Telegram-Init-Data": tg.initData
      }
    };

    if (body !== null) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(path, options);
    const data = await response.json();

    if (!response.ok || data.success === false) {
      throw new Error(data.message || "Request failed");
    }

    return data;
  }

  function money(value) {
    return Number(value || 0).toFixed(2);
  }

  function updateBalance(balance) {
    const amount = Number(balance || 0);

    setText("balance", money(amount) + " 🥥");
    setText("usd", "$" + money(amount / 500) + " USD");
  }

  function addPage(id, title) {
    if ($(id)) return;

    const section = document.createElement("section");
    section.className = "page";
    section.id = id;
    section.innerHTML = `
      <div class="section">
        <h2>${title}</h2>
        <div id="${id}Content"></div>
      </div>
    `;

    document.querySelector("main.app")?.insertBefore(
      section,
      document.querySelector("footer")
    );
  }

  function addNavigation() {
    const nav = document.querySelector(".nav");
    if (!nav) return;

    const items = [
      { id: "tasksPage", label: "📋", name: "Tasks" },
      { id: "profilePage", label: "👤", name: "Profile" }
    ];

    items.forEach(item => {
      if (nav.querySelector(`[data-page="${item.id}"]`)) return;

      const button = document.createElement("button");
      button.dataset.page = item.id;
      button.innerHTML = `${item.label}<br>${item.name}`;
      nav.appendChild(button);
    });

    nav.style.gridTemplateColumns = "repeat(7, 1fr)";

    addPage("tasksPage", "📋 Tasks");
    addPage("profilePage", "👤 Profile");

    nav.querySelectorAll("button").forEach(button => {
      button.addEventListener("click", () => {
        document.querySelectorAll(".nav button").forEach(item => {
          item.classList.toggle("active", item === button);
        });

        document.querySelectorAll(".page").forEach(page => {
          page.classList.toggle(
            "active",
            page.id === button.dataset.page
          );
        });

        if (button.dataset.page === "tasksPage") loadTasks();
        if (button.dataset.page === "profilePage") loadProfile();
      });
    });
  }

  async function connectAccount() {
    if (!tg?.initData) {
      setText(
        "connectionStatus",
        "Telegram-এর ভিতর থেকে CocoX Mining খুলুন।"
      );
      return;
    }

    const user = tg.initDataUnsafe?.user;

    if (user) {
      state.user = user;

      setText(
        "username",
        user.username ? "@" + user.username : user.first_name
      );

      setText(
        "fullName",
        [user.first_name, user.last_name].filter(Boolean).join(" ")
      );

      setText("telegramId", user.id);
    }

    try {
      const data = await api("/api/profile", "POST", {
        startParam: tg.initDataUnsafe?.start_param || ""
      });

      state.user = data.user || state.user;
      updateBalance(data.user.balance);

      setText(
        "connectionStatus",
        "Telegram account connected successfully."
      );

      await verifyChannel(false);
      await loadMining();
      await loadReferral();
      await loadWallet();
      await loadProfile();

    } catch (error) {
      showStatus("connectionStatus", error.message);
    }
  }

  async function verifyChannel(showMessage = true) {
    try {
      const data = await api("/api/channel/verify", "POST", {});
      state.channelJoined = data.joined === true;

      if (showMessage) {
        showStatus("connectionStatus", "Channel membership verified!");
      }

      return state.channelJoined;
    } catch (error) {
      state.channelJoined = false;

      if (showMessage) {
        showStatus("connectionStatus", error.message);
      }

      return false;
    }
  }

  async function loadMining() {
    try {
      const data = await api("/api/mining/status");

      const percent = Math.min(
        100,
        (data.elapsedMilliseconds / 86400000) * 100
      );

      const fill = $("progressFill");
      if (fill) fill.style.width = percent + "%";

      setText("miningProgress", percent.toFixed(2) + "%");

      if (data.remainingMilliseconds <= 0) {
        setText("miningStatus", "Your mining reward is ready to claim!");
        setText("mineStatus", "Your 24-hour mining cycle is complete.");
        if ($("claimButton")) $("claimButton").disabled = false;
      } else {
        const hours = Math.floor(
          data.remainingMilliseconds / 3600000
        );
        const minutes = Math.floor(
          (data.remainingMilliseconds % 3600000) / 60000
        );

        setText(
          "miningStatus",
          `Mining in progress. ${hours}h ${minutes}m remaining.`
        );

        setText(
          "mineStatus",
          `Earned so far: ${money(data.miningAmount)} Coconut.`
        );

        if ($("claimButton")) {
          $("claimButton").disabled = data.miningAmount <= 0;
        }
      }
    } catch (error) {
      setText("miningStatus", error.message);
      setText("mineStatus", error.message);
    }
  }

  async function claimMining() {
    const button = $("claimButton");
    if (button) button.disabled = true;

    try {
      const data = await api("/api/mining/claim", "POST", {});
      showStatus("mineStatus", data.message || "Mining claimed!");
      await refreshAccount();
    } catch (error) {
      showStatus("mineStatus", error.message);
    } finally {
      if (button) button.disabled = false;
    }
  }

  async function claimBonus() {
    const button = $("bonusButton");
    if (button) button.disabled = true;

    try {
      const data = await api("/api/bonus/claim", "POST", {});
      showStatus(
        "bonusStatus",
        `Congratulations! You received ${data.reward} Coconut 🥥`
      );
      await refreshAccount();
    } catch (error) {
      showStatus("bonusStatus", error.message);
    } finally {
      if (button) button.disabled = false;
    }
  }

  async function loadReferral() {
    try {
      const data = await api("/api/referral");

      if ($("referralLink")) {
        $("referralLink").value = data.referralLink;
      }

      showStatus(
        "referralStatus",
        `Total referrals: ${data.totalReferrals} | Approved: ${data.approvedReferrals}`
      );
    } catch (error) {
      showStatus("referralStatus", error.message);
    }
  }

  async function loadWallet() {
    try {
      const data = await api("/api/wallet");
      updateBalance(data.balance);

      const history = (data.withdrawals || []).map(item =>
        `<div class="card">
          <div class="row">
            <strong>${money(item.amount)} Coconut</strong>
            <span>${item.status}</span>
          </div>
          <p class="muted">${item.wallet_address}</p>
        </div>`
      ).join("");

      const walletSection = $("walletStatus");
      if (walletSection && history) {
        walletSection.innerHTML =
          "Withdrawal History<br>" + history;
      }
    } catch (error) {
      showStatus("walletStatus", error.message);
    }
  }

  async function requestWithdrawal() {
    const amount = $("withdrawAmount")?.value;
    const walletAddress = $("walletAddress")?.value?.trim();

    try {
      const data = await api("/api/withdrawals", "POST", {
        amount,
        walletAddress
      });

      showStatus("walletStatus", data.message);
      await refreshAccount();
    } catch (error) {
      showStatus("walletStatus", error.message);
    }
  }

  async function loadTasks() {
    const container = $("tasksPageContent");
    if (!container) return;

    container.innerHTML = "<p class='muted'>Loading tasks...</p>";

    try {
      const data = await api("/api/tasks");
      state.tasks = data.tasks || [];

      container.innerHTML = `
        <div class="card">
          <h2>🎁 Daily Claim</h2>
          <p class="muted">Claim your daily 10 Coconut bonus.</p>
          <button id="taskDailyBonus">Claim Daily Bonus</button>
        </div>
        <div class="card">
          <h2>📢 Ad & Website Tasks</h2>
          <p class="muted">
            Website timer tasks do not give Coconut rewards.
            Ad rewards require verified network confirmation.
          </p>
        </div>
        <div id="taskList"></div>
      `;

      $("taskDailyBonus").addEventListener("click", claimBonus);

      const list = $("taskList");

      state.tasks.forEach(task => {
        const card = document.createElement("div");
        card.className = "card task";

        const status = task.claim?.status || "not started";
        const button = document.createElement("button");

        button.textContent =
          status === "completed" ? "Completed" :
          status === "pending" ? "Continue Task" : "Start Task";

        button.disabled = status === "completed";

        button.addEventListener("click", () => startTask(task));

        const title = document.createElement("h3");
        title.textContent = task.title;

        const info = document.createElement("p");
        info.className = "muted";
        info.textContent =
          `${task.network} · Reward: ${task.reward || 0} Coconut · ${status}`;

        card.append(title, info, button);
        list.appendChild(card);
      });

    } catch (error) {
      container.textContent = error.message;
    }
  }

  async function startTask(task) {
    try {
      const data = await api(
        `/api/tasks/${encodeURIComponent(task.id)}/start`,
        "POST",
        {}
      );

      if (task.network === "Website") {
        if (data.task?.url) {
          window.open(data.task.url, "_blank", "noopener");
        }

        alert("Website খুলে ১৫ সেকেন্ড অপেক্ষা করুন।");

        setTimeout(async () => {
          try {
            const result = await api(
              `/api/tasks/${encodeURIComponent(task.id)}/complete`,
              "POST",
              {}
            );

            alert(result.message);
            await loadTasks();
          } catch (error) {
            alert(error.message);
          }
        }, 15000);

        return;
      }

      if (task.network === "Monetag") {
        if (typeof window.show_12165220 === "function") {
          await window.show_12165220();
          alert(
            "Ad দেখানো হয়েছে। Reward কেবল Monetag-এর verified confirmation এলে দেওয়া হবে।"
          );
        } else {
          alert("Monetag Ad SDK এখনো লোড হয়নি।");
        }

        return;
      }

      alert("Task started. Verified reward confirmation is required.");

    } catch (error) {
      alert(error.message);
    }
  }

  async function loadProfile() {
    const container = $("profilePageContent");
    if (!container) return;

    try {
      const data = await api("/api/wallet");
      const user = state.user || {};

      container.innerHTML = `
        <div class="card">
          <div class="row"><span>Name</span><strong id="profileName"></strong></div>
          <div class="row"><span>Username</span><strong id="profileUsername"></strong></div>
          <div class="row"><span>Telegram ID</span><strong id="profileId"></strong></div>
          <div class="row"><span>Balance</span><strong>${money(data.balance)} 🥥</strong></div>
          <div class="row"><span>USD Value</span><strong>$${money(data.usdValue)}</strong></div>
          <div class="row"><span>Network</span><strong>BEP20</strong></div>
          <div class="row"><span>Conversion</span><strong>500 Coconut = $1</strong></div>
        </div>
        <div class="card">
          <h3>Transaction History</h3>
          <div id="profileTransactions"></div>
        </div>
      `;

      setText(
        "profileName",
        [user.first_name, user.last_name].filter(Boolean).join(" ") || "Telegram User"
      );

      setText(
        "profileUsername",
        user.username ? "@" + user.username : "Not set"
      );

      setText("profileId", user.id || "Unavailable");

      const history = $("profileTransactions");

      if (!data.transactions?.length) {
        history.textContent = "No transactions yet.";
      } else {
        data.transactions.forEach(item => {
          const row = document.createElement("p");
          row.className = "row";
          row.textContent =
            `${item.type}: ${money(item.amount)} Coconut`;
          history.appendChild(row);
        });
      }
    } catch (error) {
      container.textContent = error.message;
    }
  }

  async function refreshAccount() {
    try {
      const data = await api("/api/profile", "POST", {
        startParam: tg?.initDataUnsafe?.start_param || ""
      });

      updateBalance(data.user.balance);
      await loadMining();
      await loadWallet();
    } catch (error) {
      console.error(error);
    }
  }

  function setupButtons() {
    $("claimButton")?.addEventListener("click", claimMining);
    $("bonusButton")?.addEventListener("click", claimBonus);
    $("withdrawButton")?.addEventListener("click", requestWithdrawal);

    $("copyReferral")?.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText($("referralLink")?.value || "");
        showStatus("referralStatus", "Referral link copied!");
      } catch {
        showStatus("referralStatus", "Copy the referral link manually.");
      }
    });
  }

  async function startApp() {
    addNavigation();
    setupButtons();
    await connectAccount();
  }

  startApp();
})();
