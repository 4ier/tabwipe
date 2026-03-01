import { storageGet, storageSet } from "./storage.js";

const TAB_DOMAIN_MAP_KEY = "tabDomainMap";
const TAB_MAP_UPDATED_AT_KEY = "tabDomainMapUpdatedAt";

export function getDomainFromUrl(url) {
  if (!url || typeof url !== "string") {
    return "";
  }

  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return "";
    }

    return parsed.hostname.toLowerCase();
  } catch {
    return "";
  }
}

export async function getTabDomainMap() {
  const data = await storageGet("local", { [TAB_DOMAIN_MAP_KEY]: {} });
  return data[TAB_DOMAIN_MAP_KEY] || {};
}

export async function setTabDomainMap(map) {
  await storageSet("local", {
    [TAB_DOMAIN_MAP_KEY]: map,
    [TAB_MAP_UPDATED_AT_KEY]: Date.now(),
  });
  return map;
}

export async function rebuildTabDomainMap() {
  const tabs = await chrome.tabs.query({});
  const map = {};

  for (const tab of tabs) {
    if (typeof tab.id !== "number") {
      continue;
    }

    const domain = getDomainFromUrl(tab.url || "");
    if (!domain) {
      continue;
    }

    map[String(tab.id)] = domain;
  }

  await setTabDomainMap(map);
  return map;
}

export async function updateTabDomain(tabId, url) {
  if (typeof tabId !== "number") {
    return null;
  }

  const domain = getDomainFromUrl(url || "");
  const map = await getTabDomainMap();

  if (domain) {
    map[String(tabId)] = domain;
  } else {
    delete map[String(tabId)];
  }

  await setTabDomainMap(map);

  return domain;
}

export async function removeTabFromMap(tabId) {
  if (typeof tabId !== "number") {
    return null;
  }

  const key = String(tabId);
  const map = await getTabDomainMap();
  const removedDomain = map[key] || "";
  delete map[key];
  await setTabDomainMap(map);
  return removedDomain;
}

export async function getDomainForTab(tabId) {
  if (typeof tabId !== "number") {
    return "";
  }

  const key = String(tabId);
  const map = await getTabDomainMap();

  if (map[key]) {
    return map[key];
  }

  const rebuilt = await rebuildTabDomainMap();
  return rebuilt[key] || "";
}

export async function domainHasOpenTabs(domain, excludedTabId = null) {
  if (!domain) {
    return false;
  }

  const tabs = await chrome.tabs.query({});

  return tabs.some((tab) => {
    if (typeof excludedTabId === "number" && tab.id === excludedTabId) {
      return false;
    }

    const tabDomain = getDomainFromUrl(tab.url || "");
    return tabDomain === domain;
  });
}
