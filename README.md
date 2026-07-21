# Prism

**One concept. As many ways as it takes to make it click.**

Prism is an adaptive learning copilot with two focused experiences:

- **Prism Core** teaches linear versus exponential growth through prediction, synchronized graphs and tables, diagnostics, transparent mode recommendations, and a transfer challenge.
- **Prism Future** connects investing concepts to 3–5 user-selected life goals through deterministic projections, time and fee comparisons, asset tradeoffs, and an aspirational Future Snapshot prompt.

The hackathon build is educational software, not an answer bot, brokerage calculator, or personalized investment adviser.

## Architecture

Both experiences ride the **same idea** — linear vs. exponential growth — so
what a learner discovers in Core reappears as compounding in Future. The data
flow below shows how a request travels from the UI to the deterministic
verifiers and back.

```mermaid
flowchart TD
    subgraph client["🖥️ Client"]
        EXT["Chrome extension<br/>(MV3 side panel)<br/>captures selection"]
        APP["React UI · App.tsx"]
        CORE["Core.tsx<br/>Predict → Explore → Explain → Transfer"]
        FUT["Future.tsx<br/>Goals → Model → Assets → Snapshot"]
        IMG["imageGen.ts"]
        EXT -->|opens| APP
        APP --> CORE
        APP --> FUT
    end

    subgraph server["⚙️ Node server · apps/web/src/server.ts (zero-dep http)"]
        RG["POST /api/core/growth"]
        RI["POST /api/future/invest"]
        RC["GET /api/future/content"]
    end

    subgraph pkgs["📦 Packages (deterministic, tested)"]
        GROW["verifiers/growth.ts<br/>compareGrowth()"]
        INV["verifiers/invest.ts<br/>projectInvestment()"]
        CONTENT["verifiers/index.ts<br/>ASSET_CLASSES · FUTURE_GOALS"]
        SHARED["shared<br/>authoritative types & contracts"]
    end

    CORE -->|"api.growth()"| RG --> GROW -->|"GrowthComparison<br/>(linear vs exponential + crossover)"| CORE
    FUT  -->|"api.invest()"| RI --> INV -->|"InvestmentProjection<br/>(contributed vs balance = growth)"| FUT
    FUT  -->|"api.content()"| RC --> CONTENT --> FUT
    FUT  -.->|"user's own key,<br/>never touches server"| IMG -.-> OPENAI["OpenAI Images API"]

    SHARED -.->|types| client
    SHARED -.->|types| pkgs

    classDef live fill:#e8f5e9,stroke:#43a047,color:#1b5e20;
    classDef ext fill:#fff3e0,stroke:#fb8c00,color:#e65100;
    class GROW,INV,CONTENT,SHARED live;
    class OPENAI ext;
```

> The linear path in Core (`+increment`) and the "you contribute" line in
> Future are the **same shape**; the exponential path (`×multiplier`) and the
> compounding "balance" line are the **same shape**. The gap between them —
> Core's *crossover* — is Future's *growth*. One engine, two audiences.

| Location | Responsibility |
|---|---|
| `apps/web` | Responsive learning UI and server routes |
| `apps/extension` | Minimal-permission MV3 side panel and selection capture |
| `packages/shared` | Authoritative contracts and provider interfaces |
| `packages/verifiers` | Deterministic growth, investing, and algebra logic |
| `packages/learning-engine` | Answer gate, hints, adaptations, and quizzes |
| `packages/curriculum` | Approved concept objects |
| `packages/api-client` | Typed client boundary |

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
