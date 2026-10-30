# Final Plan: Visual Feedback for AI Coding Agents

Hackathon, 4 hours, 2–4 people. Judged on functionality, usability, engineering, security, innovation.

This is the reconciled plan: the original plan (plan1) plus the review points that survived
checking against the brief and the clock. Section 10 records which review points were accepted,
changed, or rejected and why.

---

## 1. Objective and demo in one paragraph

A reviewer opens the running React app, presses `Alt+F`, clicks the price of the **second** product,
types a comment, and submits. The SDK saves the comment with element identity, source file and line
(when available), component hierarchy, the exact list instance (key, index, props), a viewport
screenshot, and the URL. Claude Code calls `list_feedback` / `get_feedback` over MCP, sees the
screenshot and context, edits the right file, calls `resolve_feedback` with a reply, and the badge
in the browser flips from Open to Resolved with the agent's note, without a page reload.

---

## 2. Stack (unchanged where it was right)

| Layer | Choice | Note |
| --- | --- | --- |
| Demo app | React 18 + Vite + TypeScript | We control the version. If organizers hand us an app, see 4.1 decision tree. |
| Browser SDK | TypeScript, React component rendered by the host app | Overlay lives in its own container with `data-vf-ignore`; the inspector skips it. |
| Source discovery | React Fiber at runtime + one existing Vite/Babel plugin for file:line | No custom Babel plugin. |
| Screenshot | `html-to-image` (viewport only) | Canvas-drawn highlight of the selected element. |
| Backend | NestJS + Mongoose + MongoDB | Local Docker Mongo; `mongodb-memory-server` as a 5-minute fallback if Docker misbehaves. |
| Screenshot storage | Local `uploads/` served statically, behind a `StorageService` interface | |
| Agent bridge | MCP server, stdio, `@modelcontextprotocol/sdk`, calls backend over HTTP | Registered in the demo app's `.mcp.json`. |
| Agent | Claude Code | A `CLAUDE.md` in the demo app tells it the workflow. |

---

## 3. Repository layout (flat, no dashboard app)

```
flipper/
├── backend/        NestJS API + uploads/
├── mcp-server/     stdio MCP server (~150 lines)
├── sdk/            browser SDK (inspector, context collector, overlay UI, sidebar)
├── demo-app/       React test app with nested + repeated components, .mcp.json, CLAUDE.md
├── shared/         types.ts only (Feedback, Project, FeedbackContext), imported by path alias
├── PLAN.md
└── README.md       setup, demo script, with/without-IDs comparison
```

Workspace: a root `package.json` with npm workspaces and a `tsconfig.base.json` path alias for
`@shared/*`. No build pipeline across packages; each package has its own `dev` script.

---

## 4. Browser SDK

### 4.1 Source and instance discovery (the core problem)

Every DOM node rendered by React in dev mode carries a fiber under a key starting with
`__reactFiber$`. One helper, `resolveElement(el)`, does the following:

1. **Find the fiber** for the clicked element: `Object.keys(el).find(k => k.startsWith('__reactFiber$'))`.
2. **Walk `fiber.return`** upward collecting every fiber whose `type` is a function or class.
   For each, record `displayName || name`, and `fiber.key`, `fiber.index`. This gives the
   component hierarchy, e.g. `ProductList > ProductCard > PriceTag`.
3. **Instance identity:** the nearest ancestor fiber (including the component itself) with a
   non-null `key` is the repeated instance. Save `{ key, index, component, propsSummary }` where
   `propsSummary` is `memoizedProps` with only primitives and one level of plain-object primitives
   (functions, React elements, DOM nodes, and circular refs dropped). Also check DOM ancestors for
   `data-vf-instance` or `data-testid` and store that under `instance.domId`.
4. **File and line (decision tree, checked in the first 15 minutes against the actual test app):**
   - If `fiber._debugSource` exists (React 16–18 with the default jsx-source transform): use it.
   - Else (React 19 removed `_debugSource`): add `@react-dev-inspector/babel-plugin` to
     `@vitejs/plugin-react`'s `babel.plugins` in `vite.config.ts`. It stamps
     `data-inspector-relative-path`, `data-inspector-line`, `data-inspector-column` on every host
     element. Read those from the clicked element or its nearest ancestor. One config line, no
     component edits.
   - Else: no file. Save component name and hierarchy only; the agent greps for the component.
     This path still passes the "correct component or file" check because the component name is
     recorded.
5. **Fallback DOM context:** CSS selector path, tag, trimmed text (max 200 chars), attributes
   (`id`, `class`, `data-*`, `name`, `href`, `alt`), bounding rect, viewport, scroll.

Record `discovery: { fileStrategy: 'debugSource' | 'inspectorAttr' | 'none', instanceStrategy: 'fiberKey' | 'domId' | 'none' }`
so the README comparison (optional extra) is backed by real data from the demo.

The demo app adds `data-vf-instance={product.id}` on **ProductCard's root only**, so the demo shows
both strategies producing the same answer and the README can compare them honestly.

### 4.2 Inspection mode

- Toggle with the floating button or `Alt+F`.
- Hover: a fixed-position overlay box (not a class on the host element) follows the hovered
  element and shows `ComponentName` plus `key` when present.
- Click: `preventDefault` + `stopPropagation` in the capture phase, run `resolveElement`, open the
  comment popover anchored to the element.
- `Escape` closes the popover and exits inspection mode.
- Elements inside `[data-vf-ignore]` are never selectable.

### 4.3 Screenshot

```ts
toPng(document.documentElement, {
  width: window.innerWidth,
  height: window.innerHeight,
  style: { transform: `translate(${-scrollX}px, ${-scrollY}px)` },
  skipFonts: true,
  cacheBust: true,
  filter: (n) => !(n instanceof HTMLElement && n.hasAttribute('data-vf-ignore')),
})
```

Wrapped in `Promise.race` with a 3s timeout and try/catch. On failure the feedback is still
submitted without a screenshot. The highlight is drawn onto the resulting canvas from
`boundingRect` (red 2px stroke), so the host DOM is never mutated.

Redaction before capture: inputs of type `password` and elements with `data-vf-sensitive` get their
text replaced in the cloned tree (html-to-image `onclone`) and are excluded from captured `text`.

### 4.4 Submission

`POST /feedback` as `multipart/form-data`: `payload` (JSON) + `screenshot` (PNG blob). One request,
no separate upload round-trip.

### 4.5 Feedback sidebar (replaces the dashboard app)

- Collapsible panel inside the SDK listing project feedback with filter pills All / Open / Resolved.
- Each item: message, component, file:line, instance key, status badge (amber Open, green Resolved),
  and the agent's `resolutionComment` when present.
- Clicking an item scrolls to the element (re-located by `instance.domId`, then `selector`,
  then `boundingRect`) and pulses a highlight.
- Pins: small numbered badges rendered at each open comment's element.
- Polls `GET /projects/:id/feedback` every 3s while the panel is open. This is what makes the
  Open to Resolved flip visible live during the demo.

---

## 5. Backend (NestJS)

Endpoints:

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

- `class-validator` DTOs; `message` max 2000 chars; payload size cap 2 MB.
- Screenshot: PNG only, max 5 MB, filename generated server-side (never from the client).
- `source.file` normalized: must be relative, no `..` segments, no absolute path. Rejected otherwise.
- CORS restricted to the demo app origin.
- `uploads/` path is resolved and checked to stay inside the uploads root.

Seed script creates the demo project and prints its ID; the demo app reads it from `.env`.

---

## 6. Data model

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

## 7. MCP server

Stdio transport. Env: `VF_BACKEND_URL`, `VF_PROJECT_ID`, `VF_REPO_ROOT`.

| Tool | Args | Returns |
| --- | --- | --- |
| `list_feedback` | `status?` | Text: id, status, message, component, file:line, instance key for each |
| `get_feedback` | `feedbackId` | Two content blocks: `text` (full JSON) and `image` (base64 PNG) |
| `resolve_feedback` | `feedbackId`, `resolutionComment` | Confirmation |

`get_feedback` also:

- Resolves `source.file` against `VF_REPO_ROOT` and includes `absolutePath` only if it stays inside
  the root and exists; otherwise sets `sourceWarning`.
- Wraps the reviewer's message in a clearly delimited block labelled as untrusted reviewer input, so
  the agent treats it as a change request, not as instructions to itself. This is the security
  point most teams will miss.

`demo-app/.mcp.json` registers the server; `demo-app/CLAUDE.md` gives the agent its playbook:
list open feedback, get one, open the file, confirm the instance via key/props, make the change,
run `tsc --noEmit`, resolve with a one-line summary of what changed and where.

---

## 8. Demo app

Products page: `ProductList` renders `ProductCard` for 4 products from `data/products.ts`;
each card has `ProductImage`, `Title`, `PriceTag`, `AddToCartButton`. A second nested list
(`Reviews` inside each card) proves nested repetition. Images are local files, not external URLs,
to avoid CORS in screenshots. React 18 pinned.

Demo script (two feedbacks, so both edit paths are shown):

1. Click the second product's price: "Make this price bigger and bold." Expected: style change in
   `PriceTag.tsx` or `ProductCard.tsx` (component-wide; the agent explains that choice).
2. Click the third product's name: "Typo, should be 'Mechanical Keyboard'." Expected: data change in
   `products.ts` for `id === 3`. This one proves exact-instance identification.

Then in Claude Code: `list_feedback` → `get_feedback` → edits → `resolve_feedback` with replies.
The sidebar flips both badges live and shows the agent's replies.

---

## 9. Four-hour schedule and roles

Assumes 3 people: A (SDK), B (backend + MCP), C (demo app, integration, README, demo).

| Time | A: SDK | B: Backend + MCP | C: Demo app + glue |
| --- | --- | --- | --- |
| 0:00–0:15 | Spike `resolveElement` in a scratch page; confirm `_debugSource` or wire the inspector plugin | Nest scaffold, Mongo up, Project + Feedback schemas | Vite app with nested + repeated components, seed data, workspace + path alias |
| 0:15–1:00 | Inspection mode, hover overlay, click capture, comment popover | Feedback endpoints, multipart upload, static uploads, validation | Mount SDK in demo app, `.env` with project id |
| 1:00–1:45 | Context collector complete (hierarchy, instance, DOM fallback), screenshot + highlight | MCP server: three tools, image block, path check, `.mcp.json` | End-to-end test: submit feedback, inspect Mongo document |
| 1:45–2:30 | Sidebar with filters, pins, polling, scroll-to-element | `resolutionComment` through PATCH and MCP | Run Claude Code against real feedback; fix whatever breaks |
| 2:30–3:15 | Keyboard shortcut, redaction, `data-vf-ignore` polish | Guardrails, CORS, seed script | README: setup, demo script, with/without-IDs comparison table |
| 3:15–3:45 | Full demo rehearsal, twice. Freeze features. |||
| 3:45–4:00 | Buffer. Pitch notes: the five criteria, one sentence each. |||

Hard rule: at 3:15 nothing new goes in. If the inspector plugin fights us at 0:15, fall back to
component name + hierarchy and move on; the agent can grep.

---

## 10. Review points: verdicts

| Review point | Verdict | Reason |
| --- | --- | --- |
| A. Use React Fiber instead of a custom Babel plugin | **Accepted, with a correction** | Fiber gives component names, hierarchy, `key`, `index`, and props for free. But `_debugSource` does not exist in React 19, so file:line is not free there. Plan uses an existing inspector Babel plugin as the second tier. No custom plugin. |
| A. Drop `data-vf-instance` entirely | **Partially rejected** | Fiber `key` is the primary instance strategy. We keep `data-vf-instance` on one component root only, because the brief asks us to decide and compare, and the comparison needs both paths running. |
| B. Serialize instance props and parent location | **Accepted** | Cheap, and it is what lets the agent choose between a component-wide and an instance-specific edit. |
| C. Return the screenshot as an MCP image block | **Accepted** | A URL alone would need a second tool call and Claude Code cannot fetch localhost without extra setup. |
| D. Viewport-only capture, CORS options, timeout | **Accepted** | Correct; also made images local in the demo app. |
| E. Drop the dashboard app, flatten the repo | **Accepted** | Sidebar inside the SDK covers the "open or resolved" check and the live flip. |
| Schema: `attributes`, `boundingRect`, richer `instance` | **Accepted** | Needed to re-pin comments after reload. |
| Real-time status refresh by polling | **Accepted** | 3s polling while the panel is open. SSE not worth the time. |
| Agent reply via `resolutionComment` | **Accepted, moved in scope** | One field, one argument, one line of UI. Claims an optional extra. |
| With/without-IDs comparison in README | **Accepted** | `discovery` field records which strategy fired, so the table is real. |
| Security: path traversal, redaction | **Accepted and extended** | Added validation, upload limits, server-side filenames, CORS, and treating reviewer text as untrusted in the MCP output. |
| Usability: shortcut, scroll-to-element | **Accepted, lower priority** | Scheduled after the end-to-end path works. |
| Combine backend and MCP server into one package | **Rejected** | Claude Code wants a stdio process. A separate ~150-line server calling the HTTP API is simpler than sharing Mongoose models, and keeps the backend the single owner of the data. |
| Use `vite-plugin-react-inspector` / react-grab if `_debugSource` is stripped | **Accepted as the primary file:line path** | Promoted from fallback to default because of React 19. |

Points the review missed, now in the plan:

- The overlay UI must be excluded from inspection and from screenshots (`data-vf-ignore`).
- Reviewer comments are untrusted input to the agent; label them as such in `get_feedback`.
- One of the two demo feedbacks must be unambiguously instance-specific, otherwise the demo does not
  prove the "exact instance" check.
- A `CLAUDE.md` playbook in the demo app makes the agent's behaviour repeatable on stage.
- Dev-mode only is an explicit assumption: production builds strip fiber debug data.

---

## 11. Out of scope

Multi-framework support, authentication, multi-tenancy, video, cross-version feedback linking,
hosted external review links, SSE, production-build source discovery.
