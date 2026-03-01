import { storageGet, storageSet } from "./storage.js";

const LICENSE_STATE_KEY = "licenseState";
const DAY_MS = 24 * 60 * 60 * 1000;

export const LICENSE_CONFIG = {
  endpointUrl: "https://example.com/tabwipe/license/validate",
  trialDays: 7,
};

function now() {
  return Date.now();
}

function baseTrialState() {
  const startedAt = now();
  return {
    licenseKey: "",
    isPro: false,
    status: "trial",
    validationMessage: "",
    lastCheckedAt: 0,
    trialStartedAt: startedAt,
    trialEndsAt: startedAt + LICENSE_CONFIG.trialDays * DAY_MS,
    endpointUrl: LICENSE_CONFIG.endpointUrl,
  };
}

function normalizeLicenseState(raw) {
  const base = raw || {};
  const fallback = baseTrialState();

  return {
    licenseKey: typeof base.licenseKey === "string" ? base.licenseKey : "",
    isPro: Boolean(base.isPro),
    status: typeof base.status === "string" ? base.status : fallback.status,
    validationMessage:
      typeof base.validationMessage === "string" ? base.validationMessage : "",
    lastCheckedAt: Number(base.lastCheckedAt) || 0,
    trialStartedAt: Number(base.trialStartedAt) || fallback.trialStartedAt,
    trialEndsAt: Number(base.trialEndsAt) || fallback.trialEndsAt,
    endpointUrl:
      typeof base.endpointUrl === "string" && base.endpointUrl
        ? base.endpointUrl
        : fallback.endpointUrl,
  };
}

export async function getLicenseState() {
  const data = await storageGet("local", { [LICENSE_STATE_KEY]: null });
  const normalized = normalizeLicenseState(data[LICENSE_STATE_KEY]);

  if (!data[LICENSE_STATE_KEY]) {
    await storageSet("local", { [LICENSE_STATE_KEY]: normalized });
  }

  return normalized;
}

async function setLicenseState(state) {
  const normalized = normalizeLicenseState(state);
  await storageSet("local", { [LICENSE_STATE_KEY]: normalized });
  return normalized;
}

export function getTrialDaysRemaining(state, at = now()) {
  const remainingMs = Math.max(0, (state?.trialEndsAt || 0) - at);
  return Math.ceil(remainingMs / DAY_MS);
}

export function isTrialActive(state, at = now()) {
  return getTrialDaysRemaining(state, at) > 0;
}

export function isProActive(state, at = now()) {
  if (!state) {
    return false;
  }

  return Boolean(state.isPro || isTrialActive(state, at));
}

async function fetchLicenseValidation(licenseKey, endpointUrl) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(endpointUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ licenseKey }),
      signal: controller.signal,
    });

    if (!response.ok) {
      return {
        valid: false,
        message: `Validation failed (${response.status})`,
      };
    }

    const payload = await response.json();
    return {
      valid: Boolean(payload?.valid),
      message:
        typeof payload?.message === "string"
          ? payload.message
          : payload?.valid
            ? "License active"
            : "License invalid",
    };
  } catch (error) {
    return {
      valid: false,
      message:
        error?.name === "AbortError"
          ? "Validation timeout"
          : "License server unreachable",
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function initializeLicense() {
  return getLicenseState();
}

export async function refreshLicenseStatus({ force = false } = {}) {
  const state = await getLicenseState();
  const currentTime = now();

  if (!force && state.lastCheckedAt && currentTime - state.lastCheckedAt < DAY_MS) {
    return state;
  }

  if (!state.licenseKey) {
    const trialStillActive = isTrialActive(state, currentTime);
    const next = {
      ...state,
      isPro: false,
      status: trialStillActive ? "trial" : "expired",
      validationMessage: trialStillActive
        ? "Trial active"
        : "Trial expired. Add a license key to unlock Pro.",
      lastCheckedAt: currentTime,
    };
    return setLicenseState(next);
  }

  const validation = await fetchLicenseValidation(state.licenseKey, state.endpointUrl);
  const trialStillActive = isTrialActive(state, currentTime);

  const next = {
    ...state,
    isPro: validation.valid,
    status: validation.valid ? "pro" : trialStillActive ? "trial" : "expired",
    validationMessage: validation.message,
    lastCheckedAt: currentTime,
  };

  return setLicenseState(next);
}

export async function saveLicenseKey(licenseKey) {
  const state = await getLicenseState();
  const next = {
    ...state,
    licenseKey: String(licenseKey || "").trim(),
  };

  await setLicenseState(next);
  return refreshLicenseStatus({ force: true });
}

export async function clearLicenseKey() {
  const state = await getLicenseState();
  const next = {
    ...state,
    licenseKey: "",
    isPro: false,
    status: isTrialActive(state) ? "trial" : "expired",
    validationMessage: "License removed",
    lastCheckedAt: now(),
  };

  return setLicenseState(next);
}
