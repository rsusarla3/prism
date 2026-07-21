import { assessPagePrivacy } from './privacy.js';

/**
 * Prism service worker.
 *
 * Two entry points into the panel: the toolbar icon, and a right-click on a
 * selection. Page text is captured only after a learner invokes Prism and
 * chooses a learning mode.
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
    const selection = {
        text: info.selectionText.slice(0, 4000),
        pageTitle: tab?.title || '',
        pageUrl: tab?.url || '',
        capturedAt: Date.now(),
      };
    await chrome.storage.session.set({ selection, pendingContext: selection });
  } else {
    await chrome.storage.session.remove(['selection', 'pendingContext']);
  }

  if (tab?.windowId) {
    try { await chrome.sidePanel.open({ windowId: tab.windowId }); } catch {}
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'capture-active-tab') return false;
  captureActiveTab().then(sendResponse, (error) => {
    sendResponse({ error: error?.message || 'Page capture failed.' });
  });
  return true;
});

async function captureActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !/^https?:/.test(tab.url || '')) {
    throw new Error('Open a regular HTTP or HTTPS page first.');
  }
  const privacy = assessPagePrivacy(tab.url);
  if (privacy.sensitive) {
    throw new Error(`Prism does not automatically read ${privacy.reason} pages. Highlight only the non-sensitive text you want to analyze.`);
  }

  const frameResults = await chrome.scripting.executeScript({
    target: { tabId: tab.id, allFrames: true },
    func: extractReadablePage,
  });
  const readableFrames = frameResults.map(({ result }) => result).filter((result) => result?.text);
  const main = readableFrames[0];
  const seen = new Set();
  const sections = [];
  for (const frame of readableFrames) {
    const text = frame.text.trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    sections.push(text);
  }
  const text = sections.join('\n\n').slice(0, 30000);
  if (!text) throw new Error('No readable page text was found. Try highlighting the exact section you want Prism to analyze.');

  return {
    source: {
      url: tab.url,
      title: main?.title || tab.title || tab.url,
      language: main?.language || '',
      text,
      capturedAt: new Date().toISOString(),
    },
  };
}

function extractReadablePage() {
  const root = document.querySelector('article, main, [role="main"]') || document.body;
  const excluded = 'nav, aside, footer, form, dialog, [hidden], [aria-hidden="true"], [role="navigation"], [role="banner"], [role="complementary"], .ad, .ads, .advertisement, .cookie, .cookie-banner';
  const selectors = 'h1, h2, h3, h4, p, li, blockquote, pre, code, figcaption, dt, dd, th, td, math, .MathJax, [role="img"][aria-label], canvas[aria-label]';
  const blocks = [...root.querySelectorAll(selectors)]
    .filter((element) => !element.closest(excluded))
    .filter((element) => {
      const style = getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden';
    })
    .map((element) => (element.innerText || element.getAttribute('aria-label') || element.textContent || '').replace(/\s+/g, ' ').trim())
    .filter((text, index, values) => text.length > 1 && values.indexOf(text) === index);
  const fallback = root.innerText.replace(/\s+/g, ' ').trim();
  return {
    title: document.title.trim(),
    language: document.documentElement.lang || navigator.language || '',
    text: (blocks.join('\n\n') || fallback).slice(0, 20000),
  };
}
