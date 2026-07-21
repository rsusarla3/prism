/**
 * Pure, deterministic validator for StudyBundle objects.
 * See docs/prism/GENERATION_SPEC.md "Output contract" for the rules enforced here.
 *
 * Each rule is a small independent check function; validateStudyBundle composes
 * them and collects every issue in one pass (a caller fixing a bundle wants the
 * full list, not one at a time).
 */
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

/** Rule 1: every quiz option has non-empty feedback, correct or not. */
export function checkQuizOptionFeedback(bundle: StudyBundle): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  bundle.quiz.items.forEach((item, i) => {
    item.options.forEach((opt, j) => {
      if (!opt.feedback || opt.feedback.trim() === '') {
        issues.push({
          path: `quiz.items[${i}].options[${j}].feedback`,
          rule: 'quiz-option-feedback-required',
          message: 'Every quiz option must have non-empty feedback, including correct options.',
        });
      }
    });
  });
  return issues;
}

/** Rule 2: at least one quiz item has kind: 'transfer'. */
export function checkQuizHasTransferItem(bundle: StudyBundle): ValidationIssue[] {
  const hasTransfer = bundle.quiz.items.some((item) => item.kind === 'transfer');
  if (!hasTransfer) {
    return [
      {
        path: 'quiz.items',
        rule: 'quiz-transfer-item-required',
        message: "At least one quiz item must have kind: 'transfer'.",
      },
    ];
  }
  return [];
}

/** Rule 3: watch.altText is a non-empty string. */
export function checkWatchAltText(bundle: StudyBundle): ValidationIssue[] {
  if (!bundle.watch.altText || bundle.watch.altText.trim() === '') {
    return [
      {
        path: 'watch.altText',
        rule: 'watch-alt-text-required',
        message: 'watch.altText must be a non-empty string.',
      },
    ];
  }
  return [];
}

/** Rule 4: meta.droppedForCoherence is present and an array (empty allowed). */
export function checkDroppedForCoherencePresent(bundle: StudyBundle): ValidationIssue[] {
  if (!Array.isArray(bundle.meta?.droppedForCoherence)) {
    return [
      {
        path: 'meta.droppedForCoherence',
        rule: 'meta-dropped-for-coherence-required',
        message: 'meta.droppedForCoherence must be present and an array.',
      },
    ];
  }
  return [];
}

/** Rule 5: structural sanity across read, quiz, and listen. */
export function checkStructuralSanity(bundle: StudyBundle): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!Array.isArray(bundle.read?.segments) || bundle.read.segments.length === 0) {
    issues.push({
      path: 'read.segments',
      rule: 'read-segments-non-empty',
      message: 'read.segments must be a non-empty array.',
    });
  } else {
    bundle.read.segments.forEach((seg, i) => {
      if (!seg.text || seg.text.trim() === '') {
        issues.push({
          path: `read.segments[${i}].text`,
          rule: 'read-segment-text-required',
          message: 'Each read segment must have non-empty text.',
        });
      }
      if (!seg.recap || seg.recap.trim() === '') {
        issues.push({
          path: `read.segments[${i}].recap`,
          rule: 'read-segment-recap-required',
          message: 'Each read segment must have a non-empty recap.',
        });
      }
    });
  }

  if (!Array.isArray(bundle.quiz?.items) || bundle.quiz.items.length === 0) {
    issues.push({
      path: 'quiz.items',
      rule: 'quiz-items-non-empty',
      message: 'quiz.items must be a non-empty array.',
    });
  } else {
    bundle.quiz.items.forEach((item, i) => {
      if (!Array.isArray(item.options) || item.options.length < 2) {
        issues.push({
          path: `quiz.items[${i}].options`,
          rule: 'quiz-item-min-two-options',
          message: 'Each quiz item must have at least 2 options.',
        });
      } else {
        const correctCount = item.options.filter((o) => o.correct === true).length;
        if (correctCount !== 1) {
          issues.push({
            path: `quiz.items[${i}].options`,
            rule: 'quiz-item-exactly-one-correct',
            message: `Each quiz item must have exactly one correct option (found ${correctCount}).`,
          });
        }
      }
    });
  }

  if (!bundle.listen?.script || bundle.listen.script.trim() === '') {
    issues.push({
      path: 'listen.script',
      rule: 'listen-script-required',
      message: 'listen.script must be a non-empty string.',
    });
  }

  if (typeof bundle.listen?.highlightLeadMs !== 'number' || !Number.isFinite(bundle.listen.highlightLeadMs) || bundle.listen.highlightLeadMs < 0) {
    issues.push({
      path: 'listen.highlightLeadMs',
      rule: 'listen-highlight-lead-ms-valid',
      message: 'listen.highlightLeadMs must be a finite number >= 0.',
    });
  }

  return issues;
}

/** Rule 6: explore.data series points must have finite y values (best-effort arithmetic smell check). */
export function checkExploreDataFinite(bundle: StudyBundle): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const series = bundle.explore?.data?.series;
  if (Array.isArray(series)) {
    series.forEach((s, i) => {
      s.points.forEach((p, j) => {
        if (typeof p.y !== 'number' || !Number.isFinite(p.y)) {
          issues.push({
            path: `explore.data.series[${i}].points[${j}].y`,
            rule: 'explore-data-point-finite',
            message: 'explore.data series points must have a finite y value.',
          });
        }
      });
    });
  }
  return issues;
}

const CHECKS: Check[] = [
  checkQuizOptionFeedback,
  checkQuizHasTransferItem,
  checkWatchAltText,
  checkDroppedForCoherencePresent,
  checkStructuralSanity,
  checkExploreDataFinite,
];

export function validateStudyBundle(bundle: StudyBundle): ValidationResult {
  const issues = CHECKS.flatMap((check) => check(bundle));
  return { valid: issues.length === 0, issues };
}
