import { describe, expect, it } from 'vitest';
import { analyzeContent, createLocalQuiz, extractKeyTerms, summarizeText } from '../content-analysis.js';

const ARTICLE = `Compound interest grows money by earning returns on both the original balance and earlier returns.
Compound interest becomes more powerful over long periods. Investors often use diversified index funds for long-term investing.
An index fund may hold many companies, which can reduce company-specific risk. Diversified index funds still carry market risk.
Starting early gives compound interest more time to work. Small regular contributions can meaningfully affect a long-term balance.`;

describe('extension content analysis', () => {
  it('filters filler words and promotes repeated phrases', () => {
    const terms = extractKeyTerms(ARTICLE, { headings: ['How compound interest works'] });
    expect(terms.map((term) => term.term.toLowerCase())).toContain('compound interest');
    expect(terms.map((term) => term.term.toLowerCase())).not.toContain('the');
    expect(terms.map((term) => term.term.toLowerCase())).not.toContain('compound');
    expect(terms.map((term) => term.term.toLowerCase())).not.toContain('interest');
    expect(terms.every((term) => term.term.length >= 3)).toBe(true);
  });

  it('selects concise source sentences for an extractive summary', () => {
    const summary = summarizeText(ARTICLE, { limit: 3 });
    expect(summary).toHaveLength(3);
    expect(summary.join(' ')).toMatch(/compound interest/i);
    expect(summary.every((sentence) => ARTICLE.includes(sentence))).toBe(true);
  });

  it('creates attempt-first quiz items from source concepts', () => {
    const quiz = createLocalQuiz(ARTICLE, { limit: 3 });
    expect(quiz.length).toBeGreaterThan(0);
    expect(quiz[0].options.filter((option) => option.correct)).toHaveLength(1);
    expect(quiz[0].stem).toContain('_____');
  });

  it('returns one reusable analysis object', () => {
    const analysis = analyzeContent(ARTICLE);
    expect(analysis.wordCount).toBeGreaterThan(40);
    expect(analysis.keyTerms.length).toBeGreaterThan(3);
    expect(analysis.summary.length).toBeGreaterThan(0);
  });
});
