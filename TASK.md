# TabWipe — Chrome MV3 Cookie Auto-Delete Extension

## What to build
A Chrome extension (Manifest V3) that automatically deletes cookies when you close a tab, with a whitelist for sites you want to keep logged in.

## Target: Paid conversion
This is a freemium product. Free tier gets core functionality, Pro tier gets power features. Design the architecture so the Pro boundary feels natural, not artificial.

## Architecture

### Core (Free)
- **Tab close → cookie delete**: `chrome.tabs.onRemoved` → check if domain has other open tabs → if not, delete cookies after 5s delay
- **Whitelist**: Per-domain whitelist stored in `chrome.storage.sync` (syncs across devices)
- **Popup UI**: Clean, modern popup showing:
  - Current tab's cookies (count + list)
  - One-click whitelist toggle for current domain
  - Quick stats (cookies deleted today/total)
- **Badge**: Show cookie count on extension icon for current tab
- **Fallback sweep**: `chrome.alarms` every 5 min to catch any cookies missed during SW sleep

### Pro Features (gated, license key validation)
- **Rules engine**: Wildcard patterns (e.g., `*.google.com`), regex support
- **Cookie categories**: Keep session cookies but delete tracking cookies (heuristic-based)
- **Import/Export**: Backup and restore whitelist + rules
- **Scheduled cleaning**: Time-based rules ("delete all cookies older than 7 days")
- **Per-cookie granularity**: Keep specific cookies from a domain while deleting others
- **Statistics dashboard**: Detailed history, charts, tracking cookies blocked

### Technical Requirements
- Manifest V3 only (no MV2 fallback)
- Service worker based (no persistent background)
- All state must survive SW restarts — use `chrome.storage.local` for runtime state, `chrome.storage.sync` for user config
- Rebuild open-tab tracking from `chrome.tabs.query({})` on SW wake, never rely on in-memory state
- Zero external dependencies for core (no React, no build step for MVP)
- Clean vanilla JS + CSS, dark/light mode support

### Pro License System
- Simple license key validation against a remote endpoint (stub it with a config URL)
- Store license status in `chrome.storage.local`
- Grace period: 7-day free trial of Pro features
- License check on install + every 24h

### File Structure
```
tabwipe/
├── manifest.json
├── background.js          # Service worker: tab events, cookie cleanup, alarms
├── popup/
│   ├── popup.html
│   ├── popup.js
│   └── popup.css
├── options/
│   ├── options.html       # Full settings page
│   ├── options.js
│   └── options.css
├── lib/
│   ├── cookie-manager.js  # Cookie CRUD operations
│   ├── tab-tracker.js     # Track open domains
│   ├── whitelist.js       # Whitelist management
│   ├── rules-engine.js    # Pro: advanced rules
│   ├── license.js         # Pro: license validation
│   └── stats.js           # Statistics tracking
├── icons/                 # 16, 32, 48, 128px icons (use simple placeholder SVGs)
└── README.md
```

### UI/UX
- Popup: 350px wide, max 500px tall
- Color scheme: Primary blue (#2563EB), clean whites, subtle grays
- Dark mode: auto-detect system preference
- Animations: subtle transitions, nothing flashy
- Typography: system font stack
- Pro features: visible but grayed out with "Pro" badge and upgrade CTA

### Landing Page
Also create a simple `docs/index.html` landing page:
- Hero: "Your cookies, your rules"
- Feature comparison (Free vs Pro)
- Privacy-first messaging
- Chrome Web Store install button (placeholder URL)
- Clean, modern design, single page, no framework

## Quality Bar
- Must load in < 100ms
- Popup must render instantly
- Cookie cleanup must complete within 1 second of tab close
- No console errors
- All Pro features properly gated

When completely finished, run: openclaw system event --text "Done: TabWipe MVP complete — Chrome MV3 cookie auto-delete extension with free/pro tiers, popup UI, options page, and landing page" --mode now
