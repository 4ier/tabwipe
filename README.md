# 🧹 TabWipe

**Auto-delete cookies when you close tabs.** The MV3 replacement for Cookie AutoDelete.

[![Chrome Web Store](https://img.shields.io/badge/Chrome%20Web%20Store-Install-blue?logo=googlechrome)](https://chrome.google.com/webstore)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/4ier/tabwipe)](https://github.com/4ier/tabwipe/stargazers)

## Why?

[Cookie AutoDelete](https://github.com/nicolecomputer/cookie-autodelete) was the go-to extension for automatic cookie cleanup. When Chrome killed Manifest V2, CAD died with it — their README literally says *"MV3 makes this extension impossible as designed."*

TabWipe is built from scratch for MV3. No legacy code, no workarounds.

## How it works

1. **Close a tab** → TabWipe checks if you still have that domain open in another tab
2. **No other tabs?** → Cookies for that domain are automatically deleted after a 5-second delay
3. **Whitelisted?** → Cookies are kept safe

That's it. Simple, reliable, private.

## Technical approach

The key insight: CAD's architecture was "impossible" to port because it relied on persistent background pages and in-memory state. TabWipe takes a different approach:

- **`chrome.tabs.onRemoved`** — Event-driven, wakes the service worker on tab close
- **`chrome.tabs.query({})`** — Rebuilds state from scratch every time, never trusts memory
- **`chrome.alarms`** — Fallback sweep every 5 min catches anything missed during SW sleep
- **`chrome.storage`** — All config persists across SW restarts

Core logic is ~500 lines. Service worker goes to sleep? Fine, everything rebuilds on wake.

## Features

### Free
- ✅ Auto-delete cookies on tab close
- ✅ Per-domain whitelist (synced across devices)
- ✅ Live cookie count badge
- ✅ Deletion statistics
- ✅ Dark/light mode

### Pro ($3.99 one-time)
- ✅ Wildcard & regex domain rules
- ✅ Smart tracking cookie detection
- ✅ Per-cookie granularity
- ✅ Scheduled cleanup (age-based rules)
- ✅ Import/export configuration
- ✅ Detailed statistics dashboard

## Install

### Chrome Web Store
[Install TabWipe →](https://chrome.google.com/webstore) *(link coming soon)*

### From source
```bash
git clone https://github.com/4ier/tabwipe.git
```
1. Open `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked" → select the `tabwipe` folder

## Privacy

**Zero data collection.** No analytics, no telemetry, no phone-home. All data stays in your browser. [Full privacy policy →](https://4ier.github.io/tabwipe/privacy.html)

## Project structure

```
tabwipe/
├── manifest.json          # MV3 manifest
├── background.js          # Service worker (~540 lines)
├── lib/
│   ├── cookie-manager.js  # Cookie CRUD
│   ├── tab-tracker.js     # Open tab → domain mapping
│   ├── whitelist.js       # Whitelist management
│   ├── rules-engine.js    # Pro: advanced rules
│   ├── license.js         # Pro: license validation
│   ├── stats.js           # Deletion statistics
│   └── storage.js         # Storage abstraction
├── popup/                 # Extension popup UI
├── options/               # Settings page
└── docs/                  # Landing page (GitHub Pages)
```

## License

MIT
