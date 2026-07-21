/**
 * Prism service worker.
 *
 * Two entry points into the panel: the toolbar icon, and a right-click on a
 * selection. Nothing is read here — the panel reads the active tab only when
 * the user picks a way.
 */

const MENU = 'prism-open';

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() =>
    chrome.contextMenus.create({
      id: MENU,
      title: 'Refract this page with Prism',
      contexts: ['page', 'selection'],
    })
  );
});

chrome.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: true }).catch(() => {});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU) return;

  // Keep any selection around — the panel prefers it over the whole page.
  if (info.selectionText) {
    await chrome.storage.session.set({
      selection: {
        text: info.selectionText.slice(0, 4000),
        pageUrl: tab?.url || '',
        capturedAt: Date.now(),
      },
    });
  } else {
    await chrome.storage.session.remove('selection');
  }

  if (tab?.windowId) {
    try { await chrome.sidePanel.open({ windowId: tab.windowId }); } catch {}
  }
});
