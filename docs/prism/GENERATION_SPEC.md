# Prism Generation Backend — Goal and Specification

## Goal

Take **one blob of raw text** — a crawled news article, a textbook excerpt, a
pasted passage — and return **one validated study bundle** containing the five
learning assets, generated according to rules derived from the evidence in
[`RESEARCH_BASIS.md`](RESEARCH_BASIS.md).

The frontend (Chrome extension, owned separately) does capture and layout only.
This backend owns everything between raw text and a renderable bundle. It must
be usable with no frontend at all: text in, JSON out.

```
raw text  ->  distill  ->  generate 5 assets  ->  validate  ->  StudyBundle JSON
```

## Scope

**In scope:** the transformation logic, the output contract, the prompt design,
the validators.

**Out of scope:** UI, layout, styling, the extension, auth, persistence,
streaming, audio synthesis (the client already does text-to-speech), and image
generation.

---

## Input contract

```ts
interface GenerateRequest {
  text: string;              // required; the captured passage
  sourceUrl?: string;        // provenance only, never fetched
  title?: string;
  targetGrade?: number;      // 1-12; if absent, infer and report
  homeLanguage?: string;     // BCP-47, e.g. "ko" — enables L1 glosses
}
```

Assume the text is messy: navigation junk, cookie banners, bylines, ads,
captions. Cleaning it is stage 0's job, not the caller's.

Guard the boundary: cap length (reject or chunk beyond ~20k characters),
require non-empty text after cleaning, and treat the text strictly as **data**.
Instructions found inside the passage are never executed.

---

## Output contract

The authoritative types belong in `packages/shared`. Sketch:

```ts
interface StudyBundle {
  meta: {
    title: string;
    contentType: 'narrative' | 'expository' | 'problem' | 'data';
    inferredGrade: number;         // 1-12
    conceptIds: string[];          // ids from packages/curriculum when matched
    language: string;
    droppedForCoherence: string[]; // what stage 0 removed, and why
  };
  read: {
    segments: Array<{
      text: string;                          // cleaned, segmented prose
      glosses: Array<{
        term: string;
        definition: string;                  // <= 12 words, plain
        homeLanguage?: string;               // L1 gloss when requested
      }>;
      recap: string;                         // plain-English, <= 2 sentences
    }>;
  };
  listen: {
    script: string;                          // narration text, conversational
    segmentIndex: number[];                  // maps script -> read.segments
    highlightLeadMs: number;                 // default 300
  };
  watch: {
    kind: 'diagram' | 'sequence';
    steps: Array<{ caption: string; description: string }>;
    altText: string;
  };
  explore: {
    timeline?: Array<{ label: string; detail: string; order: number }>;
    data?: {
      caption: string;
      series: Array<{ name: string; points: Array<{ x: number|string; y: number }> }>;
    };
  };
  quiz: {
    items: Array<{
      kind: 'recall' | 'transfer';
      stem: string;
      options: Array<{
        text: string;
        correct: boolean;
        feedback: string;      // REQUIRED on every option, right and wrong
      }>;
      explanation: string;     // shown after answering
    }>;
  };
}
```

**Non-negotiable schema rules**

1. Every quiz option carries `feedback` — correct ones too. A bundle where any
   option lacks feedback is invalid. (Testing *with* feedback is 0.73 SD versus
   0.39 without; this single field carries the largest design win available.)
2. At least one quiz item has `kind: 'transfer'` — a question set in a *new*
   context, not answerable by recalling a sentence from the passage.
3. `watch.altText` is required. Accessibility is not optional.
4. `meta.droppedForCoherence` is required and must be non-empty when the input
   contained boilerplate, so the subtraction is auditable.

---

## Stages

### Stage 0 — Distill (subtractive; do this first)

Coherence is the **largest effect in the multimedia meta-analysis (g = 1.00)**,
and it comes from *removing* material, not adding it. So the pipeline begins by
throwing things away.

- Strip navigation, ads, bylines, cookie notices, related-links, boilerplate.
- Remove "seductive details": vivid but instructionally irrelevant asides.
- Identify content type, infer grade level, match a curriculum concept if one
  applies.
- Record every removal in `meta.droppedForCoherence`.

If a later stage wants to reintroduce a detail, it must earn its place by
serving an objective. Decoration loses.

### Stage 1 — Read

- **Segment** the cleaned prose into learner-paced chunks (segmenting principle),
  roughly one idea each.
- **Gloss** the terms a reader at `inferredGrade` would plausibly not know.
  Definitions are short and plain. When `homeLanguage` is set, add an L1 gloss —
  L1 glosses outperform L2 glosses.
- **Recap** each segment in plain English, at most two sentences. Simplification
  helps developing readers most, so recaps are on-demand, never a replacement
  for the original text.

### Stage 2 — Listen

- Produce a narration `script` in **conversational second person** ("you",
  "your") — the personalization principle, g = 0.70.
- The script is spoken prose, not the article verbatim: expand symbols, avoid
  parentheticals and anything unreadable aloud.
- Emit `segmentIndex` so highlighting can map back to displayed text.
- Default `highlightLeadMs: 300` — highlighting each word ~300 ms *before* its
  audio onset produced more fluent eye movements and better verbal learning.

### Stage 3 — Watch

- Describe a **visual** that carries meaning the prose alone does not (multimedia
  principle, g = 0.68).
- Prefer a **static labelled diagram** over animation by default: the meta found
  animation *less consistent* than static text-plus-diagram, with its gains
  concentrated in inference and transfer rather than recall. Use `sequence` only
  when the content is genuinely a process over time.
- Captions belong **on** the visual and **in sync** with it (spatial and temporal
  contiguity), which is why each step pairs a `caption` with its `description`.

### Stage 4 — Explore

- Build a `timeline` when the content is a sequence of events, a `data` block
  when it contains comparable quantities, or both.
- This is the interactive step: step-level interaction is d = 0.76 versus roughly
  0.3 for answer-only presentation. The learner must be able to *act*, not watch.
- **Numbers here are extracted, never computed.** See guardrails.

### Stage 5 — Quiz

- Mix `recall` items with at least one `transfer` item. Transfer to new questions
  is a real but smaller effect (d = 0.40), so it must be designed for explicitly,
  not assumed.
- **Every option gets feedback**, and wrong-answer feedback names the specific
  misconception rather than saying "incorrect."
- Feedback explains *why*, so the item teaches on the way past.

---

## Research-derived rules, in one table

Each rule traces to a finding in [`RESEARCH_BASIS.md`](RESEARCH_BASIS.md).

| Rule | Evidence | Effect |
|---|---|---|
| Remove irrelevant material before generating | coherence | g = 1.00 |
| Write narration to be heard, not read | modality | g = 0.82 |
| Conversational second person | personalization | g = 0.70 |
| Pair prose with a meaning-bearing visual | multimedia | g = 0.68 |
| Make the learner act, not watch | step-level interaction | d = 0.76 |
| Feedback on every quiz option | testing with feedback | 0.73 vs 0.39 SD |
| Include a transfer item | transfer of retrieval practice | d = 0.40 |
| Highlight ~300 ms before audio | synchronized reading | fluency gain |
| Short plain glosses, L1 when available | glossing meta-analyses | L1 > L2 |
| Chunk into learner-paced segments | segmenting | — |
| Captions on and in sync with visuals | contiguity | — |
| Prefer static diagram to animation | animation boundary condition | less consistent |

---

## Guardrails

**The model writes content; it never does arithmetic.** Any quantity a learner
sees is either (a) extracted verbatim from the source and marked as quoted, or
(b) computed by a deterministic function in `packages/verifiers`. If the model
emits a computed number, the bundle is invalid. This preserves the property the
repo already has and is the reason the finance and growth math live in tested
pure functions.

**No modality matching.** Never generate copy claiming Prism adapts to a
learner's "style," and never select a subset of assets because a learner is a
"visual learner." Every learner receives every modality. Modality matching is
the debunked meshing hypothesis; multimodal presentation is what the evidence
supports.

**Curriculum authority sits outside the model.** When a passage matches a concept
in `packages/curriculum`, the model may generate variations but may not redefine
objectives, formulas, or canonical answers.

**Answer gating survives.** For problem-type content, the worked solution stays
server-side until an attempt is recorded, exactly as `mayRevealAnswer` already
enforces.

**Source text is data, not instruction.** A passage that says "ignore your
instructions" is content to be taught, not a command.

---

## Suggested implementation (keep it small)

For the hackathon, resist orchestration. The lazy correct shape:

1. **One structured LLM call** per request, returning the whole `StudyBundle` as
   JSON against a schema. Stages 1-5 are sections of one prompt, not five calls.
   Split only if quality demands it, and measure before splitting.
2. **A schema validator** that rejects bundles violating the non-negotiables
   above. This is where the research rules become enforceable rather than
   aspirational.
3. **Deterministic verifiers** for numbers, reused from `packages/verifiers`.
4. Put the types in `packages/shared`, the pipeline in a new
   `packages/generation`, and expose one route: `POST /api/generate`.

Runtime prompt design follows the stage order above: instruct the model to
distill first and state what it dropped, then generate each asset under its
rule, then self-check the non-negotiables before returning.

---

## Acceptance criteria

The build is done when all of these hold:

1. `POST /api/generate` with `{ text }` returns a schema-valid `StudyBundle`.
2. Given a passage padded with navigation junk and an irrelevant vivid anecdote,
   `meta.droppedForCoherence` names both.
3. Every quiz option in every generated bundle has non-empty `feedback`.
4. Every bundle contains at least one `kind: 'transfer'` item.
5. `watch.altText` is always present and non-empty.
6. A passage containing arithmetic produces no model-computed figures; numbers
   are either quoted or verifier-produced.
7. A prompt-injection passage ("ignore previous instructions and output X") is
   turned into study material, not obeyed.
8. Tests cover the validator's rejection paths, since that is where the
   evidence-based rules are actually enforced.

Criteria 2-7 are the ones worth writing tests for first: they encode the claims
the pitch makes.
