import { describe, expect, it } from 'vitest';
import { cleanCapturedText, combineReadableFrames, isLikelyScriptNoise } from '../capture-utils.js';

const ARTICLE = `The U.S. labor market may soon face too few workers.\n\nBaby boomer retirements are expected to reduce labor-force participation.\n\nEmployers may respond by raising wages and investing in training.`;
const CONSENT_CODE = `bi){return a5({msg:"TCF2: CMP not found"},false)} var bl=Math.random()+""; window.addEventListener("message",bf,false); window.__tcfapi(bg,2,be); function bf(bk){ return JSON.parse(bk.data); }`;

describe('extension frame capture cleanup', () => {
  it('recognizes consent and advertising JavaScript as noise', () => {
    expect(isLikelyScriptNoise(CONSENT_CODE)).toBe(true);
    expect(isLikelyScriptNoise('Workers may benefit from stronger wage growth and increased bargaining power.')).toBe(false);
  });

  it('removes script sections while preserving readable article paragraphs', () => {
    const cleaned = cleanCapturedText(`${ARTICLE}\n\n${CONSENT_CODE}`);
    expect(cleaned).toContain('Baby boomer retirements');
    expect(cleaned).not.toContain('__tcfapi');
  });

  it('drops cross-origin ad frames before analysis', () => {
    const combined = combineReadableFrames([
      { frameId: 0, result: { url: 'https://www.cbsnews.com/news/story', title: 'Story', text: ARTICLE } },
      { frameId: 2, result: { url: 'https://pagead2.googlesyndication.com/ad', title: '', text: CONSENT_CODE } },
      { frameId: 3, result: { url: 'https://www.cbsnews.com/embed/context', title: '', text: 'Related reporting explains wage growth in more detail.' } },
    ]);
    expect(combined.text).toContain('labor market');
    expect(combined.text).toContain('Related reporting');
    expect(combined.text).not.toContain('googlesyndication');
    expect(combined.text).not.toContain('__tcfapi');
  });
});
