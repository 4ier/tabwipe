import {
  getCookiesForDomain,
  deleteCookies,
  getCookieAgeDays,
} from "./lib/cookie-manager.js";
import {
  rebuildTabDomainMap,
  updateTabDomain,
  removeTabFromMap,
  getDomainForTab,
  domainHasOpenTabs,
  getDomainFromUrl,
} from "./lib/tab-tracker.js";
import {
  getWhitelist,
  isDomainWhitelisted,
  toggleWhitelist,
  setWhitelist,
} from "./lib/whitelist.js";
import {
  getRules,
  saveRules,
  shouldDeleteCookie,
  hasAnyAdvancedRule,
  matchesAdvancedDomainRule,
} from "./lib/rules-engine.js";
import {
  initializeLicense,
  getLicenseState,
  refreshLicenseStatus,
  saveLicenseKey,
  clearLicenseKey,
  isProActive,
  getTrialDaysRemaining,
} from "./lib/license.js";
import {
  getQuickStats,
  recordDeletion,
  getDeletionHistory,
} from "./lib/stats.js";
import { storageGet, storageSet } from "./lib/storage.js";

const SWEEP_ALARM_NAME = "tabwipe-fallback-sweep";
const LICENSE_ALARM_NAME = "tabwipe-license-refresh";
const PENDING_CLEANUPS_KEY = "pendingCleanups";
const CLEANUP_DELAY_MS = 5000;

function cleanupId(domain) {
  return `${domain}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
}

async function ensureAlarms() {
  await chrome.alarms.create(SWEEP_ALARM_NAME, { periodInMinutes: 5 });
  await chrome.alarms.create(LICENSE_ALARM_NAME, { periodInMinutes: 24 });
}

async function getPendingCleanups() {
  const data = await storageGet("local", { [PENDING_CLEANUPS_KEY]: [] });
  return Array.isArray(data[PENDING_CLEANUPS_KEY]) ? data[PENDING_CLEANUPS_KEY] : [];
}

async function savePendingCleanups(entries) {
  await storageSet("local", { [PENDING_CLEANUPS_KEY]: entries });
}

async function queueDomainCleanup(domain, reason = "tab_closed", delayMs = CLEANUP_DELAY_MS) {
  if (!domain) {
    return;
  }

  const pending = await getPendingCleanups();

  const duplicate = pending.find(
    (entry) => entry.domain === domain && entry.reason === reason
  );
  if (duplicate) {
    return;
  }

  pending.push({
    id: cleanupId(domain),
    domain,
    reason,
    executeAt: Date.now() + delayMs,
  });

  await savePendingCleanups(pending);

  // Use chrome.alarms instead of setTimeout — SW may be killed before setTimeout fires
  const alarmName = `tabwipe-cleanup-${domain}-${Date.now()}`;
  await chrome.alarms.create(alarmName, { delayInMinutes: Math.max(delayMs / 60000, 0.1) });
}

async function filterCookiesForCleanup(domain, cookies) {
  const license = await getLicenseState();
  const proEnabled = isProActive(license);

  if (!proEnabled) {
    return {
      cookiesToDelete: cookies,
      proApplied: false,
    };
  }

  const rules = await getRules();

  if (!hasAnyAdvancedRule(rules)) {
    return {
      cookiesToDelete: cookies,
      proApplied: false,
    };
  }

  const hasDomainPatterns =
    rules.wildcardPatterns.length > 0 || rules.regexPatterns.length > 0;
  const domainMatch = !hasDomainPatterns || matchesAdvancedDomainRule(domain, rules);

  if (!domainMatch) {
    return {
      cookiesToDelete: cookies,
      proApplied: false,
    };
  }

  const cookiesToDelete = [];

  for (const cookie of cookies) {
    const cookieAgeDays = await getCookieAgeDays(cookie);
    if (shouldDeleteCookie(cookie, domain, rules, cookieAgeDays)) {
      cookiesToDelete.push(cookie);
    }
  }

  return {
    cookiesToDelete,
    proApplied: true,
  };
}

async function cleanupDomainCookies(domain, reason = "auto") {
  if (!domain) {
    return { success: false, skipped: "missing-domain", deletedCount: 0 };
  }

  if (await isDomainWhitelisted(domain)) {
    return { success: true, skipped: "whitelisted", deletedCount: 0 };
  }

  const cookies = await getCookiesForDomain(domain);
  if (cookies.length === 0) {
    return { success: true, skipped: "no-cookies", deletedCount: 0 };
  }

  const { cookiesToDelete, proApplied } = await filterCookiesForCleanup(domain, cookies);

  if (cookiesToDelete.length === 0) {
    return { success: true, skipped: "filtered", deletedCount: 0 };
  }

  const result = await deleteCookies(cookiesToDelete);

  if (result.deletedCount > 0) {
    await recordDeletion({
      domain,
      count: result.deletedCount,
      reason,
      proApplied,
    });
  }

  return {
    success: true,
    deletedCount: result.deletedCount,
    attemptedCount: result.attemptedCount,
    proApplied,
  };
}

async function processPendingCleanups() {
  const now = Date.now();
  const pending = await getPendingCleanups();

  if (pending.length === 0) {
    return;
  }

  const due = [];
  const later = [];

  for (const entry of pending) {
    if ((entry.executeAt || 0) <= now) {
      due.push(entry);
    } else {
      later.push(entry);
    }
  }

  for (const entry of due) {
    const hasOpenTabs = await domainHasOpenTabs(entry.domain);

    if (hasOpenTabs) {
      later.push({
        ...entry,
        executeAt: now + 5 * 60 * 1000,
      });
      continue;
    }

    await cleanupDomainCookies(entry.domain, entry.reason);
  }

  await savePendingCleanups(later);
  await updateBadgeForActiveTab();
}

async function updateBadgeForTab(tabId) {
  if (typeof tabId !== "number") {
    return;
  }

  try {
    const tab = await chrome.tabs.get(tabId);
    const domain = getDomainFromUrl(tab.url || "");

    if (!domain) {
      await chrome.action.setBadgeText({ tabId, text: "" });
      await chrome.action.setTitle({ tabId, title: "TabWipe" });
      return;
    }

    const cookies = await getCookiesForDomain(domain);
    const count = cookies.length;

    await chrome.action.setBadgeBackgroundColor({ tabId, color: "#2563EB" });
    await chrome.action.setBadgeText({
      tabId,
      text: count === 0 ? "" : count > 99 ? "99+" : String(count),
    });
    await chrome.action.setTitle({ tabId, title: `TabWipe: ${count} cookies on ${domain}` });
  } catch {
    // Ignore tabs that disappear before badge update completes.
  }
}

async function updateBadgeForActiveTab() {
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (activeTab?.id) {
    await updateBadgeForTab(activeTab.id);
  }
}

async function getCurrentTabPopupData() {
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const tabUrl = activeTab?.url || "";
  const domain = getDomainFromUrl(tabUrl);
  const whitelisted = domain ? await isDomainWhitelisted(domain) : false;
  const cookies = domain ? await getCookiesForDomain(domain) : [];
  const stats = await getQuickStats();
  const license = await getLicenseState();

  return {
    domain,
    tabId: activeTab?.id || null,
    whitelisted,
    cookies: cookies
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((cookie) => ({
        name: cookie.name,
        domain: cookie.domain,
        path: cookie.path,
        session: cookie.session,
        secure: cookie.secure,
        sameSite: cookie.sameSite,
        expirationDate: cookie.expirationDate || null,
      })),
    cookieCount: cookies.length,
    stats,
    license: {
      ...license,
      proActive: isProActive(license),
      trialDaysRemaining: getTrialDaysRemaining(license),
    },
  };
}

async function getOptionsData() {
  const [whitelist, stats, history, license, rules] = await Promise.all([
    getWhitelist(),
    getQuickStats(),
    getDeletionHistory(100),
    getLicenseState(),
    getRules(),
  ]);

  return {
    whitelist,
    stats,
    history,
    license: {
      ...license,
      proActive: isProActive(license),
      trialDaysRemaining: getTrialDaysRemaining(license),
    },
    rules,
  };
}

async function initializeRuntime() {
  await Promise.all([rebuildTabDomainMap(), initializeLicense(), ensureAlarms()]);
  await refreshLicenseStatus({ force: true });
  await processPendingCleanups();
  await updateBadgeForActiveTab();
}

chrome.runtime.onInstalled.addListener(async () => {
  await initializeRuntime();
});

chrome.runtime.onStartup.addListener(async () => {
  await initializeRuntime();
});

initializeRuntime().catch((error) => {
  console.error("TabWipe initialization error", error);
});

chrome.tabs.onCreated.addListener(async (tab) => {
  if (typeof tab.id === "number") {
    await updateTabDomain(tab.id, tab.url || "");
  }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.url || tab.url) {
    await updateTabDomain(tabId, changeInfo.url || tab.url || "");
  }

  if (tab.active || changeInfo.status === "complete") {
    await updateBadgeForTab(tabId);
  }
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  await updateBadgeForTab(tabId);
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const domain = await getDomainForTab(tabId);
  await removeTabFromMap(tabId);

  if (!domain) {
    return;
  }

  if (await isDomainWhitelisted(domain)) {
    return;
  }

  const stillOpen = await domainHasOpenTabs(domain, tabId);
  if (stillOpen) {
    return;
  }

  await queueDomainCleanup(domain, "tab-closed", CLEANUP_DELAY_MS);
});

chrome.cookies.onChanged.addListener(async () => {
  await updateBadgeForActiveTab();
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === SWEEP_ALARM_NAME) {
    await rebuildTabDomainMap();
    await processPendingCleanups();
    return;
  }

  if (alarm.name === LICENSE_ALARM_NAME) {
    await refreshLicenseStatus();
    return;
  }

  // Dynamic per-domain cleanup alarms
  if (alarm.name.startsWith("tabwipe-cleanup-")) {
    await processPendingCleanups();
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const run = async () => {
    switch (message?.type) {
      case "getPopupData": {
        const data = await getCurrentTabPopupData();
        return { ok: true, data };
      }

      case "toggleWhitelist": {
        const result = await toggleWhitelist(message.domain);
        await updateBadgeForActiveTab();
        return { ok: true, data: result };
      }

      case "getOptionsData": {
        const data = await getOptionsData();
        return { ok: true, data };
      }

      case "addWhitelist": {
        const domain = String(message.domain || "").trim().toLowerCase();
        const whitelist = await getWhitelist();
        if (domain && !whitelist.includes(domain)) {
          whitelist.push(domain);
          await setWhitelist(whitelist);
        }
        await updateBadgeForActiveTab();
        return { ok: true, data: await getWhitelist() };
      }

      case "removeWhitelist": {
        const domain = String(message.domain || "").trim().toLowerCase();
        const whitelist = (await getWhitelist()).filter((item) => item !== domain);
        await setWhitelist(whitelist);
        await updateBadgeForActiveTab();
        return { ok: true, data: whitelist };
      }

      case "saveRules": {
        const license = await getLicenseState();
        if (!isProActive(license)) {
          return { ok: false, error: "Pro required" };
        }
        const rules = await saveRules(message.rules || {});
        return { ok: true, data: rules };
      }

      case "verifyLicense": {
        const state = await saveLicenseKey(message.licenseKey || "");
        return {
          ok: true,
          data: {
            ...state,
            proActive: isProActive(state),
            trialDaysRemaining: getTrialDaysRemaining(state),
          },
        };
      }

      case "clearLicense": {
        const state = await clearLicenseKey();
        return {
          ok: true,
          data: {
            ...state,
            proActive: isProActive(state),
            trialDaysRemaining: getTrialDaysRemaining(state),
          },
        };
      }

      case "refreshLicense": {
        const state = await refreshLicenseStatus({ force: true });
        return {
          ok: true,
          data: {
            ...state,
            proActive: isProActive(state),
            trialDaysRemaining: getTrialDaysRemaining(state),
          },
        };
      }

      case "runCleanupNow": {
        if (message.domain) {
          const result = await cleanupDomainCookies(message.domain, "manual");
          await updateBadgeForActiveTab();
          return { ok: true, data: result };
        }

        await processPendingCleanups();
        return { ok: true, data: { processed: true } };
      }

      case "exportConfig": {
        const license = await getLicenseState();
        if (!isProActive(license)) {
          return { ok: false, error: "Pro required" };
        }

        const payload = {
          exportedAt: new Date().toISOString(),
          whitelist: await getWhitelist(),
          rules: await getRules(),
        };

        return { ok: true, data: payload };
      }

      case "importConfig": {
        const license = await getLicenseState();
        if (!isProActive(license)) {
          return { ok: false, error: "Pro required" };
        }

        const incoming = message.payload || {};
        if (Array.isArray(incoming.whitelist)) {
          await setWhitelist(incoming.whitelist);
        }
        if (incoming.rules && typeof incoming.rules === "object") {
          await saveRules(incoming.rules);
        }

        return { ok: true, data: await getOptionsData() };
      }

      case "getDashboardData": {
        const license = await getLicenseState();
        if (!isProActive(license)) {
          return { ok: false, error: "Pro required" };
        }

        return {
          ok: true,
          data: {
            stats: await getQuickStats(),
            history: await getDeletionHistory(100),
          },
        };
      }

      default:
        return { ok: false, error: "Unknown message" };
    }
  };

  run()
    .then((response) => sendResponse(response))
    .catch((error) => {
      sendResponse({ ok: false, error: error?.message || String(error) });
    });

  return true;
});
