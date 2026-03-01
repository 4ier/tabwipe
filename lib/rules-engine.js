import { storageGet, storageSet } from "./storage.js";

const RULES_KEY = "proRules";

const DEFAULT_RULES = {
  wildcardPatterns: [],
  regexPatterns: [],
  keepSessionCookies: false,
  deleteTrackingCookiesOnly: false,
  scheduledCleaningDays: 0,
  perCookieAllowlist: {},
};

function cleanPatternList(list) {
  if (!Array.isArray(list)) {
    return [];
  }

  return Array.from(
    new Set(
      list
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean)
    )
  );
}

function normalizeAllowlist(raw) {
  if (!raw || typeof raw !== "object") {
    return {};
  }

  const normalized = {};

  for (const [domain, names] of Object.entries(raw)) {
    const key = domain.trim().toLowerCase();
    if (!key) {
      continue;
    }

    normalized[key] = cleanPatternList(names);
  }

  return normalized;
}

export function normalizeRules(raw) {
  const base = raw || {};

  return {
    wildcardPatterns: cleanPatternList(base.wildcardPatterns),
    regexPatterns: cleanPatternList(base.regexPatterns),
    keepSessionCookies: Boolean(base.keepSessionCookies),
    deleteTrackingCookiesOnly: Boolean(base.deleteTrackingCookiesOnly),
    scheduledCleaningDays: Math.max(0, Number(base.scheduledCleaningDays) || 0),
    perCookieAllowlist: normalizeAllowlist(base.perCookieAllowlist),
  };
}

export async function getRules() {
  const data = await storageGet("sync", { [RULES_KEY]: DEFAULT_RULES });
  return normalizeRules(data[RULES_KEY]);
}

export async function saveRules(rules) {
  const normalized = normalizeRules(rules);
  await storageSet("sync", { [RULES_KEY]: normalized });
  return normalized;
}

function escapeRegex(value) {
  return value.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
}

export function wildcardPatternToRegex(pattern) {
  const source = `^${escapeRegex(pattern).replace(/\*/g, ".*")}$`;
  return new RegExp(source, "i");
}

export function matchesAdvancedDomainRule(domain, rules) {
  if (!domain) {
    return false;
  }

  const normalized = String(domain).toLowerCase();
  const activeRules = normalizeRules(rules);

  for (const pattern of activeRules.wildcardPatterns) {
    try {
      if (wildcardPatternToRegex(pattern).test(normalized)) {
        return true;
      }
    } catch {
      // Ignore invalid wildcard pattern.
    }
  }

  for (const pattern of activeRules.regexPatterns) {
    try {
      if (new RegExp(pattern, "i").test(normalized)) {
        return true;
      }
    } catch {
      // Ignore invalid regex pattern.
    }
  }

  return false;
}

export function isTrackingCookie(cookie) {
  const signature = [cookie?.name, cookie?.domain, cookie?.path]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return /(track|pixel|analytics|analytic|ads?|campaign|fbp|gclid|ga|utm|segment|mixpanel|amplitude)/i.test(signature);
}

function matchesAllowlistedCookie(cookie, domain, allowlist) {
  const normalizedDomain = String(domain || "").toLowerCase();

  for (const [ruleDomain, names] of Object.entries(allowlist)) {
    if (
      normalizedDomain !== ruleDomain &&
      !normalizedDomain.endsWith(`.${ruleDomain}`)
    ) {
      continue;
    }

    if (names.includes(cookie.name)) {
      return true;
    }
  }

  return false;
}

export function shouldDeleteCookie(cookie, domain, rules, cookieAgeDays = 0) {
  const activeRules = normalizeRules(rules);

  if (matchesAllowlistedCookie(cookie, domain, activeRules.perCookieAllowlist)) {
    return false;
  }

  if (activeRules.keepSessionCookies && cookie.session) {
    return false;
  }

  if (activeRules.deleteTrackingCookiesOnly && !isTrackingCookie(cookie)) {
    return false;
  }

  if (activeRules.scheduledCleaningDays > 0 && cookieAgeDays < activeRules.scheduledCleaningDays) {
    return false;
  }

  return true;
}

export function hasAnyAdvancedRule(rules) {
  const activeRules = normalizeRules(rules);
  return (
    activeRules.wildcardPatterns.length > 0 ||
    activeRules.regexPatterns.length > 0 ||
    activeRules.keepSessionCookies ||
    activeRules.deleteTrackingCookiesOnly ||
    activeRules.scheduledCleaningDays > 0 ||
    Object.keys(activeRules.perCookieAllowlist).length > 0
  );
}
