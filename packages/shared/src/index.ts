/**
 * prism-shared — canonical domain types & schemas.
 *
 * This module is the source of truth for cross-package contracts.
 * AGENTS.md rule 14: "Shared types and API contracts are authoritative."
 * Do not loosen these types in consuming packages; change them here and
 * rebuild so every workspace sees the same shape.
 */

// ---------------------------------------------------------------------------
// Product surface (School vs Life) — spec §3
// ---------------------------------------------------------------------------

export type ProductSurface = 'school' | 'life';

// ---------------------------------------------------------------------------
// Learner goals — spec §2.2
// ---------------------------------------------------------------------------

export type LearnerGoal =
  | 'explain'
  | 'solve'
  | 'check'
  | 'quiz'
  | 'summarize'
  | 'prerequisite';

export const LEARNER_GOALS: LearnerGoal[] = [
  'explain',
  'solve',
  'check',
  'quiz',
  'summarize',
  'prerequisite',
];

export const GOAL_LABELS: Record<LearnerGoal, string> = {
  explain: 'Explain this',
  solve: 'Help me solve it',
  check: 'Check my work',
  quiz: 'Quiz me',
  summarize: 'Summarize it',
  prerequisite: 'Teach me the prerequisite',
};

// ---------------------------------------------------------------------------
// Concept classification — spec §8.1 step 7
// ---------------------------------------------------------------------------

export type Domain = 'algebra' | 'finance';

export type InputType = 'text-selection' | 'typed-topic' | 'image' | 'upload';

export interface Classification {
  surface: ProductSurface;
  domain: Domain;
  /** Curriculum concept id, e.g. "linear-equation". null if unrecognized. */
  conceptId: string | null;
  inputType: InputType;
  /** True when the content appears to be assessed homework. */
  isHomework: boolean;
}

// ---------------------------------------------------------------------------
// Curriculum objects — spec §7.1 (Shared platform) + packages/curriculum
// ---------------------------------------------------------------------------

export interface WorkedStep {
  explanation: string;
  /** Optional symbolic expression for the step (math concepts). */
  expression?: string;
}

export interface SimilarProblem {
  prompt: string;
  /** Canonical answer used by the verifier, in canonical form. */
  answer: string;
}

export interface CurriculumConcept {
  id: string;
  surface: ProductSurface;
  domain: Domain;
  title: string;
  /** Approved learning objectives (curriculum authority lives outside the model). */
  objectives: string[];
  /** Known misconceptions the tutor should watch for. */
  misconceptions: string[];
  /** A fully worked example (used by worked-example comparison). */
  workedExample: WorkedStep[];
  /** A similar problem for independent practice + mastery check. */
  similarProblem: SimilarProblem;
  /**
   * Verifier kind the server uses to deterministically check a learner answer.
   * - "linear-equation": solves ax+b=cx+d style equations.
   * - "numeric": numeric tolerance comparison.
   * - "expression": canonical symbolic equality (simplified).
   */
  verifier: 'linear-equation' | 'numeric' | 'expression';
}

// ---------------------------------------------------------------------------
// Hint ladder — spec §8.3 (least revealing hint first)
// ---------------------------------------------------------------------------

export interface Hint {
  level: number;
  text: string;
  /** True for the most revealing hint that still is not the full answer. */
  revealsMost?: boolean;
}

// ---------------------------------------------------------------------------
// Attempts & verification — spec §2.1 (meaningful attempt), §8.3
// ---------------------------------------------------------------------------

export type AttemptKind =
  | 'equation-step'
  | 'strategy'
  | 'explanation'
  | 'numeric'
  | 'image'
  | 'similar-exercise';

export interface Attempt {
  kind: AttemptKind;
  /** Free text / expression / numeric string the learner submitted. */
  value: string;
  timestamp: number;
}

export interface VerificationResult {
  /** Whether the submission is mathematically/semantically equivalent to target. */
  correct: boolean;
  /** First incorrect step index when checking worked steps, else undefined. */
  firstIncorrectStep?: number;
  /** Human-readable reason (precise mistake explanation — spec §6.6). */
  reason: string;
}

// ---------------------------------------------------------------------------
// Answer gating — spec §2.1 + AGENTS.md rule 4 (enforced on server)
// ---------------------------------------------------------------------------

export interface GatingState {
  /** True once the learner has made at least one meaningful attempt. */
  attemptMade: boolean;
  /** Server-held final answer; never sent to client before gating opens. */
  finalAnswer: string;
  /** Server-held full solution; released only after gating opens. */
  fullSolution: string[];
}

// ---------------------------------------------------------------------------
// Mode switching — spec §2.5 (every rec includes observed reason, method,
// benefit, and explicit Switch/Stay controls surfaced by the client).
// ---------------------------------------------------------------------------

export type LearningMode = 'coach' | 'visual-lab' | 'quiz' | 'simulate';

export interface ModeRecommendation {
  observedReason: string;
  proposedMethod: LearningMode;
  expectedBenefit: string;
  /** The client renders Switch / Stay controls from this. */
  controls: ['switch', 'stay'];
}

// ---------------------------------------------------------------------------
// Session — spec §7.1 (Shared platform: session persistence, event logging)
// ---------------------------------------------------------------------------

export type SessionPhase =
  | 'classifying'
  | 'goal-select'
  | 'diagnostic'
  | 'coaching'
  | 'visual-lab'
  | 'gated-answer'
  | 'similar-problem'
  | 'summary'
  | 'ended';

export interface SessionEvent {
  type: string;
  at: number;
  payload?: unknown;
}

export interface Session {
  id: string;
  surface: ProductSurface;
  goal: LearnerGoal | null;
  classification: Classification | null;
  conceptId: string | null;
  attempts: Attempt[];
  events: SessionEvent[];
  gating: GatingState;
  phase: SessionPhase;
  mastery: number; // 0..1, updated after independent practice, not solution viewing
  createdAt: number;
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// Finance provider interface — spec §2.3 (provider-neutral, disabled in V1).
// The extension must NEVER import a concrete provider or its SDK.
// ---------------------------------------------------------------------------

export interface FinancialProfile {
  annualContribution: number;
  initialPrincipal: number;
  annualReturnPct: number;
  years: number;
  feePct: number;
}

export interface FinancialDataProvider {
  readonly id: string;
  readonly enabled: boolean;
  /** Fetches normalized profile data; throws if called while disabled. */
  fetchProfile(): Promise<FinancialProfile>;
}

// ---------------------------------------------------------------------------
// API contract — packages/api-client + apps/web must agree on these shapes.
// ---------------------------------------------------------------------------

export interface StartSessionRequest {
  surface: ProductSurface;
  selectedText?: string;
  typedTopic?: string;
  inputType: InputType;
}

export interface StartSessionResponse {
  sessionId: string;
  classification: Classification;
  goalOptions: LearnerGoal[];
}

export interface SubmitAttemptRequest {
  sessionId: string;
  kind: AttemptKind;
  value: string;
}

export interface SubmitAttemptResponse {
  verification: VerificationResult;
  /** Whether the answer is now unlocked server-side. */
  answerUnlocked: boolean;
  recommendation?: ModeRecommendation;
  nextHint?: Hint;
}

export interface RevealAnswerResponse {
  /** 403-shaped error string if gating not satisfied; else the answer. */
  finalAnswer: string | null;
  fullSolution: string[] | null;
  error?: string;
}

export interface SavePlanRequest {
  sessionId: string;
  profile: FinancialProfile;
  label: string;
}
