import { storageGet, storageSet } from "./storage.js";

const WHITELIST_KEY = "whitelistDomains";

export function normalizeDomain(domain) {
  if (!domain || typeof domain !== "string") {
    return "";
  }

  return domain
    .trim()
    .toLowerCase()
    .replace(/^\.+/, "");
}

function uniqueDomains(domains) {
  return Array.from(
    new Set(
      (domains || [])
        .map((domain) => normalizeDomain(domain))
        .filter(Boolean)
    )
  ).sort();
}

export async function getWhitelist() {
  const data = await storageGet("sync", { [WHITELIST_KEY]: [] });
  return uniqueDomains(data[WHITELIST_KEY]);
}

export async function setWhitelist(domains) {
  const whitelist = uniqueDomains(domains);
  await storageSet("sync", { [WHITELIST_KEY]: whitelist });
  return whitelist;
}

export async function isDomainWhitelisted(domain) {
  const normalized = normalizeDomain(domain);
  if (!normalized) {
    return false;
  }

  const whitelist = await getWhitelist();
  return whitelist.some((entry) => {
    return normalized === entry || normalized.endsWith(`.${entry}`);
  });
}

export async function addWhitelistDomain(domain) {
  const normalized = normalizeDomain(domain);
  if (!normalized) {
    return { domain: "", whitelist: await getWhitelist(), added: false };
  }

  const whitelist = await getWhitelist();
  if (!whitelist.includes(normalized)) {
    whitelist.push(normalized);
  }

  const saved = await setWhitelist(whitelist);
  return { domain: normalized, whitelist: saved, added: true };
}

export async function removeWhitelistDomain(domain) {
  const normalized = normalizeDomain(domain);
  const whitelist = await getWhitelist();
  const next = whitelist.filter((entry) => entry !== normalized);
  const saved = await setWhitelist(next);
  return { domain: normalized, whitelist: saved, removed: true };
}

export async function toggleWhitelist(domain) {
  const normalized = normalizeDomain(domain);
  const whitelist = await getWhitelist();
  const exists = whitelist.includes(normalized);

  const next = exists
    ? whitelist.filter((entry) => entry !== normalized)
    : [...whitelist, normalized];

  const saved = await setWhitelist(next);

  return {
    domain: normalized,
    whitelisted: !exists,
    whitelist: saved,
  };
}
