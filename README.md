# TabWipe

TabWipe is a Chrome Manifest V3 extension that automatically deletes cookies when the last tab for a domain is closed, while letting users keep trusted domains in a whitelist.

## Features

### Free (Core)
- Auto-delete cookies on tab close (`5s` delay)
- Domain whitelist synced with `chrome.storage.sync`
- Popup UI with:
  - active tab cookie count/list
  - one-click whitelist toggle
  - quick stats (today + total deleted)
- Badge count for active tab cookies
- Fallback sweep (`chrome.alarms` every 5 minutes)

### Pro (Gated)
- Wildcard + regex rules
- Cookie-category heuristics (tracking-only cleanup)
- Import/export settings
- Scheduled cleanup age rules
- Per-cookie allowlist
- Detailed cleanup history dashboard

## Technical Notes
- Manifest V3 service worker (`background.js`)
- Runtime state in `chrome.storage.local`
- User config in `chrome.storage.sync`
- Open-tab domain map rebuilt via `chrome.tabs.query({})` on service worker start
- License status checked on install/startup and every 24h
- 7-day Pro trial included

## Load Unpacked Extension
1. Open Chrome and navigate to `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this project directory (`tabwipe/`).

## Project Structure

```
tabwipe/
├── manifest.json
├── background.js
├── popup/
│   ├── popup.html
│   ├── popup.js
│   └── popup.css
├── options/
│   ├── options.html
│   ├── options.js
│   └── options.css
├── lib/
│   ├── cookie-manager.js
│   ├── tab-tracker.js
│   ├── whitelist.js
│   ├── rules-engine.js
│   ├── license.js
│   ├── stats.js
│   └── storage.js
├── icons/
│   ├── icon-template.svg
│   ├── icon16.svg
│   ├── icon32.svg
│   ├── icon48.svg
│   ├── icon128.svg
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   └── icon128.png
└── docs/
    └── index.html
```

## License Endpoint Stub
The Pro validation endpoint is configurable in `lib/license.js` via `LICENSE_CONFIG.endpointUrl`.

