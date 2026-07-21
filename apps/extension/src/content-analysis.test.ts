import { describe, expect, it } from 'vitest';
import { analyzeContent, createLocalQuiz, extractKeyTerms, isLikelyMetadataSentence, summarizeText } from '../content-analysis.js';

const ARTICLE = `Compound interest grows money by earning returns on both the original balance and earlier returns.
Compound interest becomes more powerful over long periods. Investors often use diversified index funds for long-term investing.
An index fund may hold many companies, which can reduce company-specific risk. Diversified index funds still carry market risk.
Starting early gives compound interest more time to work. Small regular contributions can meaningfully affect a long-term balance.`;

const PHOTOSYNTHESIS = `Photosynthesis lets plants convert light energy into chemical energy stored in glucose.
Chlorophyll absorbs light energy inside chloroplasts. During photosynthesis, plants use carbon dioxide and water to form glucose and oxygen.
Light-dependent reactions capture energy, while the Calvin cycle helps assemble sugar molecules. Chloroplasts contain the structures needed for these reactions.
The rate of photosynthesis changes with light intensity, carbon dioxide concentration, and temperature. Plants use the glucose produced by photosynthesis for growth and cellular respiration.`;

const SPANISH_ARTICLE = `La fotosíntesis permite que las plantas conviertan la energía de la luz en energía química.
Las plantas usan dióxido de carbono y agua durante la fotosíntesis. La clorofila absorbe la luz dentro de los cloroplastos.
La fotosíntesis produce glucosa y oxígeno. Los cloroplastos contienen las estructuras necesarias para estas reacciones.`;

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

  it('preserves paragraph boundaries and excludes standalone headings from summaries', () => {
    const page = `Labor shortage outlook\n\nJuly 20, 2026 / CBS News\n\nEmployers may face a severe labor shortage over the next fifteen years.\n\nBaby boomer retirements will coincide with smaller groups of young workers entering the labor market.\n\nFewer available workers could improve wage growth and working conditions.`;
    const summary = summarizeText(page, { headings: ['Labor shortage outlook'], limit: 8 });
    expect(summary).not.toContain('Labor shortage outlook');
    expect(summary[0]).not.toContain('Labor shortage outlook July');
    expect(summary).toContain('Employers may face a severe labor shortage over the next fifteen years.');
  });

  it('removes news datelines and does not quiz the same sentence repeatedly', () => {
    const news = `Labor shortage outlook\n\nJuly 20, 2026 / 10:36 AM EDT / CBS News\n\nA severe labor shortage could emerge as baby boomers retire.\n\nEmployers may raise wages when fewer qualified workers are available.\n\nArtificial intelligence may help firms maintain productivity with fewer workers.`;
    expect(isLikelyMetadataSentence('July 20, 2026 / 10:36 AM EDT / CBS News')).toBe(true);
    const analysis = analyzeContent(news, { headings: ['Labor shortage outlook'] });
    const quiz = createLocalQuiz(news, { headings: ['Labor shortage outlook'], limit: 5 });
    expect(analysis.summary.join(' ')).not.toMatch(/July 20|CBS News/);
    expect(analysis.keyTerms.map((term) => term.term).join(' ')).not.toMatch(/CBS News/);
    expect(new Set(quiz.map((item) => item.explanation)).size).toBe(quiz.length);
    expect(quiz.map((item) => item.stem).join(' ')).not.toMatch(/July 20|CBS News/);
  });

  it('ranks substantive news concepts above vague words and publication metadata', () => {
    const article = `Labor shortage outlook\n\nJuly 20, 2026 / 10:36 AM EDT / CBS News\n\nA severe labor shortage could emerge as baby boomers retire from the labor force.\n\nThe labor market will have fewer young workers entering available jobs.\n\nA smaller labor force could lead employers to offer higher wages and stronger wage growth.\n\nArtificial intelligence may help companies maintain productivity, while skilled trades remain essential.\n\nBaby boomer retirements and a shrinking workforce could increase demand for young workers.`;
    const terms = extractKeyTerms(article, { headings: ['Labor shortage outlook'], limit: 12 }).map((term) => term.term.toLocaleLowerCase());
    expect(terms.join(' ')).toMatch(/labor shortage|labor force|labor market|baby boomer|wage growth/);
    expect(terms).not.toContain('people');
    expect(terms).not.toContain('going');
    expect(terms.join(' ')).not.toMatch(/cbs news/);
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

  it('adapts every local feature to an unrelated current page', () => {
    const result = analyzeContent(PHOTOSYNTHESIS, { headings: ['How photosynthesis works'] });
    const terms = result.keyTerms.map((term) => term.term.toLowerCase());
    const quiz = createLocalQuiz(PHOTOSYNTHESIS, { headings: ['How photosynthesis works'] });
    expect(result.summary.every((sentence) => PHOTOSYNTHESIS.includes(sentence))).toBe(true);
    expect(terms.join(' ')).toMatch(/photosynthesis|chloroplast/);
    expect(terms.join(' ')).not.toMatch(/compound interest|investing|linear growth/);
    expect(quiz.every((item) => PHOTOSYNTHESIS.includes(item.explanation))).toBe(true);
  });

  it('filters common words in the language of the current page', () => {
    const result = analyzeContent(SPANISH_ARTICLE, { language: 'es-MX' });
    const terms = result.keyTerms.map((term) => term.term.toLowerCase());
    expect(result.language).toBe('es');
    expect(terms).not.toContain('las');
    expect(terms).not.toContain('para');
    expect(terms.join(' ')).toMatch(/fotosíntesis|cloroplastos/);
  });

  it('segments and analyzes a Mandarin page instead of injecting demo topics', () => {
    const chinese = `光合作用让植物把光能转化为储存在葡萄糖中的化学能。叶绿素在叶绿体中吸收光能。植物在光合作用中使用二氧化碳和水，并产生葡萄糖和氧气。光合作用的速度会受到光照强度、二氧化碳浓度和温度的影响。`;
    const result = analyzeContent(chinese, { language: 'zh-CN' });
    expect(result.language).toBe('zh');
    expect(result.sentences.length).toBeGreaterThan(2);
    expect(result.keyTerms.length).toBeGreaterThan(0);
    expect(result.keyTerms.map((term) => term.term).join(' ')).not.toMatch(/interest|investing|linear/i);
  });
});
