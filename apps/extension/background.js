/**
 * Prism MV3 background service worker.
 *
 * Scope is deliberately narrow (spec §h: "Request the narrowest Chrome
 * permissions"). We never read browsing history or silently monitor pages —
 * we only act when the user explicitly highlights text and picks "Learn with
 * Prism" (context menu) or clicks the toolbar action (side panel).
 */

const API_BASE = 'http://localhost:8787';

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
    fetch(`${API_BASE}${msg.path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(msg.body ?? {}),
    })
      .then((r) => r.json())
      .then((data) => sendResponse({ ok: true, data }))
      .catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true; // keep the message channel open for async response
  }
});
