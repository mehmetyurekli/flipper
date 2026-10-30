# Final Plan: Visual Feedback for AI Coding Agents

Hackathon, 4 hours, 2–4 people. Judged on functionality, usability, engineering, security, innovation.

This is the reconciled plan: the original plan (plan1) plus the review points that survived
checking against the brief and the clock, plus team decisions. Section 11 records which review
points were accepted, changed, or rejected and why.

Team decisions folded in:

- MongoDB runs in Docker via `docker-compose.yml` in this repo.
- The inspection toggle shortcut works on macOS, Windows and Linux.
- The test application is the existing **faltona-web** repo, checked out as a sibling directory.
  flipper contains no demo app.

---

## 1. Objective and demo in one paragraph

A reviewer opens faltona-web in dev mode, presses the toggle shortcut, clicks the **second** metric
card on the admin overview, types a comment, and submits. The SDK saves the comment with element
identity, source file and line, component hierarchy, the exact list instance (key, index, props), a
viewport screenshot, and the URL. Claude Code, running in the faltona-web checkout, calls
`list_feedback` / `get_feedback` over MCP, sees the screenshot and context, edits the right file,
calls `resolve_feedback` with a reply, and the badge in the browser flips from Open to Resolved with
the agent's note, without a page reload.

---

## 2. Test application: faltona-web facts that shape the plan

| Fact | Consequence |
| --- | --- |
| React 19.2, Vite 8, `@vitejs/plugin-react` 6 (Oxc transform) | `fiber._debugSource` does not exist. File:line comes from an inspector Babel plugin (4.1). Setting `babel.plugins` in the Vite config switches plugin-react to Babel for dev; that is fine. |
| Talks to `faltona-api` on `localhost:3000` | The flipper backend runs on **4100**. faltona-api must be running for the reviewer to log in; the team owns it. |
| Google Fonts and Material Symbols loaded from `fonts.googleapis.com` | `skipFonts: true` is mandatory for html-to-image, otherwise capture throws on cross-origin CSS. |
| Tailwind 4 with a strict design-token lint (`scripts/check-design-tokens.js`) | The agent's edit must use semantic tokens (`text-on-surface`, `text-title-*`), not `text-xl font-bold`. The agent playbook says to run `npm run lint` before resolving. |
| All strings through i18next (tr first, en same change) | Instance-specific text changes go through locale JSON, not JSX. The playbook says so. |
| No `data-testid` anywhere | Fiber `key` is the only automatic instance strategy. We add `data-vf-instance` to exactly one repeated component for the comparison extra. |
| Routes behind auth guards; dashboard layout with sidebar | Reviewer logs in once; the SDK mounts inside `App` so it is present on every route. |
| Repeated components available: `GlobalMetricCards` (4 cards from an array, `key={card.title}`), `DataTable` rows on members/packages/users lists, `ProgramDayCards` | Demo uses `GlobalMetricCards` at `/admin` (SUPER_ADMIN) or the members list, whichever the demo login can reach. |
| Existing `CLAUDE.md` + `AGENTS.md` with design rules | The agent playbook is appended to faltona-web's `CLAUDE.md`, not a new file, so Claude Code reads both. |

Integration footprint in faltona-web, kept to one short branch:

1. `vite.config.ts`: add the inspector Babel plugin (3 lines).
2. `main.tsx` or `App.tsx`: render `<VisualFeedback projectId backendUrl />` once, gated on `import.meta.env.DEV`.
3. `.mcp.json`: register the flipper MCP server.
4. `CLAUDE.md`: append the feedback-resolution playbook.
5. One `data-vf-instance` attribute on the `GlobalMetricCards` card root.
6. `.env`: `VITE_VF_PROJECT_ID`, `VITE_VF_BACKEND_URL=http://localhost:4100`.

---

## 3. Stack

| Layer | Choice | Note |
| --- | --- | --- |
| Browser SDK | TypeScript, React component rendered by the host app | Overlay container has `data-vf-ignore`; the inspector and screenshot skip it. Peer-depends on React 18 or 19. |
| Source discovery | React Fiber at runtime + `@react-dev-inspector/babel-plugin` for file:line | No custom Babel plugin. |
| Screenshot | `html-to-image`, viewport only | Canvas-drawn highlight of the selected element. |
| Backend | NestJS + Mongoose + MongoDB, port 4100 | |
| Database | MongoDB 7 in Docker | `docker compose up -d` from repo root. |
| Screenshot storage | Local `backend/uploads/` served statically, behind a `StorageService` interface | |
| Agent bridge | MCP server, stdio, `@modelcontextprotocol/sdk`, calls backend over HTTP | Registered in faltona-web's `.mcp.json`. |
| Agent | Claude Code in the faltona-web checkout | |

---

## 4. Repository layout

```
flipper/
├── docker-compose.yml   MongoDB 7 + named volume
├── package.json         npm workspaces: backend, mcp-server, sdk, shared
├── tsconfig.base.json   path alias @shared/*
├── backend/             NestJS API, uploads/, seed script
├── mcp-server/          stdio MCP server (~150 lines)
├── sdk/                 browser SDK (inspector, context collector, overlay UI, sidebar)
├── shared/              types.ts only
├── PLAN.md
└── README.md            setup, faltona-web integration steps, demo script, IDs comparison

../faltona-web/          sibling checkout, test application (not part of this repo)
```

The SDK is consumed by faltona-web as a local dependency: `"@flipper/sdk": "file:../flipper/sdk"`
plus a Vite `dev` script in `sdk/` that builds in watch mode. If `file:` linking fights Vite's
dependency pre-bundling, fall back to a Vite `resolve.alias` pointing at `../flipper/sdk/src`.

### 4.1 docker-compose.yml

```yaml
services:
  mongo:
    image: mongo:7
    container_name: flipper-mongo
    ports:
      - "27017:27017"
    volumes:
      - flipper-mongo-data:/data/db
    healthcheck:
      test: ["CMD", "mongosh", "--quiet", "--eval", "db.runCommand({ ping: 1 }).ok"]
      interval: 5s
      timeout: 3s
      retries: 10
volumes:
  flipper-mongo-data:
```

Backend reads `MONGO_URI` (default `mongodb://localhost:27017/flipper`). If faltona-api also uses a
Mongo on 27017, change the host port to 27018 and the URI accordingly. Root scripts:

```
npm run db:up     docker compose up -d
npm run db:down   docker compose down
npm run db:reset  docker compose down -v && docker compose up -d
npm run seed      creates the demo project and prints its ID
```

---

## 5. Browser SDK

### 5.1 Source and instance discovery (the core problem)

Every DOM node rendered by React in dev mode carries a fiber under a key starting with
`__reactFiber$`. One helper, `resolveElement(el)`, does the following:

1. **Find the fiber** for the clicked element: `Object.keys(el).find(k => k.startsWith('__reactFiber$'))`.
2. **Walk `fiber.return`** upward collecting every fiber whose `type` is a function or class.
   For each, record `displayName || name`, `fiber.key`, `fiber.index`. This gives the component
   hierarchy, e.g. `DashboardLayout > GlobalOverviewPage > GlobalMetricCards`.
3. **Instance identity:** the nearest ancestor fiber (host or component) with a non-null `key` is
   the repeated instance. Save `{ key, index, component, propsSummary }` where `propsSummary` is
   `memoizedProps` reduced to primitives and one level of plain-object primitives (functions, React
   elements, DOM nodes and circular refs dropped, strings capped at 200 chars). Also check DOM
   ancestors for `data-vf-instance` or `data-testid` and store that under `instance.domId`.
4. **File and line, decision tree, verified in the first 15 minutes against faltona-web:**
   - If `fiber._debugSource` exists (React 16–18): use it. Not the case here.
   - Else add `@react-dev-inspector/babel-plugin` to `@vitejs/plugin-react`'s `babel.plugins`.
     It stamps `data-inspector-relative-path`, `data-inspector-line`, `data-inspector-column` on
     every host element. Read them from the clicked element or its nearest stamped ancestor.
   - Else parse `fiber._debugStack` (React 19 owner stack). Its frames contain
     `/src/modules/.../File.tsx:LINE:COL` with Vite's served path. Lines are approximately right
     because the JSX transform keeps lines aligned. Mark as `fileStrategy: 'debugStack'`.
   - Else: component name and hierarchy only; the agent greps. Still passes the "correct component
     or file" check because the component name is recorded.
5. **Fallback DOM context:** CSS selector path, tag, trimmed text (max 200 chars), attributes
   (`id`, `class`, `data-*`, `name`, `href`, `alt`), bounding rect, viewport, scroll.

Record `discovery: { fileStrategy, instanceStrategy }` so the README comparison (optional extra)
is backed by real data.

### 5.2 Inspection mode and shortcut

- Toggle with the floating button or the keyboard shortcut.
- **Shortcut is cross-platform:** `Ctrl+Shift+F` on Windows and Linux, `Cmd+Shift+F` on macOS.
  Implemented as one listener: `const mod = isMac ? e.metaKey : e.ctrlKey; if (mod && e.shiftKey && e.code === 'KeyF')`.
  `isMac` from `navigator.userAgentData?.platform ?? navigator.platform` matching `/mac/i`. `e.code`
  is used instead of `e.key` so Turkish and other keyboard layouts behave the same. The handler
  calls `preventDefault` so the browser's find-in-page does not open. The floating button shows the
  platform-correct hint (`⌘⇧F` or `Ctrl+Shift+F`). Avoid `Alt`-based combos: on macOS `Alt+letter`
  types a special character, and on Windows `Alt+F` opens the File menu in some browsers.
- Hover: a fixed-position overlay box (not a class on the host element) follows the hovered element
  and shows `ComponentName` plus `key` when present.
- Click: `preventDefault` + `stopPropagation` in the capture phase, run `resolveElement`, open the
  comment popover anchored to the element. React Router links and buttons are therefore not
  triggered while inspecting.
- `Escape` closes the popover and exits inspection mode.
- Elements inside `[data-vf-ignore]` are never selectable.
- Shortcut is ignored while focus is in an input, textarea or contenteditable, except the SDK's own.

### 5.3 Screenshot

```ts
toPng(document.documentElement, {
  width: window.innerWidth,
  height: window.innerHeight,
  style: { transform: `translate(${-scrollX}px, ${-scrollY}px)` },
  skipFonts: true,          // Google Fonts + Material Symbols are cross-origin
  cacheBust: true,
  pixelRatio: 1,
  filter: (n) => !(n instanceof HTMLElement && n.hasAttribute('data-vf-ignore')),
})
```

Wrapped in `Promise.race` with a 3s timeout and try/catch. On failure the feedback is still
submitted without a screenshot. The highlight is drawn onto the resulting canvas from
`boundingRect` (red 2px stroke), so the host DOM is never mutated. Material Symbols icons may
render as ligature text in the capture because fonts are skipped; acceptable.

Redaction before capture: inputs of type `password` and elements with `data-vf-sensitive` get their
text blanked in the cloned tree (html-to-image `onClone`) and are excluded from captured `text`.
faltona-web's PIN and till-password panels get `data-vf-sensitive` in the integration branch.

### 5.4 Submission

`POST /feedback` as `multipart/form-data`: `payload` (JSON) + `screenshot` (PNG blob). One request.

### 5.5 Feedback sidebar (replaces the dashboard app)

- Collapsible panel inside the SDK listing project feedback with filter pills All / Open / Resolved.
- Each item: message, component, file:line, instance key, status badge (amber Open, green Resolved),
  and the agent's `resolutionComment` when present.
- Clicking an item scrolls to the element (re-located by `instance.domId`, then `selector`, then
  `boundingRect`) and pulses a highlight. Items on another route show the page URL as a link.
- Pins: small numbered badges at each open comment's element on the current page.
- Polls `GET /projects/:id/feedback` every 3s while the panel is open. This is what makes the
  Open to Resolved flip visible live during the demo.

---

## 6. Backend (NestJS, port 4100)

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/projects` | Create project |
| GET | `/projects/:id` | Get project |
| GET | `/projects/:id/feedback?status=` | List feedback |
| POST | `/feedback` | Create feedback (multipart) |
| GET | `/feedback/:id` | Full feedback |
| PATCH | `/feedback/:id/status` | `{ status, resolutionComment? }` |
| GET | `/uploads/:file` | Static screenshots |

Guardrails (cheap, mentioned in the pitch):

- `class-validator` DTOs; `message` max 2000 chars; JSON payload cap 2 MB.
- Screenshot: PNG only, max 5 MB, filename generated server-side.
- `source.file` normalized: must be relative, no `..` segments, no absolute path.
- CORS restricted to `http://localhost:5173` (faltona-web dev server).
- `uploads/` path resolved and checked to stay inside the uploads root.

---

## 7. Data model

```ts
interface Project { _id; name: string; repositoryUrl?: string; createdAt: Date }

interface Feedback {
  _id; projectId;
  message: string;
  status: 'open' | 'resolved';
  resolutionComment?: string;
  pageUrl: string;
  context: {
    element: {
      tag: string;
      text?: string;
      selector: string;
      attributes?: Record<string, string>;
      boundingRect: { x: number; y: number; width: number; height: number };
    };
    source?: { file: string; line: number; column?: number; component?: string };
    instance?: {
      key?: string;          // fiber.key
      index?: number;        // fiber.index
      domId?: string;        // data-vf-instance / data-testid
      component?: string;
      propsSummary?: Record<string, unknown>;
    };
    hierarchy: Array<{ component: string; key?: string; index?: number; file?: string; line?: number }>;
    discovery: { fileStrategy: string; instanceStrategy: string };
    screenshot?: string;     // URL
    viewport: { width: number; height: number };
    scrollPosition: { x: number; y: number };
    userAgent?: string;
  };
  createdAt: Date;
  resolvedAt?: Date;
}
```

Index: `{ projectId: 1, status: 1, createdAt: -1 }`. Context embedded, screenshots on disk.

---

## 8. MCP server

Stdio transport. Env: `VF_BACKEND_URL`, `VF_PROJECT_ID`, `VF_REPO_ROOT`.

| Tool | Args | Returns |
| --- | --- | --- |
| `list_feedback` | `status?` | Text: id, status, message, component, file:line, instance key per item |
| `get_feedback` | `feedbackId` | Two content blocks: `text` (full JSON) and `image` (base64 PNG) |
| `resolve_feedback` | `feedbackId`, `resolutionComment` | Confirmation |

`get_feedback` also:

- Resolves `source.file` against `VF_REPO_ROOT` and includes `absolutePath` only if it stays inside
  the root and exists; otherwise sets `sourceWarning`.
- Wraps the reviewer's message in a delimited block labelled as untrusted reviewer input, so the
  agent treats it as a change request, not as instructions to itself.

faltona-web integration files:

`.mcp.json`
```json
{
  "mcpServers": {
    "flipper": {
      "command": "node",
      "args": ["../flipper/mcp-server/dist/index.js"],
      "env": { "VF_BACKEND_URL": "http://localhost:4100", "VF_PROJECT_ID": "<seeded id>", "VF_REPO_ROOT": "." }
    }
  }
}
```

`CLAUDE.md` appendix, "Resolving visual feedback":
list open feedback, get one, open the file at the given line, confirm the instance via key and
props, make the smallest change that satisfies the comment using semantic design tokens and i18n,
run `npm run lint` and `npm run build`, then resolve with a one-line summary naming file and line.

---

## 9. Demo script on faltona-web

Prerequisites running: `docker compose up -d` (flipper), flipper backend on 4100, faltona-api on
3000, faltona-web dev server on 5173, Claude Code opened in `faltona-web/`.

Two feedbacks, so both edit paths are shown:

1. On `/admin`, press the shortcut, click the **second** metric card's value ("Total Branches").
   Comment: "Make this number bigger and bolder." Expected: a token-compliant style change in
   `GlobalMetricCards.tsx`, applied component-wide; the agent's reply explains that choice.
2. Click the **third** card's title ("Total Members"). Comment: "Rename this to 'Active Members'."
   Expected: the agent changes the i18n key's text in `locales/en` and `locales/tr` for that one
   card, proving exact-instance identification (`key: "Total Members"`, `index: 2`,
   `propsSummary` showing the card data).

Then in Claude Code: `list_feedback` → `get_feedback` → edits → lint → `resolve_feedback` with
replies. The sidebar flips both badges live and shows the agent's replies.

If the demo login is not SUPER_ADMIN, use the members list instead: second row of the `DataTable`
(`key` = member id) with "Highlight this member's status badge".

---

## 10. Four-hour schedule and roles

Assumes 3 people: A (SDK), B (backend + MCP + Docker), C (faltona-web integration, README, demo).

| Time | A: SDK | B: Backend + MCP | C: Integration + demo |
| --- | --- | --- | --- |
| 0:00–0:15 | Spike `resolveElement` on a faltona-web page; confirm inspector attrs appear | `docker-compose.yml`, Nest scaffold on 4100, Project + Feedback schemas | Checkout faltona-web branch, add inspector plugin to `vite.config.ts`, confirm app runs with faltona-api |
| 0:15–1:00 | Inspection mode, hover overlay, click capture, cross-platform shortcut, comment popover | Feedback endpoints, multipart upload, static uploads, validation, seed script | Link SDK into faltona-web, mount `<VisualFeedback>` in DEV, `.env` |
| 1:00–1:45 | Context collector complete (hierarchy, instance, DOM fallback), screenshot + highlight | MCP server: three tools, image block, path check | End-to-end: submit feedback from `/admin`, inspect the Mongo document |
| 1:45–2:30 | Sidebar with filters, pins, polling, scroll-to-element | `resolutionComment` through PATCH and MCP | `.mcp.json`, `CLAUDE.md` appendix; run Claude Code on real feedback; fix what breaks |
| 2:30–3:15 | Redaction, `data-vf-ignore`, `data-vf-sensitive` polish | Guardrails, CORS, `db:*` scripts | README: setup, integration steps, with/without-IDs comparison table |
| 3:15–3:45 | Full demo rehearsal, twice. Freeze features. |||
| 3:45–4:00 | Buffer. Pitch notes: the five criteria, one sentence each. |||

Hard rule: at 3:15 nothing new goes in. If the inspector plugin fights Vite 8 at 0:15, use the
`_debugStack` path and move on; the agent can grep for the component name.

---

## 11. Review points: verdicts

| Review point | Verdict | Reason |
| --- | --- | --- |
| A. Use React Fiber instead of a custom Babel plugin | **Accepted, with a correction** | Fiber gives component names, hierarchy, `key`, `index`, props for free. `_debugSource` does not exist in React 19, and faltona-web is on 19.2, so file:line comes from an existing inspector Babel plugin, with `_debugStack` as a second tier. No custom plugin. |
| A. Drop `data-vf-instance` entirely | **Partially rejected** | Fiber `key` is primary. One `data-vf-instance` on one component root stays, because the brief asks us to compare with and without IDs. |
| B. Serialize instance props and parent location | **Accepted** | Lets the agent choose between component-wide and instance-specific edits. |
| C. Return the screenshot as an MCP image block | **Accepted** | A URL alone would need a second tool call. |
| D. Viewport-only capture, CORS options, timeout | **Accepted** | Mandatory here: faltona-web loads Google Fonts. |
| E. Drop the dashboard app, flatten the repo | **Accepted** | Sidebar inside the SDK covers the open/resolved check and the live flip. |
| Schema: `attributes`, `boundingRect`, richer `instance` | **Accepted** | Needed to re-pin comments after reload. |
| Real-time status refresh by polling | **Accepted** | 3s polling while the panel is open. |
| Agent reply via `resolutionComment` | **Accepted, in scope** | One field, one argument, one line of UI. |
| With/without-IDs comparison in README | **Accepted** | `discovery` field records which strategy fired. |
| Security: path traversal, redaction | **Accepted and extended** | Plus validation, upload limits, server-side filenames, CORS, untrusted-input labelling in MCP output. |
| Usability: shortcut, scroll-to-element | **Accepted** | Shortcut made cross-platform per team feedback. |
| Combine backend and MCP server | **Rejected** | Claude Code wants a stdio process; a separate small server calling the HTTP API is simpler. |
| Build a demo app inside the repo | **Rejected per team decision** | faltona-web is the test app; it has real nested and repeated components, auth, i18n and a strict lint, which makes a better engineering story than a toy list. |

Points the review missed, now in the plan:

- The overlay UI must be excluded from inspection and screenshots (`data-vf-ignore`).
- Reviewer comments are untrusted input to the agent; label them as such in `get_feedback`.
- One demo feedback must be unambiguously instance-specific, otherwise the demo does not prove the
  "exact instance" check.
- The agent playbook lives in faltona-web's `CLAUDE.md` so design-token and i18n rules apply to the
  agent's edit.
- Port 3000 is taken by faltona-api; the flipper backend uses 4100.
- Dev-mode only is an explicit assumption: production builds strip fiber debug data.

---

## 12. Out of scope

Multi-framework support, authentication for the feedback tool, multi-tenancy, video, cross-version
feedback linking, hosted external review links, SSE, production-build source discovery.
