import type { StudyBundle } from 'prism-shared';

export interface ValidationIssue {
  path: string;
  rule: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

type Check = (bundle: StudyBundle) => ValidationIssue[];

export function checkQuizOptionFeedback(bundle: StudyBundle): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  bundle.quiz.items.forEach((item, i) => item.options.forEach((option, j) => {
    if (!option.feedback.trim()) issues.push(issue(`quiz.items[${i}].options[${j}].feedback`, 'quiz-option-feedback-required', 'Every quiz option must have non-empty feedback.'));
  }));
  return issues;
}

export function checkQuizHasTransferItem(bundle: StudyBundle): ValidationIssue[] {
  return bundle.quiz.items.some((item) => item.kind === 'transfer')
    ? [] : [issue('quiz.items', 'quiz-transfer-item-required', "At least one quiz item must have kind: 'transfer'.")];
}

export function checkWatchAltText(bundle: StudyBundle): ValidationIssue[] {
  return bundle.watch.altText.trim() ? [] : [issue('watch.altText', 'watch-alt-text-required', 'watch.altText must be a non-empty string.')];
}

export function checkDroppedForCoherencePresent(bundle: StudyBundle): ValidationIssue[] {
  return Array.isArray(bundle.meta.droppedForCoherence) ? [] : [issue('meta.droppedForCoherence', 'meta-dropped-for-coherence-required', 'meta.droppedForCoherence must be present and be an array.')];
}

export function checkStructuralSanity(bundle: StudyBundle): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (bundle.read.segments.length === 0) issues.push(issue('read.segments', 'read-segments-non-empty', 'read.segments must be a non-empty array.'));
  bundle.read.segments.forEach((segment, i) => {
    if (!segment.text.trim()) issues.push(issue(`read.segments[${i}].text`, 'read-segment-text-required', 'Each read segment must have non-empty text.'));
    if (!segment.recap.trim()) issues.push(issue(`read.segments[${i}].recap`, 'read-segment-recap-required', 'Each read segment must have a non-empty recap.'));
  });
  if (bundle.quiz.items.length === 0) issues.push(issue('quiz.items', 'quiz-items-non-empty', 'quiz.items must be a non-empty array.'));
  bundle.quiz.items.forEach((item, i) => {
    if (item.options.length < 2) issues.push(issue(`quiz.items[${i}].options`, 'quiz-item-min-two-options', 'Each quiz item must have at least two options.'));
    const correctCount = item.options.filter((option) => option.correct).length;
    if (correctCount !== 1) issues.push(issue(`quiz.items[${i}].options`, 'quiz-item-exactly-one-correct', `Each quiz item must have exactly one correct option (found ${correctCount}).`));
  });
  if (!bundle.listen.script.trim()) issues.push(issue('listen.script', 'listen-script-required', 'listen.script must be a non-empty string.'));
  if (bundle.listen.highlightLeadMs !== 300) issues.push(issue('listen.highlightLeadMs', 'listen-highlight-lead-ms-valid', 'listen.highlightLeadMs must equal 300.'));
  if (bundle.watch.steps.length === 0) issues.push(issue('watch.steps', 'watch-steps-non-empty', 'watch.steps must be a non-empty array.'));
  return issues;
}

export function checkExploreDataFinite(bundle: StudyBundle): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  bundle.explore.data?.series.forEach((series, i) => series.points.forEach((point, j) => {
    if (!Number.isFinite(point.y)) issues.push(issue(`explore.data.series[${i}].points[${j}].y`, 'explore-data-point-finite', 'Explore data point y values must be finite.'));
  }));
  return issues;
}

export function checkContractValues(bundle: StudyBundle): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!['narrative', 'expository', 'problem', 'data'].includes(bundle.meta.contentType)) {
    issues.push(issue('meta.contentType', 'invalid-content-type', 'meta.contentType is not supported.'));
  }
  if (!Number.isInteger(bundle.meta.inferredGrade) || bundle.meta.inferredGrade < 1 || bundle.meta.inferredGrade > 12) {
    issues.push(issue('meta.inferredGrade', 'invalid-inferred-grade', 'meta.inferredGrade must be an integer from 1 through 12.'));
  }
  if (!['diagram', 'sequence'].includes(bundle.watch.kind)) {
    issues.push(issue('watch.kind', 'invalid-watch-kind', 'watch.kind must be diagram or sequence.'));
  }
  bundle.listen.segmentIndex.forEach((index, i) => {
    if (!Number.isInteger(index) || index < 0 || index >= bundle.read.segments.length) {
      issues.push(issue(`listen.segmentIndex[${i}]`, 'invalid-segment-index', 'Each listen segment index must reference an existing read segment.'));
    }
  });
  bundle.quiz.items.forEach((item, i) => {
    if (!['recall', 'transfer'].includes(item.kind)) issues.push(issue(`quiz.items[${i}].kind`, 'invalid-quiz-kind', 'Quiz kind must be recall or transfer.'));
  });
  return issues;
}

/**
 * Numbers plotted in explore.data are DATA — they are read as quantities, so an
 * invented one is a factual error. Scoped deliberately to that block only.
 *
 * Scanning prose instead (recaps, quiz options, captions) produced false
 * failures on correct bundles: quiz distractors must contain numbers absent
 * from the source (that is what makes them distractors), and recaps legitimately
 * re-express "82,500" as "82.5 thousand". The arithmetic guarantee the spec
 * actually promises is enforced by packages/verifiers, not by string matching.
 */
export function checkNumberProvenance(bundle: StudyBundle, sourceText: string): ValidationIssue[] {
  if (!sourceText.trim()) return [];
  const sourceNumbers = new Set(extractNumbers(sourceText));
  const issues: ValidationIssue[] = [];
  bundle.explore.data?.series.forEach((series, i) => series.points.forEach((point, j) => {
    for (const number of extractNumbers(String(point.y))) {
      if (!sourceNumbers.has(number)) {
        issues.push(issue(`explore.data.series[${i}].points[${j}].y`, 'number-source-required', `Number ${number} does not appear in the source text.`));
      }
    }
  }));
  return issues;
}

/**
 * Runaway gloss ceiling. The prompt asks for <= 12 words because a gloss has to
 * be readable without losing your place in the sentence; this cap sits higher on
 * purpose. A 13-word gloss is still usable, and failing it would burn a full
 * retry (~1 min of model time) to fix a cosmetic overrun. This catches the real
 * failure — a gloss that has become a paragraph.
 */
export const MAX_GLOSS_WORDS = 20;

/**
 * README's asset diagram promises "Explore: timeline, data", and step-level
 * interaction is the strongest interaction effect in RESEARCH_BASIS (d = 0.76).
 * An entirely empty explore block silently drops that pillar, so require at
 * least one of the two.
 */
export function checkExploreNotEmpty(bundle: StudyBundle): ValidationIssue[] {
  const hasTimeline = (bundle.explore.timeline?.length ?? 0) > 0;
  const hasData = (bundle.explore.data?.series.length ?? 0) > 0;
  return hasTimeline || hasData
    ? []
    : [issue('explore', 'explore-requires-timeline-or-data', 'explore must contain a non-empty timeline or data block.')];
}

/**
 * Karaoke sync is how the modality principle (g = 0.82) is actually delivered:
 * narration has to line up with the text on screen. An empty or partial
 * segmentIndex leaves segments with no audio pointing at them.
 */
export function checkNarrationCoversSegments(bundle: StudyBundle): ValidationIssue[] {
  if (bundle.read.segments.length === 0) return [];
  const covered = new Set(bundle.listen.segmentIndex);
  const missing = bundle.read.segments.map((_, i) => i).filter((i) => !covered.has(i));
  return missing.length === 0
    ? []
    : [issue('listen.segmentIndex', 'listen-must-cover-segments', `Narration must reference every read segment; segment(s) ${missing.join(', ')} are uncovered.`)];
}

/** Glossing carries a measured vocabulary benefit, so a bundle with none wastes the Read stage. */
export function checkGlosses(bundle: StudyBundle): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const total = bundle.read.segments.reduce((sum, segment) => sum + segment.glosses.length, 0);
  if (total === 0) issues.push(issue('read.segments', 'gloss-required', 'At least one term must be glossed.'));
  bundle.read.segments.forEach((segment, i) => segment.glosses.forEach((gloss, j) => {
    const words = gloss.definition.trim().split(/\s+/).filter(Boolean).length;
    if (words > MAX_GLOSS_WORDS) {
      issues.push(issue(`read.segments[${i}].glosses[${j}].definition`, 'gloss-definition-too-long', `Gloss definitions must be ${MAX_GLOSS_WORDS} words or fewer (found ${words}).`));
    }
  }));
  return issues;
}

const CHECKS: Check[] = [
  checkQuizOptionFeedback,
  checkQuizHasTransferItem,
  checkWatchAltText,
  checkDroppedForCoherencePresent,
  checkStructuralSanity,
  checkExploreDataFinite,
  checkContractValues,
  checkExploreNotEmpty,
  checkNarrationCoversSegments,
  checkGlosses,
];

export function validateStudyBundle(value: unknown, sourceText = ''): ValidationResult {
  const structureIssues = checkStructure(value);
  if (structureIssues.length > 0) return { valid: false, issues: structureIssues };
  const bundle = value as StudyBundle;
  const issues = [...CHECKS.flatMap((check) => check(bundle)), ...checkNumberProvenance(bundle, sourceText)];
  return { valid: issues.length === 0, issues };
}

function checkStructure(value: unknown): ValidationIssue[] {
  if (!isRecord(value)) return [issue('', 'bundle-object-required', 'The generated bundle must be an object.')];
  const issues: ValidationIssue[] = [];
  const meta = objectAt(value, 'meta', issues);
  if (meta) {
    strings(meta, ['title', 'contentType', 'language'], 'meta', issues);
    numberAt(meta, 'inferredGrade', 'meta', issues);
    stringArrayAt(meta, 'conceptIds', 'meta', issues);
    stringArrayAt(meta, 'droppedForCoherence', 'meta', issues, 'meta-dropped-for-coherence-required');
  }
  const read = objectAt(value, 'read', issues);
  const segments = read && arrayAt(read, 'segments', 'read', issues);
  segments?.forEach((entry, i) => {
    if (!isRecord(entry)) return issues.push(typeIssue(`read.segments[${i}]`, 'object'));
    strings(entry, ['text', 'recap'], `read.segments[${i}]`, issues);
    const glosses = arrayAt(entry, 'glosses', `read.segments[${i}]`, issues);
    glosses?.forEach((gloss, j) => {
      if (!isRecord(gloss)) return issues.push(typeIssue(`read.segments[${i}].glosses[${j}]`, 'object'));
      strings(gloss, ['term', 'definition'], `read.segments[${i}].glosses[${j}]`, issues);
      if (gloss.homeLanguage !== undefined && typeof gloss.homeLanguage !== 'string') issues.push(typeIssue(`read.segments[${i}].glosses[${j}].homeLanguage`, 'string'));
    });
  });
  const listen = objectAt(value, 'listen', issues);
  if (listen) {
    strings(listen, ['script'], 'listen', issues);
    numberAt(listen, 'highlightLeadMs', 'listen', issues);
    const indexes = arrayAt(listen, 'segmentIndex', 'listen', issues);
    indexes?.forEach((entry, i) => { if (!Number.isInteger(entry) || (entry as number) < 0) issues.push(typeIssue(`listen.segmentIndex[${i}]`, 'non-negative integer')); });
  }
  const watch = objectAt(value, 'watch', issues);
  if (watch) {
    strings(watch, ['kind', 'altText'], 'watch', issues);
    const steps = arrayAt(watch, 'steps', 'watch', issues);
    steps?.forEach((entry, i) => {
      if (!isRecord(entry)) return issues.push(typeIssue(`watch.steps[${i}]`, 'object'));
      strings(entry, ['caption', 'description'], `watch.steps[${i}]`, issues);
    });
  }
  const explore = objectAt(value, 'explore', issues);
  if (explore) checkExploreStructure(explore, issues);
  const quiz = objectAt(value, 'quiz', issues);
  const items = quiz && arrayAt(quiz, 'items', 'quiz', issues);
  items?.forEach((entry, i) => {
    if (!isRecord(entry)) return issues.push(typeIssue(`quiz.items[${i}]`, 'object'));
    strings(entry, ['kind', 'stem', 'explanation'], `quiz.items[${i}]`, issues);
    const options = arrayAt(entry, 'options', `quiz.items[${i}]`, issues);
    options?.forEach((option, j) => {
      if (!isRecord(option)) return issues.push(typeIssue(`quiz.items[${i}].options[${j}]`, 'object'));
      strings(option, ['text', 'feedback'], `quiz.items[${i}].options[${j}]`, issues);
      if (typeof option.correct !== 'boolean') issues.push(typeIssue(`quiz.items[${i}].options[${j}].correct`, 'boolean'));
    });
  });
  return issues;
}

function checkExploreStructure(explore: Record<string, unknown>, issues: ValidationIssue[]) {
  if (explore.timeline !== undefined) {
    const timeline = arrayAt(explore, 'timeline', 'explore', issues);
    timeline?.forEach((entry, i) => {
      if (!isRecord(entry)) return issues.push(typeIssue(`explore.timeline[${i}]`, 'object'));
      strings(entry, ['label', 'detail'], `explore.timeline[${i}]`, issues);
      numberAt(entry, 'order', `explore.timeline[${i}]`, issues);
    });
  }
  if (explore.data !== undefined) {
    if (!isRecord(explore.data)) return issues.push(typeIssue('explore.data', 'object'));
    strings(explore.data, ['caption'], 'explore.data', issues);
    const series = arrayAt(explore.data, 'series', 'explore.data', issues);
    series?.forEach((entry, i) => {
      if (!isRecord(entry)) return issues.push(typeIssue(`explore.data.series[${i}]`, 'object'));
      strings(entry, ['name'], `explore.data.series[${i}]`, issues);
      const points = arrayAt(entry, 'points', `explore.data.series[${i}]`, issues);
      points?.forEach((point, j) => {
        if (!isRecord(point)) return issues.push(typeIssue(`explore.data.series[${i}].points[${j}]`, 'object'));
        if (typeof point.x !== 'number' && typeof point.x !== 'string') issues.push(typeIssue(`explore.data.series[${i}].points[${j}].x`, 'number or string'));
        numberAt(point, 'y', `explore.data.series[${i}].points[${j}]`, issues);
      });
    });
  }
}

/**
 * No sign prefix on purpose: with `[+-]?` a scoreline like "2-1" parsed as
 * [2, -1], so the digit 1 never entered the allowed set and every hyphenated
 * score, range, or date poisoned the check.
 */
function extractNumbers(text: string): string[] {
  return (text.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((value) => String(Number(value.replace(/,/g, ''))));
}

function issue(path: string, rule: string, message: string): ValidationIssue { return { path, rule, message }; }
function typeIssue(path: string, expected: string): ValidationIssue { return issue(path, 'invalid-structure', `${path || 'bundle'} must be a ${expected}.`); }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function objectAt(parent: Record<string, unknown>, key: string, issues: ValidationIssue[]): Record<string, unknown> | null {
  if (!isRecord(parent[key])) { issues.push(typeIssue(key, 'object')); return null; }
  return parent[key] as Record<string, unknown>;
}
function arrayAt(parent: Record<string, unknown>, key: string, base: string, issues: ValidationIssue[]): unknown[] | null {
  if (!Array.isArray(parent[key])) { issues.push(typeIssue(`${base}.${key}`, 'array')); return null; }
  return parent[key] as unknown[];
}
function strings(parent: Record<string, unknown>, keys: string[], base: string, issues: ValidationIssue[]) {
  keys.forEach((key) => { if (typeof parent[key] !== 'string') issues.push(typeIssue(`${base}.${key}`, 'string')); });
}
function numberAt(parent: Record<string, unknown>, key: string, base: string, issues: ValidationIssue[]) {
  if (typeof parent[key] !== 'number') issues.push(typeIssue(`${base}.${key}`, 'number'));
}
function stringArrayAt(parent: Record<string, unknown>, key: string, base: string, issues: ValidationIssue[], rule = 'invalid-structure') {
  if (!Array.isArray(parent[key]) || !(parent[key] as unknown[]).every((entry) => typeof entry === 'string')) {
    issues.push(issue(`${base}.${key}`, rule, `${base}.${key} must be an array of strings.`));
  }
}
