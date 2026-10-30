# flipper

Click an element in a running React app, leave a comment, and let Claude Code fix it.

- **sdk/**: an overlay that the app mounts in dev mode. Press `Cmd+Shift+F` on macOS or `Ctrl+Shift+F` on Windows and Linux, click an element, and type a comment. It saves the source file and line, the component hierarchy, the exact list instance, a screenshot, and the URL. A sidebar shows each comment as open or resolved, refreshed live.
- **backend/**: a NestJS and MongoDB API on port 4100. It stores the comments, with screenshots kept on disk.
- **mcp-server/**: a stdio MCP server with three tools, `list_feedback`, `get_feedback` (which returns the screenshot as an image) and `resolve_feedback` (which takes a reply).
- **shared/types.ts**: the data contract shared by all three.

The test app is [faltona-web](https://github.com/mehmetyurekli/faltona-web), checked out next to this repo.

## Setup

Check out both repos side by side:

```
work/
├── flipper/
└── faltona-web/
```

Start MongoDB in Docker:

```bash
npm run db:up
```

Install and build all three packages:

```bash
npm run install:all && npm run build
```

Create the project. The last line printed is the project id:

```bash
npm run seed
```

Start the backend on port 4100:

```bash
npm run dev:backend
```

Put the project id into faltona-web in two places. In `faltona-web/.env`, add:

```
VITE_VF_PROJECT_ID=<project id>
VITE_VF_BACKEND_URL=http://localhost:4100
FLIPPER_SDK=/ABSOLUTE/PATH/flipper/sdk
```

`FLIPPER_SDK` is optional when flipper sits next to faltona-web.

In `faltona-web/.mcp.json`, replace `REPLACE_WITH_SEEDED_PROJECT_ID` with the same id.

Run faltona-web as usual. It needs faltona-api on port 3000 for login:

```bash
cd ../faltona-web && npm run dev
```

Open Claude Code in `faltona-web/` and ask it to resolve open visual feedback. The playbook in faltona-web's `CLAUDE.md` tells it the steps.

If another MongoDB already uses port 27017, set `FLIPPER_MONGO_PORT=27018` and `MONGO_URI=mongodb://localhost:27018/flipper`.

### How faltona-web loads the SDK

Its `vite.config.ts` aliases `@flipper/sdk` to the SDK source during `vite dev`. The SDK folder comes from `FLIPPER_SDK` in faltona-web's `.env`, for example `FLIPPER_SDK=/Users/me/flipper/sdk`. Without it, the config looks for a sibling `../flipper/sdk`. When the SDK isn't found, or in any production build, it points to a stub. On startup, the dev server prints a `[flipper] overlay on` or `[flipper] overlay off` line that says which case applies. faltona-web therefore builds and deploys without flipper, and the overlay never ships.

No build plugin is needed for source locations. React 19 removed `_debugSource`, and `@vitejs/plugin-react` 6 has no Babel hook, so the SDK reads each fiber's `_debugStack` instead. It maps that stack back to the original line through the inline source maps Vite serves in dev mode.

## Demo script

1. On `/admin`, press the shortcut and click the value on the second metric card, Total Branches. Write "Make this number bigger and bolder." The popover shows `GlobalMetricCards`, the key `Total Branches`, `#1`, and the file and line.
2. Click the third card's title, Total Members. Write "Rename this to 'Active Members'." Only this card should change.
3. In Claude Code, run `list_feedback` and then `get_feedback`. Claude Code makes the edits, runs lint, and calls `resolve_feedback` with a reply.
4. Keep the sidebar open. Both badges change from Open to Resolved and show the agent's reply, without a page reload.

## Finding the source with and without our own element IDs

The SDK records which method found each answer in `context.discovery`. We tested both methods on faltona-web's admin metric cards, which are four cards rendered from one array, by clicking the second card's value.

| | Without IDs (React fiber) | With IDs (`data-vf-instance`) |
| --- | --- | --- |
| Setup in the app | None | One attribute on each repeated root |
| File and line | `GlobalMetricCards.tsx:71`, exact | Not provided, since an ID only marks the element |
| Component hierarchy | Full, from `GlobalOverviewPage` down to `GlobalMetricCards` | None |
| Which instance | key `Total Branches`, index 1, plus that card's props | `storefront` |
| Survives a language switch | No, because this list's key is translated text | Yes |
| Works on any React list | Yes, if it has keys | Only where someone added the attribute |
| Works in production builds | No, because debug data is stripped | Yes |

**Result:** the fiber is better at finding the code. It needs no setup, gives the exact file and line, the hierarchy and the props, and works on lists nobody has touched. IDs are better as a stable anchor across versions and languages, so pins and re-location use the ID first when one exists. We added an ID to one component only, as the brief asks, and do not add IDs everywhere.

## Security

- **Input checks:** the backend validates every input. Comments are limited to 2,000 characters and request bodies to 2 MB.
- **Screenshots:** uploads must be real PNG files, checked by their content, up to 5 MB. The server picks the file name.
- **Source paths:** the backend rejects absolute paths and paths that climb out of the repo. The MCP server checks again that each file stays inside `VF_REPO_ROOT` before it gives the agent a path.
- **Untrusted comments:** reviewer comments reach the agent wrapped in a block marked as untrusted. The agent treats them as change requests, not as instructions.
- **Redaction:** password fields and anything marked `data-vf-sensitive` are blanked in screenshots and in the captured text.
- **Browser access:** CORS only allows the app's own origin.
- **Production builds:** the SDK is never included.

## Limits

- Dev builds only, because source discovery relies on React's debug data.
- Tested on React 19 with Vite 8 in Chromium.
- When fonts are skipped, icon-font glyphs are left out of screenshots instead of showing as their ligature names.
