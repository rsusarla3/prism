/**
 * Prism MV3 background service worker (minimal base).
 *
 * Narrow permissions only (spec: request the narrowest Chrome permissions).
 * No history access, no content scripts, no page monitoring. The side panel
 * opens when the toolbar icon is clicked; it links to the local web app where
 * both product surfaces (Core + Future) run.
 */

// Open the side panel when the toolbar icon is clicked.
chrome.sidePanel
  ?.setPanelBehavior?.({ openPanelOnActionClick: true })
  .catch(() => {});
