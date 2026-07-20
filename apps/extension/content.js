/**
 * Prism content script — runs in the page (scoped to <all_urls> per MV3).
 * It does NOT read history or monitor the page. Its only jobs:
 *   1. Surface a small "Learn with Prism" button near the user's selection so
 *      they can explicitly choose what to share (spec §2.2: user highlights).
 *   2. Forward the chosen text to the background SW, which opens the side panel.
 * No data leaves the page except the text the user explicitly clicks to share.
 */

let btn = null;

function clearButton() {
  if (btn) { btn.remove(); btn = null; }
}

function showButton(x, y, text) {
  clearButton();
  btn = document.createElement('button');
  btn.textContent = 'Learn with Prism';
  btn.style.cssText =
    'position:absolute;z-index:2147483647;background:#7c5cff;color:#fff;border:0;' +
    'border-radius:8px;padding:6px 10px;font:600 13px system-ui;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.4)';
  btn.style.left = `${x}px`;
  btn.style.top = `${y + 8}px`;
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    chrome.runtime.sendMessage({ type: 'learn-selection', text });
    clearButton();
  });
  document.body.appendChild(btn);
}

document.addEventListener('mouseup', () => {
  const sel = window.getSelection();
  const text = sel ? sel.toString().trim() : '';
  if (!text) { clearButton(); return; }
  const rect = sel.getRangeAt(0).getBoundingClientRect();
  showButton(rect.left + window.scrollX, rect.top + window.scrollY, text);
});

document.addEventListener('scroll', clearButton, true);
