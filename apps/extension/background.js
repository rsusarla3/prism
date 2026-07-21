import { assessPagePrivacy } from './privacy.js';
import { combineReadableFrames } from './capture-utils.js';

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
  if (!tab?.id || (tab.url && !/^https?:/.test(tab.url))) {
    throw new Error('Open a regular HTTP or HTTPS page first.');
  }
  const knownPrivacy = tab.url ? assessPagePrivacy(tab.url) : { sensitive: false, reason: '' };
  if (knownPrivacy.sensitive) {
    throw new Error(`Prism does not automatically read ${knownPrivacy.reason} pages. Highlight only the non-sensitive text you want to analyze.`);
  }

  const frameResults = await chrome.scripting.executeScript({
    target: { tabId: tab.id, allFrames: true },
    func: extractReadablePage,
  });
  const { main, text } = combineReadableFrames(frameResults, tab.url);
  const pageUrl = main?.url || tab.url;
  if (!pageUrl || !/^https?:/.test(pageUrl)) throw new Error('Open a regular HTTP or HTTPS page first.');
  const privacy = assessPagePrivacy(pageUrl);
  if (privacy.sensitive) throw new Error(`Prism does not automatically read ${privacy.reason} pages. Highlight only the non-sensitive text you want to analyze.`);
  if (!text) throw new Error('No readable page text was found. Try highlighting the exact section you want Prism to analyze.');

  return {
    source: {
      url: pageUrl,
      title: main?.title || tab.title || tab.url,
      language: main?.language || '',
      text,
      capturedAt: new Date().toISOString(),
    },
  };
}

function extractReadablePage() {
  const candidates = [...document.querySelectorAll('article, main, [role="main"]')];
  const root = candidates.sort((a, b) => readableScore(b) - readableScore(a))[0] || document.body;
  const excluded = 'nav, aside, footer, form, dialog, [hidden], [aria-hidden="true"], [role="navigation"], [role="banner"], [role="complementary"], .ad, .ads, .advertisement, .cookie, .cookie-banner';
  const selectors = 'h1, h2, h3, h4, p, li, blockquote, pre, code, figcaption, dt, dd, th, td, math, .MathJax, [role="img"][aria-label], canvas[aria-label]';
  const blocks = [...root.querySelectorAll(selectors)]
    .filter((element) => !element.closest(excluded))
    .filter((element) => {
      const style = getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden';
    })
    .map((element) => (element.innerText || element.getAttribute('aria-label') || element.textContent || '').replace(/\s+/g, ' ').trim())
    .filter((text, index, values) => text.length > 1 && values.indexOf(text) === index)
    .filter((text) => !looksLikeScript(text));
  const fallback = root.innerText.replace(/\s+/g, ' ').trim();
  return {
    url: location.href,
    title: document.title.trim(),
    language: document.documentElement.lang || navigator.language || '',
    text: (blocks.join('\n\n') || fallback).slice(0, 20000),
  };

  function readableScore(element) {
    return [...element.querySelectorAll('p, li')]
      .filter((node) => !node.closest('nav, aside, footer, form, [hidden], [aria-hidden="true"]'))
      .reduce((score, node) => score + ((node.innerText || '').trim().split(/\s+/g).length >= 8 ? (node.innerText || '').length : 0), 0);
  }

  function looksLikeScript(text) {
    const tokens = text.match(/(?:\bfunction\b|\btypeof\b|\breturn\b|\bvar\b|window\.|document\.|localStorage|addEventListener|postMessage|JSON\.(?:parse|stringify)|__tcfapi|__gpp|recaptcha|googlesyndication)/gi)?.length || 0;
    const punctuation = text.match(/[{}[\]();=<>]/g)?.length || 0;
    const ratio = punctuation / Math.max(text.length, 1);
    return tokens >= 3 || (tokens >= 1 && ratio > 0.045) || ratio > 0.11;
  }
}
