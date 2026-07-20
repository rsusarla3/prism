/**
 * Prism MV3 background service worker.
 *
 * Scope is deliberately narrow (spec §h: "Request the narrowest Chrome
 * permissions"). We never read browsing history or silently monitor pages —
 * we only act when the user explicitly highlights text and picks "Learn with
 * Prism" (context menu) or clicks the toolbar action (side panel).
 */

// Backend host. Defaults to the host laptop at localhost; on a teammate's
// machine, set this to the host's hotspot IP, e.g. http://172.20.10.2:8787
// (see docs/prism/LAN_SETUP.md). Resolved live from storage on each call so it
// can be changed without reloading the worker.
const DEFAULT_API_BASE = 'http://localhost:8787';

async function getApiBase() {
  try {
    const s = await chrome.storage.local.get('apiBase');
    return s.apiBase || DEFAULT_API_BASE;
  } catch {
    return DEFAULT_API_BASE;
  }
}

// Open the side panel when the toolbar icon is clicked.
chrome.sidePanel
  ?.setPanelBehavior?.({ openPanelOnActionClick: true })
  .catch(() => {});

// Context-menu entry for highlighted text.
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'learn-with-prism',
    title: 'Learn with Prism',
    contexts: ['selection'],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'learn-with-prism' && info.selectionText) {
    const text = info.selectionText;
    // Open the side panel for the active tab, then hand it the selection.
    chrome.sidePanel?.open?.({ tabId: tab?.id }).catch(() => {});
    chrome.storage.session.set({ pendingSelection: text, surface: 'school' });
    broadcast({ type: 'selection', text });
  }
});

function broadcast(msg) {
  chrome.runtime.sendMessage(msg).catch(() => {});
}

// Proxy API calls from the side panel (keeps fetch in the SW, not content page).
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'api') {
    getApiBase().then((base) => {
      fetch(`${base}${msg.path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(msg.body ?? {}),
      })
        .then((r) => r.json())
        .then((data) => sendResponse({ ok: true, data }))
        .catch((e) => sendResponse({ ok: false, error: String(e) }));
    });
    return true; // keep the message channel open for async response
  }
  // Content script forwards a highlight; open the panel and share the text.
  if (msg?.type === 'learn-selection' && msg.text) {
    chrome.sidePanel?.open?.({}).catch(() => {});
    chrome.storage.session.set({ pendingSelection: msg.text, surface: 'school' });
    broadcast({ type: 'selection', text: msg.text });
    return false;
  }
});
