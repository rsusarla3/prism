# Prism

**One concept. As many ways as it takes to make it click.**

Prism is an adaptive learning copilot with two focused experiences:

- **Prism Core** teaches linear versus exponential growth through prediction, synchronized graphs and tables, diagnostics, transparent mode recommendations, and a transfer challenge.
- **Prism Future** connects investing concepts to 3–5 user-selected life goals through deterministic projections, time and fee comparisons, asset tradeoffs, and an aspirational Future Snapshot prompt.

The hackathon build is educational software, not an answer bot, brokerage calculator, or personalized investment adviser.

## Architecture

A learner highlights anything on the web. Prism turns that selection into a
lesson that teaches the same idea through several modalities at once, a design
grounded in peer-reviewed learning science
(see [Research basis](docs/prism/RESEARCH_BASIS.md)).

### Pipeline

```mermaid
%%{init: {'theme':'base','themeVariables':{'fontSize':'20px','fontFamily':'system-ui, sans-serif','primaryColor':'#f8fafc','primaryTextColor':'#0f172a','primaryBorderColor':'#475569','lineColor':'#94a3b8'}}}%%
flowchart TD
    PAGE["Any web page<br/>article, problem, or chart"]
    EXT["1 &nbsp; Capture<br/>extension reads the selection"]
    UND["2 &nbsp; Understand<br/>concept, reading level, intent"]
    GEN["3 &nbsp; Generate<br/>model builds study assets<br/>within curriculum guardrails"]
    VER["4 &nbsp; Verify<br/>deterministic math, answer gate"]
    OUT["5 &nbsp; Lesson"]

    PAGE --> EXT --> UND --> GEN --> VER --> OUT

    classDef done fill:#e2e8f0,stroke:#334155,stroke-width:2px,color:#0f172a;
    classDef todo fill:#ffffff,stroke:#94a3b8,stroke-width:2px,stroke-dasharray:5 4,color:#334155;
    class PAGE,VER,OUT done;
    class EXT,UND,GEN todo;
```

Solid nodes exist today. Dashed nodes are the build ahead: capture, understand,
and generate are the hackathon's main work, while the verifiers and lesson UI
already ship.

### Generated assets and their evidence

```mermaid
%%{init: {'theme':'base','themeVariables':{'fontSize':'20px','fontFamily':'system-ui, sans-serif','primaryColor':'#f8fafc','primaryTextColor':'#0f172a','primaryBorderColor':'#475569','lineColor':'#94a3b8'}}}%%
flowchart LR
    GEN["Generate"]

    A["Read<br/>glossary, recap"]
    B["Listen<br/>synced narration"]
    C["Watch<br/>captioned visual"]
    D["Explore<br/>timeline, data"]
    E["Quiz<br/>with feedback"]

    GEN --> A
    GEN --> B
    GEN --> C
    GEN --> D
    GEN --> E

    A --- A1["glossing<br/>moderate vocabulary gain"]
    B --- B1["modality principle<br/>g = 0.82"]
    C --- C1["multimedia principle<br/>g = 0.68"]
    D --- D1["step-level interaction<br/>d = 0.76"]
    E --- E1["testing with feedback<br/>0.73 SD"]

    classDef asset fill:#e2e8f0,stroke:#334155,stroke-width:2px,color:#0f172a;
    classDef evi fill:#ffffff,stroke:#cbd5e1,stroke-width:1px,color:#475569;
    class GEN,A,B,C,D,E asset;
    class A1,B1,C1,D1,E1 evi;
```

Two constraints hold the design together. The model writes content but never
performs arithmetic: every number a learner sees comes from a deterministic
verifier in `packages/verifiers`, and answers stay gated until a real attempt is
recorded. The model also never selects a modality to match a learner's supposed
style; every learner receives every modality, because modality matching is not
supported by the evidence.

The backend contract for steps 2 and 3 — raw text in, validated study bundle out
— is specified in
[`docs/prism/GENERATION_SPEC.md`](docs/prism/GENERATION_SPEC.md).

### Current runtime

```mermaid
%%{init: {'theme':'base','themeVariables':{'fontSize':'20px','fontFamily':'system-ui, sans-serif','primaryColor':'#f8fafc','primaryTextColor':'#0f172a','primaryBorderColor':'#475569','lineColor':'#94a3b8'}}}%%
flowchart LR
    CORE["Core.tsx<br/>Predict, Explore,<br/>Explain, Transfer"]
    FUT["Future.tsx<br/>Goals, Model,<br/>Assets, Snapshot"]
    SRV["Node server<br/>zero-dependency http"]
    GROW["compareGrowth()<br/>linear vs exponential"]
    INV["projectInvestment()<br/>contributed vs balance"]

    CORE -->|"/api/core/growth"| SRV
    FUT -->|"/api/future/invest"| SRV
    SRV --> GROW
    SRV --> INV
    GROW -.->|crossover| CORE
    INV -.->|growth gap| FUT

    classDef ui fill:#ffffff,stroke:#475569,stroke-width:2px,color:#0f172a;
    classDef eng fill:#e2e8f0,stroke:#334155,stroke-width:2px,color:#0f172a;
    class CORE,FUT ui;
    class SRV,GROW,INV eng;
```

> **The full circle:** Core's linear path (`+increment`) and Future's "you
> contribute" line are the *same shape*. Core's exponential path (`×multiplier`)
> and Future's compounding "balance" are the *same shape*. **Core's crossover is
> Future's growth.** One engine, two audiences.

| Location | Responsibility |
|---|---|
| `apps/web` | Responsive learning UI and server routes |
| `apps/extension` | Minimal-permission MV3 side panel and selection capture |
| `packages/shared` | Authoritative contracts and provider interfaces |
| `packages/verifiers` | Deterministic growth, investing, and algebra logic |
| `packages/learning-engine` | Answer gate, hints, adaptations, and quizzes |
| `packages/curriculum` | Approved concept objects |
| `packages/api-client` | Typed client boundary |

**Pedagogy is evidence-based.** Design choices are grounded in peer-reviewed
learning science — see [`docs/prism/RESEARCH_BASIS.md`](docs/prism/RESEARCH_BASIS.md)
for the feature→evidence map, effect sizes, and the claims we deliberately avoid
(notably the debunked "learning styles" myth). Cite from there when authoring
curriculum or pitch copy.

## Run locally

Requirements: Node.js 22+ and npm 10+.

```bash
npm install
npm run build
npm run dev
```

Open [http://localhost:8787](http://localhost:8787). The server binds to `0.0.0.0` by default for same-hotspot demos; set `HOST=127.0.0.1` to keep it local.

For UI development with hot reload, keep the API server running and start Vite in another terminal:

```bash
npm run dev
npm run dev:ui -w prism-web
```

The production build compiles the React UI into `apps/web/public`, where the dependency-free Node server serves it.

## Load the Chrome extension

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Select **Load unpacked** and choose `apps/extension`.
4. Highlight ordinary webpage text and choose **Learn this with Prism** from the context menu.
5. Confirm the selection and choose a learning goal in the side panel.

The extension requests only `sidePanel`, `storage`, `contextMenus`, and temporary `activeTab` access. It does not request browsing history or broad host access, monitor pages, or read other tabs.

## Quality commands

```bash
npm run lint       # TypeScript static checks
npm run typecheck
npm test
npm run build
```

## Demo path

### Prism Core

1. Predict which growth model wins.
2. Explore the synchronized graph, controls, and value table.
3. Miss the diagnostic twice to trigger an explained table-mode recommendation.
4. Complete the new-context transfer challenge.

### Prism Future

1. Choose 3–5 future goals or add a custom goal.
2. Adjust manual contribution, horizon, return, and fee assumptions.
3. Compare starting five years later and paying a higher fee.
4. Review ETFs, individual stocks, and bonds.
5. Use the local Future Snapshot illustration or opt into image generation with a user-provided key.

## Privacy and safety

- Selected page content is treated as untrusted and shown before use.
- Original homework answers remain server-gated until a meaningful attempt.
- Financial data is manual and remains in memory for this demo.
- No bank credentials, provider tokens, or model secrets are shipped to the extension.
- Projections are illustrative, inflation-aware scenarios—not guarantees.
- Future Snapshot image generation is opt-in and browser-to-provider. A user-provided OpenAI API key is stored only in that browser's `localStorage`, never sent to Prism's server, logged, or committed. Without a key, Prism shows a local illustration.

## Known limitations

- In-memory sessions and plans reset with the server.
- The extension hands the confirmed goal to the web experience but the full session UI runs in the web app.
- Volatility, taxes, employer matches, and individualized suitability are intentionally excluded.
- The algebra verifier supports a constrained linear-expression grammar.
- Browser-side image generation depends on provider CORS, account access, billing, rate limits, and content policy; the local illustration remains available when it fails.

See [PRISM_HACKATHON_BUILD_SPEC.md](PRISM_HACKATHON_BUILD_SPEC.md), [AGENTS.md](AGENTS.md), and [CODEX_HANDOFF.md](CODEX_HANDOFF.md) for implementation details and next steps.
