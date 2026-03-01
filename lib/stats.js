import { storageGet, storageSet } from "./storage.js";

const STATS_KEY = "statsState";
const MAX_HISTORY_ITEMS = 500;

function dateKey(timestamp = Date.now()) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function normalizeState(raw) {
  const base = raw || {};
  return {
    totalDeleted: Number.isFinite(base.totalDeleted) ? base.totalDeleted : 0,
    daily: base.daily && typeof base.daily === "object" ? base.daily : {},
    lastDeletedAt: base.lastDeletedAt || null,
    history: Array.isArray(base.history) ? base.history.slice(0, MAX_HISTORY_ITEMS) : [],
  };
}

export async function getStatsState() {
  const data = await storageGet("local", { [STATS_KEY]: null });
  return normalizeState(data[STATS_KEY]);
}

export async function saveStatsState(state) {
  const normalized = normalizeState(state);
  await storageSet("local", { [STATS_KEY]: normalized });
  return normalized;
}

export async function recordDeletion({ domain, count, reason = "auto", proApplied = false }) {
  const deleted = Number(count) || 0;
  if (deleted <= 0) {
    return getStatsState();
  }

  const now = Date.now();
  const day = dateKey(now);
  const state = await getStatsState();

  state.totalDeleted += deleted;
  state.daily[day] = (state.daily[day] || 0) + deleted;
  state.lastDeletedAt = now;

  state.history.unshift({
    timestamp: now,
    domain: domain || "",
    count: deleted,
    reason,
    proApplied,
  });

  state.history = state.history.slice(0, MAX_HISTORY_ITEMS);

  return saveStatsState(state);
}

export async function getQuickStats() {
  const state = await getStatsState();
  const today = dateKey(Date.now());

  return {
    todayDeleted: state.daily[today] || 0,
    totalDeleted: state.totalDeleted,
    lastDeletedAt: state.lastDeletedAt,
  };
}

export async function getDeletionHistory(limit = 50) {
  const state = await getStatsState();
  const max = Math.max(1, Math.min(Number(limit) || 50, MAX_HISTORY_ITEMS));
  return state.history.slice(0, max);
}
