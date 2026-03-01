function sendMessage(message) {
  return chrome.runtime.sendMessage(message);
}

function listToText(values) {
  return (values || []).join("\n");
}

function textToList(value) {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatTimestamp(timestamp) {
  if (!timestamp) {
    return "-";
  }

  return new Date(timestamp).toLocaleString();
}

function setMessage(text, isError = false) {
  const status = document.getElementById("licenseStatus");
  status.textContent = text;
  status.style.color = isError ? "var(--danger)" : "var(--text)";
}

function applyProGate(proActive) {
  const proControls = document.querySelectorAll(".pro-only");
  for (const control of proControls) {
    control.disabled = !proActive;
  }

  const proPanels = document.querySelectorAll(".pro-panel");
  for (const panel of proPanels) {
    panel.classList.toggle("locked", !proActive);
  }

  const hint = document.getElementById("upgradeHint");
  hint.classList.toggle("hidden", proActive);
}

function renderWhitelist(whitelist) {
  const list = document.getElementById("whitelistList");
  list.innerHTML = "";

  if (!whitelist.length) {
    const empty = document.createElement("li");
    empty.className = "muted";
    empty.textContent = "No whitelisted domains yet.";
    list.appendChild(empty);
    return;
  }

  const fragment = document.createDocumentFragment();

  for (const domain of whitelist) {
    const item = document.createElement("li");
    item.className = "list-item";

    const name = document.createElement("span");
    name.textContent = domain;

    const remove = document.createElement("button");
    remove.className = "remove-btn";
    remove.type = "button";
    remove.dataset.domain = domain;
    remove.textContent = "Remove";

    item.appendChild(name);
    item.appendChild(remove);
    fragment.appendChild(item);
  }

  list.appendChild(fragment);
}

function renderHistory(history) {
  const list = document.getElementById("historyList");
  list.innerHTML = "";

  if (!history || history.length === 0) {
    const empty = document.createElement("li");
    empty.className = "muted";
    empty.textContent = "No cleanup history yet.";
    list.appendChild(empty);
    return;
  }

  const fragment = document.createDocumentFragment();

  for (const entry of history) {
    const item = document.createElement("li");
    item.className = "list-item";

    const detail = document.createElement("div");
    detail.innerHTML = `<strong>${entry.domain || "(unknown domain)"}</strong><div class="history-meta">${entry.count} cookies · ${formatTimestamp(entry.timestamp)}</div>`;

    item.appendChild(detail);
    fragment.appendChild(item);
  }

  list.appendChild(fragment);
}

function renderRules(rules) {
  document.getElementById("wildcardPatterns").value = listToText(rules.wildcardPatterns);
  document.getElementById("regexPatterns").value = listToText(rules.regexPatterns);
  document.getElementById("keepSessionCookies").checked = Boolean(rules.keepSessionCookies);
  document.getElementById("deleteTrackingCookiesOnly").checked = Boolean(
    rules.deleteTrackingCookiesOnly
  );
  document.getElementById("scheduledCleaningDays").value = String(
    Number(rules.scheduledCleaningDays) || 0
  );
  document.getElementById("perCookieAllowlist").value = JSON.stringify(
    rules.perCookieAllowlist || {},
    null,
    2
  );
}

function collectRulesFromForm() {
  const wildcardPatterns = textToList(document.getElementById("wildcardPatterns").value);
  const regexPatterns = textToList(document.getElementById("regexPatterns").value);
  const keepSessionCookies = document.getElementById("keepSessionCookies").checked;
  const deleteTrackingCookiesOnly = document.getElementById(
    "deleteTrackingCookiesOnly"
  ).checked;
  const scheduledCleaningDays = Math.max(
    0,
    Number(document.getElementById("scheduledCleaningDays").value) || 0
  );

  let perCookieAllowlist = {};
  const rawAllowlist = document.getElementById("perCookieAllowlist").value.trim();

  if (rawAllowlist) {
    perCookieAllowlist = JSON.parse(rawAllowlist);
  }

  return {
    wildcardPatterns,
    regexPatterns,
    keepSessionCookies,
    deleteTrackingCookiesOnly,
    scheduledCleaningDays,
    perCookieAllowlist,
  };
}

async function loadOptionsData() {
  const response = await sendMessage({ type: "getOptionsData" });
  if (!response?.ok) {
    throw new Error(response?.error || "Unable to load options data");
  }

  const { whitelist, stats, history, license, rules } = response.data;

  renderWhitelist(whitelist || []);
  renderHistory(history || []);
  renderRules(rules || {});

  document.getElementById("todayDeleted").textContent = String(stats?.todayDeleted || 0);
  document.getElementById("totalDeleted").textContent = String(stats?.totalDeleted || 0);

  document.getElementById("licenseKeyInput").value = license?.licenseKey || "";
  setMessage(`Status: ${license?.status || "free"}${license?.validationMessage ? ` · ${license.validationMessage}` : ""}`);

  if ((license?.trialDaysRemaining || 0) > 0) {
    document.getElementById("trialStatus").textContent = `Trial remaining: ${license.trialDaysRemaining} day(s)`;
  } else {
    document.getElementById("trialStatus").textContent = "Trial expired";
  }

  applyProGate(Boolean(license?.proActive));
}

async function addWhitelistDomain(event) {
  event.preventDefault();
  const input = document.getElementById("whitelistDomain");
  const domain = input.value.trim().toLowerCase();

  if (!domain) {
    return;
  }

  const response = await sendMessage({ type: "addWhitelist", domain });
  if (!response?.ok) {
    throw new Error(response?.error || "Unable to add domain");
  }

  input.value = "";
  renderWhitelist(response.data || []);
}

async function removeWhitelistDomain(domain) {
  const response = await sendMessage({ type: "removeWhitelist", domain });
  if (!response?.ok) {
    throw new Error(response?.error || "Unable to remove domain");
  }

  renderWhitelist(response.data || []);
}

async function saveRules() {
  let rules;

  try {
    rules = collectRulesFromForm();
  } catch {
    throw new Error("Per-cookie allowlist must be valid JSON");
  }

  const response = await sendMessage({ type: "saveRules", rules });
  if (!response?.ok) {
    throw new Error(response?.error || "Unable to save rules");
  }

  renderRules(response.data || {});
}

function downloadJson(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function exportConfig() {
  const response = await sendMessage({ type: "exportConfig" });
  if (!response?.ok) {
    throw new Error(response?.error || "Unable to export config");
  }

  const filename = `tabwipe-config-${new Date().toISOString().slice(0, 10)}.json`;
  downloadJson(filename, response.data);
}

async function importConfig(file) {
  if (!file) {
    return;
  }

  const text = await file.text();
  let payload;

  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error("Import file is not valid JSON");
  }

  const response = await sendMessage({ type: "importConfig", payload });
  if (!response?.ok) {
    throw new Error(response?.error || "Unable to import config");
  }
}

async function verifyLicense() {
  const licenseKey = document.getElementById("licenseKeyInput").value.trim();
  const response = await sendMessage({ type: "verifyLicense", licenseKey });
  if (!response?.ok) {
    throw new Error(response?.error || "Unable to validate license");
  }
}

async function clearLicense() {
  const response = await sendMessage({ type: "clearLicense" });
  if (!response?.ok) {
    throw new Error(response?.error || "Unable to clear license");
  }
}

async function refreshLicense() {
  const response = await sendMessage({ type: "refreshLicense" });
  if (!response?.ok) {
    throw new Error(response?.error || "Unable to refresh license");
  }
}

async function runPendingCleanup() {
  const response = await sendMessage({ type: "runCleanupNow" });
  if (!response?.ok) {
    throw new Error(response?.error || "Unable to run cleanup");
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  try {
    await loadOptionsData();
  } catch (error) {
    setMessage(error.message, true);
  }

  document.getElementById("whitelistForm").addEventListener("submit", async (event) => {
    try {
      await addWhitelistDomain(event);
      setMessage("Whitelist updated");
    } catch (error) {
      setMessage(error.message, true);
    }
  });

  document.getElementById("whitelistList").addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement) || !target.dataset.domain) {
      return;
    }

    try {
      await removeWhitelistDomain(target.dataset.domain);
      setMessage("Whitelist updated");
    } catch (error) {
      setMessage(error.message, true);
    }
  });

  document.getElementById("verifyLicenseBtn").addEventListener("click", async () => {
    try {
      await verifyLicense();
      await loadOptionsData();
    } catch (error) {
      setMessage(error.message, true);
    }
  });

  document.getElementById("clearLicenseBtn").addEventListener("click", async () => {
    try {
      await clearLicense();
      await loadOptionsData();
    } catch (error) {
      setMessage(error.message, true);
    }
  });

  document.getElementById("refreshLicenseBtn").addEventListener("click", async () => {
    try {
      await refreshLicense();
      await loadOptionsData();
    } catch (error) {
      setMessage(error.message, true);
    }
  });

  document.getElementById("saveRulesBtn").addEventListener("click", async () => {
    try {
      await saveRules();
      setMessage("Pro rules saved");
    } catch (error) {
      setMessage(error.message, true);
    }
  });

  document.getElementById("exportConfigBtn").addEventListener("click", async () => {
    try {
      await exportConfig();
      setMessage("Config exported");
    } catch (error) {
      setMessage(error.message, true);
    }
  });

  document.getElementById("importConfigInput").addEventListener("change", async (event) => {
    const input = event.target;
    const file = input.files?.[0];

    try {
      await importConfig(file);
      await loadOptionsData();
      setMessage("Config imported");
    } catch (error) {
      setMessage(error.message, true);
    } finally {
      input.value = "";
    }
  });

  document.getElementById("runCleanupNow").addEventListener("click", async () => {
    try {
      await runPendingCleanup();
      await loadOptionsData();
      setMessage("Pending cleanup executed");
    } catch (error) {
      setMessage(error.message, true);
    }
  });
});
