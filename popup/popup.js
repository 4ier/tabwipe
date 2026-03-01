function sendMessage(message) {
  return chrome.runtime.sendMessage(message);
}

function formatCookieMeta(cookie) {
  const parts = [];
  parts.push(cookie.session ? "session" : "persistent");
  parts.push(cookie.secure ? "secure" : "insecure");
  if (cookie.sameSite) {
    parts.push(`SameSite ${cookie.sameSite}`);
  }
  return parts.join(" · ");
}

function setLicenseBadge(license) {
  const badge = document.getElementById("licenseBadge");
  if (license?.status === "pro") {
    badge.textContent = "Pro";
    return;
  }

  if ((license?.trialDaysRemaining || 0) > 0) {
    badge.textContent = `Trial ${license.trialDaysRemaining}d`;
    return;
  }

  badge.textContent = "Free";
}

function renderCookies(cookies) {
  const list = document.getElementById("cookieList");
  list.innerHTML = "";

  if (!cookies || cookies.length === 0) {
    const empty = document.createElement("li");
    empty.className = "muted";
    empty.textContent = "No cookies found for this tab.";
    list.appendChild(empty);
    return;
  }

  const fragment = document.createDocumentFragment();

  for (const cookie of cookies) {
    const item = document.createElement("li");
    item.className = "cookie-item";

    const name = document.createElement("span");
    name.className = "name";
    name.textContent = cookie.name;

    const meta = document.createElement("span");
    meta.className = "meta";
    meta.textContent = formatCookieMeta(cookie);

    item.appendChild(name);
    item.appendChild(meta);
    fragment.appendChild(item);
  }

  list.appendChild(fragment);
}

function updateWhitelistButton(domain, whitelisted) {
  const button = document.getElementById("whitelistToggle");
  button.disabled = !domain;
  button.textContent = whitelisted ? "Remove from whitelist" : "Add to whitelist";
}

async function loadPopupData() {
  const response = await sendMessage({ type: "getPopupData" });

  if (!response?.ok) {
    throw new Error(response?.error || "Failed to load popup data");
  }

  const data = response.data;
  document.getElementById("domainLabel").textContent = data.domain || "No active website";
  document.getElementById("cookieCount").textContent = String(data.cookieCount || 0);
  document.getElementById("todayDeleted").textContent = String(data.stats?.todayDeleted || 0);
  document.getElementById("totalDeleted").textContent = String(data.stats?.totalDeleted || 0);

  setLicenseBadge(data.license);
  updateWhitelistButton(data.domain, data.whitelisted);
  renderCookies(data.cookies || []);

  return data;
}

document.addEventListener("DOMContentLoaded", async () => {
  let popupData = null;

  try {
    popupData = await loadPopupData();
  } catch (error) {
    document.getElementById("domainLabel").textContent = error.message;
  }

  const whitelistToggle = document.getElementById("whitelistToggle");
  whitelistToggle.addEventListener("click", async () => {
    if (!popupData?.domain) {
      return;
    }

    whitelistToggle.disabled = true;

    try {
      const response = await sendMessage({
        type: "toggleWhitelist",
        domain: popupData.domain,
      });

      if (!response?.ok) {
        throw new Error(response?.error || "Whitelist update failed");
      }

      popupData.whitelisted = response.data.whitelisted;
      updateWhitelistButton(popupData.domain, popupData.whitelisted);
    } catch (error) {
      document.getElementById("domainLabel").textContent = error.message;
    } finally {
      whitelistToggle.disabled = false;
    }
  });

  document.getElementById("openOptions").addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });
});
