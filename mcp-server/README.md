# flipper MCP server

Stdio MCP server that lets Claude Code read and resolve visual feedback stored by the flipper backend.

## Build

```sh
npm install
npm run build        # copies ../shared/types.ts into src/, compiles to dist/index.js
node dist/index.js   # speaks MCP over stdio
```

## Environment

| Var | Default | Notes |
| --- | --- | --- |
| `VF_BACKEND_URL` | `http://localhost:4100` | flipper backend base URL |
| `VF_PROJECT_ID` | (none) | required for `list_feedback` |
| `VF_REPO_ROOT` | `process.cwd()` | repo the feedback points into; `source.file` is resolved against it and only exposed as `absolutePath` if it stays inside and exists |

## Tools

- `list_feedback { status?: 'open' | 'resolved' }` - compact list (id, status, message, component, file:line, instance, page).
- `get_feedback { feedbackId }` - header + delimited untrusted reviewer comment + "how to act" + full JSON, plus the screenshot as a PNG image block.
- `resolve_feedback { feedbackId, resolutionComment }` - marks it resolved.

## Use from a sibling repo

`.mcp.json` in e.g. `faltona-web/` (with `flipper/` next to it):

```json
{
  "mcpServers": {
    "flipper": {
      "command": "node",
      "args": ["../flipper/mcp-server/dist/index.js"],
      "env": {
        "VF_BACKEND_URL": "http://localhost:4100",
        "VF_PROJECT_ID": "<seeded project id>",
        "VF_REPO_ROOT": "."
      }
    }
  }
}
```
