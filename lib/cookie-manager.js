import { storageGet, storageSet } from "./storage.js";

const COOKIE_FIRST_SEEN_KEY = "cookieFirstSeenAt";

function normalizeDomain(domain) {
  return String(domain || "")
    .trim()
    .toLowerCase()
    .replace(/^\.+/, "");
}

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

export function cookieIdentity(cookie) {
  const domain = normalizeDomain(cookie.domain || "");
  const path = cookie.path || "/";
  const storeId = cookie.storeId || "default";
  return `${storeId}|${domain}|${path}|${cookie.name}`;
}

export function cookieUrl(cookie) {
  const host = normalizeDomain(cookie.domain || "");
  const protocol = cookie.secure ? "https:" : "http:";
  const path = cookie.path || "/";
  return `${protocol}//${host}${path}`;
}

async function getFirstSeenMap() {
  const data = await storageGet("local", { [COOKIE_FIRST_SEEN_KEY]: {} });
  return data[COOKIE_FIRST_SEEN_KEY] || {};
}

async function saveFirstSeenMap(map) {
  await storageSet("local", { [COOKIE_FIRST_SEEN_KEY]: map });
}

export async function touchCookies(cookies) {
  if (!Array.isArray(cookies) || cookies.length === 0) {
    return;
  }

  const map = await getFirstSeenMap();
  const timestamp = nowSec();
  let changed = false;

  for (const cookie of cookies) {
    const key = cookieIdentity(cookie);
    if (!map[key]) {
      map[key] = timestamp;
      changed = true;
    }
  }

  if (changed) {
    await saveFirstSeenMap(map);
  }
}

export async function getCookieAgeDays(cookie) {
  const map = await getFirstSeenMap();
  const firstSeen = map[cookieIdentity(cookie)] || nowSec();
  const ageSeconds = Math.max(0, nowSec() - firstSeen);
  return ageSeconds / (60 * 60 * 24);
}

export async function getCookiesForDomain(domain) {
  const normalized = normalizeDomain(domain);
  if (!normalized) {
    return [];
  }

  const cookies = await chrome.cookies.getAll({ domain: normalized });
  await touchCookies(cookies);
  return cookies;
}

export async function getCookiesForUrl(url) {
  const cookies = await chrome.cookies.getAll({ url });
  await touchCookies(cookies);
  return cookies;
}

export async function deleteCookie(cookie) {
  try {
    const details = {
      url: cookieUrl(cookie),
      name: cookie.name,
      storeId: cookie.storeId,
    };

    const result = await chrome.cookies.remove(details);
    return Boolean(result);
  } catch {
    return false;
  }
}

export async function deleteCookies(cookies) {
  if (!Array.isArray(cookies) || cookies.length === 0) {
    return { deletedCount: 0, attemptedCount: 0 };
  }

  const outcomes = await Promise.all(cookies.map((cookie) => deleteCookie(cookie)));
  const deletedCount = outcomes.filter(Boolean).length;

  return {
    deletedCount,
    attemptedCount: cookies.length,
  };
}

export async function deleteDomainCookies(domain) {
  const cookies = await getCookiesForDomain(domain);
  const result = await deleteCookies(cookies);
  return {
    ...result,
    domain,
  };
}
