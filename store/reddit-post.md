# Reddit Launch Posts

## r/chrome — Primary Launch

**Title:** I built TabWipe — the MV3 replacement for Cookie AutoDelete

**Body:**

Like many of you, I relied on Cookie AutoDelete for years. When Chrome killed MV2, CAD died with it — their own README says "MV3 makes this extension impossible as designed."

So I built TabWipe from scratch for MV3.

**How it works:**
- Close a tab → TabWipe checks if you still have that site open in another tab
- If not → cookies for that domain are automatically deleted after a 5-second delay
- Whitelist the sites you want to stay logged into (synced across devices)

**What's different from CAD?**
- Built ground-up for MV3 (service worker, not background page)
- Doesn't rely on in-memory state that dies when the service worker sleeps
- Rebuilds tab tracking from `chrome.tabs.query()` every time, so nothing gets lost
- `chrome.alarms` fallback sweep every 5 min catches anything the primary cleanup misses

**Free:**
- Auto cookie cleanup on tab close
- Per-domain whitelist
- Live cookie count badge
- Quick stats

**Pro ($3.99):**
- Wildcard/regex rules
- Tracking cookie detection  
- Scheduled cleanup
- Import/export config

Open source: https://github.com/4ier/tabwipe
Privacy policy: https://4ier.github.io/tabwipe/privacy.html

Chrome Web Store: [LINK]

Happy to answer any technical questions about how it handles MV3 limitations.

---

## r/privacy — Privacy Angle

**Title:** Open-source Chrome extension that auto-deletes cookies when you close tabs (MV3, zero data collection)

**Body:**

Cookie AutoDelete is dead on Chrome (MV3 killed it). I built an open-source replacement called TabWipe.

- Close tab → cookies deleted automatically
- Whitelist sites you trust
- Zero analytics, zero telemetry, zero phone-home
- All data stays in your browser
- Source code: https://github.com/4ier/tabwipe

Chrome Web Store: [LINK]

It's not a silver bullet for privacy, but it's one less thing tracking you across the web.

---

## r/webdev — Technical Angle  

**Title:** Building a Chrome MV3 extension that CAD said was "impossible" — here's how

**Body:**

Cookie AutoDelete's README famously says "MV3 makes this extension impossible as designed." After digging into it, I realized the key word is "as designed" — their architecture relied on persistent background pages and in-memory state.

The MV3-native approach is simpler:

1. `chrome.tabs.onRemoved` — event-driven, wakes the service worker
2. `chrome.tabs.query({})` — rebuild state from scratch, never trust memory
3. `chrome.cookies.getAll()` + `chrome.cookies.remove()` — fully supported in MV3
4. `chrome.alarms` — reliable scheduling that survives SW death
5. `chrome.storage.local` — persistent state, no memory dependency

The whole core is ~500 lines. Service worker goes to sleep? Fine, everything rebuilds on wake.

Open source if you want to see the implementation: https://github.com/4ier/tabwipe
