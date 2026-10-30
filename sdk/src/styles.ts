const Z = 2147483000;

export const CSS_TEXT = `
.vf-root, .vf-root * { box-sizing: border-box; }
.vf-root {
  --vf-font: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --vf-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
  --vf-ink: #0f172a; --vf-ink-2: #475569; --vf-ink-3: #94a3b8;
  --vf-line: #e2e8f0; --vf-bg: #ffffff; --vf-bg-2: #f8fafc;
  --vf-accent: #4f46e5; --vf-accent-2: #eef2ff;
  --vf-amber: #b45309; --vf-amber-bg: #fef3c7; --vf-green: #15803d; --vf-green-bg: #dcfce7;
  --vf-red: #ef4444;
  font-family: var(--vf-font); font-size: 13px; line-height: 1.45; color: var(--vf-ink);
  letter-spacing: normal; text-transform: none; font-weight: 400; -webkit-font-smoothing: antialiased;
}
.vf-root button { font: inherit; color: inherit; cursor: pointer; margin: 0; }
.vf-root textarea { font: inherit; color: inherit; margin: 0; }
.vf-mono { font-family: var(--vf-mono); font-size: 11.5px; }

html.vf-inspecting, html.vf-inspecting body, html.vf-inspecting body * { cursor: crosshair !important; }
html.vf-inspecting .vf-root * { cursor: auto !important; }
html.vf-inspecting .vf-root button, html.vf-inspecting .vf-root [role=button] { cursor: pointer !important; }
html.vf-inspecting .vf-root textarea { cursor: text !important; }

/* launcher */
.vf-launcher { position: fixed; right: 20px; bottom: 20px; z-index: ${Z + 5}; display: flex; align-items: center; gap: 2px;
  padding: 4px; border-radius: 999px; background: #0f172a; color: #fff; box-shadow: 0 8px 24px rgba(15,23,42,.28), 0 0 0 1px rgba(255,255,255,.06) inset; }
.vf-lbtn { display: inline-flex; align-items: center; gap: 7px; height: 34px; padding: 0 12px; border: 0; border-radius: 999px;
  background: transparent; color: #e2e8f0; font-size: 12.5px; font-weight: 500; transition: background .15s, color .15s; }
.vf-lbtn:hover { background: rgba(255,255,255,.09); color: #fff; }
.vf-lbtn.vf-on { background: var(--vf-accent); color: #fff; }
.vf-lbtn svg { width: 15px; height: 15px; flex: none; }
.vf-kbd { font-family: var(--vf-mono); font-size: 10.5px; padding: 1px 6px; border-radius: 5px; background: rgba(255,255,255,.12); color: #cbd5e1; }
.vf-lbtn.vf-on .vf-kbd { background: rgba(255,255,255,.2); color: #fff; }
.vf-count { min-width: 18px; height: 18px; padding: 0 5px; border-radius: 999px; background: #f59e0b; color: #1f1300; font-size: 11px; font-weight: 700;
  display: inline-flex; align-items: center; justify-content: center; }
.vf-sep { width: 1px; height: 18px; background: rgba(255,255,255,.14); }

/* banner */
.vf-banner { position: fixed; top: 12px; left: 50%; transform: translateX(-50%); z-index: ${Z + 4}; pointer-events: none;
  padding: 7px 14px; border-radius: 999px; background: rgba(15,23,42,.92); color: #fff; font-size: 12.5px; box-shadow: 0 6px 20px rgba(15,23,42,.25);
  display: flex; gap: 8px; align-items: center; }
.vf-dot { width: 7px; height: 7px; border-radius: 99px; background: #818cf8; box-shadow: 0 0 0 3px rgba(129,140,248,.3); }

/* hover overlay */
.vf-hover { position: fixed; z-index: ${Z + 1}; pointer-events: none; border: 2px solid var(--vf-accent); background: rgba(79,70,229,.08);
  border-radius: 3px; display: none; transition: all 60ms linear; }
.vf-hover-label { position: absolute; left: -2px; bottom: 100%; margin-bottom: 4px; white-space: nowrap; max-width: 420px; overflow: hidden; text-overflow: ellipsis;
  padding: 2px 7px; border-radius: 4px; background: var(--vf-accent); color: #fff; font-family: var(--vf-mono); font-size: 11px; line-height: 18px; }
.vf-hover-label.vf-below { bottom: auto; top: 100%; margin: 4px 0 0; }
.vf-selected { position: fixed; z-index: ${Z + 1}; pointer-events: none; border: 2px solid var(--vf-red); border-radius: 3px; background: rgba(239,68,68,.06); }

/* popover */
.vf-pop { position: fixed; z-index: ${Z + 3}; width: 360px; max-width: calc(100vw - 24px); background: var(--vf-bg); border-radius: 12px;
  box-shadow: 0 18px 48px rgba(15,23,42,.24), 0 0 0 1px rgba(15,23,42,.08); overflow: hidden; animation: vf-in .14s ease-out; }
@keyframes vf-in { from { opacity: 0; transform: translateY(4px) scale(.98); } to { opacity: 1; transform: none; } }
.vf-ctx { padding: 11px 14px 10px; background: var(--vf-bg-2); border-bottom: 1px solid var(--vf-line); }
.vf-ctx-top { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.vf-comp { font-weight: 650; font-size: 13.5px; }
.vf-chip { display: inline-flex; align-items: center; gap: 4px; padding: 1px 7px; border-radius: 999px; background: var(--vf-accent-2); color: var(--vf-accent);
  font-size: 11px; font-weight: 600; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vf-chip.vf-grey { background: #f1f5f9; color: var(--vf-ink-2); font-weight: 500; }
.vf-file { margin-top: 4px; color: var(--vf-ink-2); overflow-wrap: anywhere; }
.vf-crumbs { margin-top: 3px; color: var(--vf-ink-3); font-size: 11.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.vf-body { padding: 12px 14px 12px; }
.vf-ta { display: block; width: 100%; min-height: 84px; max-height: 240px; resize: vertical; padding: 9px 10px; border-radius: 8px; border: 1px solid var(--vf-line);
  background: #fff; outline: none; font-size: 13px; line-height: 1.45; }
.vf-ta:focus { border-color: var(--vf-accent); box-shadow: 0 0 0 3px rgba(79,70,229,.15); }
.vf-actions { display: flex; align-items: center; gap: 8px; margin-top: 10px; }
.vf-hint { flex: 1; color: var(--vf-ink-3); font-size: 11.5px; }
.vf-btn { height: 30px; padding: 0 12px; border-radius: 7px; border: 1px solid var(--vf-line); background: #fff; font-size: 12.5px; font-weight: 550; }
.vf-btn:hover { background: var(--vf-bg-2); }
.vf-btn-primary { background: var(--vf-accent); border-color: var(--vf-accent); color: #fff !important; }
.vf-btn-primary:hover { background: #4338ca; }
.vf-btn:disabled { opacity: .55; cursor: default; }
.vf-spin { display: inline-block; width: 11px; height: 11px; margin-right: 6px; vertical-align: -1px; border-radius: 99px;
  border: 2px solid rgba(255,255,255,.4); border-top-color: #fff; animation: vf-rot .7s linear infinite; }
@keyframes vf-rot { to { transform: rotate(360deg); } }

/* toast */
.vf-toast { position: fixed; left: 50%; bottom: 76px; transform: translateX(-50%); z-index: ${Z + 6}; padding: 9px 14px; border-radius: 9px;
  background: #0f172a; color: #fff; font-size: 13px; box-shadow: 0 10px 28px rgba(15,23,42,.3); display: flex; gap: 8px; align-items: center; animation: vf-in .16s ease-out; }
.vf-toast.vf-err { background: #7f1d1d; }
.vf-toast-ic { width: 16px; height: 16px; border-radius: 99px; display: inline-flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 800;
  background: #22c55e; color: #052e16; }
.vf-toast.vf-err .vf-toast-ic { background: #fca5a5; color: #450a0a; }

/* sidebar */
.vf-side { position: fixed; top: 0; right: 0; bottom: 0; width: 380px; max-width: 100vw; z-index: ${Z + 2}; background: var(--vf-bg);
  border-left: 1px solid var(--vf-line); box-shadow: -12px 0 40px rgba(15,23,42,.12); display: flex; flex-direction: column; animation: vf-slide .18s ease-out; }
@keyframes vf-slide { from { transform: translateX(24px); opacity: 0; } to { transform: none; opacity: 1; } }
.vf-side-hd { padding: 14px 16px 12px; border-bottom: 1px solid var(--vf-line); }
.vf-side-title { display: flex; align-items: center; gap: 8px; }
.vf-side-title h2 { margin: 0; font-size: 15px; font-weight: 700; flex: 1; color: var(--vf-ink); letter-spacing: -.01em; }
.vf-live { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; color: var(--vf-ink-3); }
.vf-live i { width: 6px; height: 6px; border-radius: 99px; background: #22c55e; animation: vf-blink 1.6s infinite; }
@keyframes vf-blink { 50% { opacity: .3; } }
.vf-x { width: 28px; height: 28px; border: 0; border-radius: 7px; background: transparent; color: var(--vf-ink-2); display: inline-flex; align-items: center; justify-content: center; }
.vf-x:hover { background: #f1f5f9; }
.vf-pills { display: flex; gap: 6px; margin-top: 12px; }
.vf-pill { height: 28px; padding: 0 11px; border-radius: 999px; border: 1px solid var(--vf-line); background: #fff; font-size: 12px; font-weight: 550; color: var(--vf-ink-2);
  display: inline-flex; align-items: center; gap: 6px; }
.vf-pill b { font-weight: 650; color: var(--vf-ink-3); font-size: 11px; }
.vf-pill.vf-on { background: var(--vf-ink); border-color: var(--vf-ink); color: #fff; }
.vf-pill.vf-on b { color: #cbd5e1; }
.vf-list { flex: 1; overflow-y: auto; padding: 8px; }
.vf-empty { padding: 40px 20px; text-align: center; color: var(--vf-ink-3); }
.vf-item { display: block; width: 100%; text-align: left; padding: 11px 12px; margin: 0 0 6px; border: 1px solid var(--vf-line); border-radius: 10px; background: #fff;
  transition: border-color .15s, box-shadow .15s; }
.vf-item:hover { border-color: #c7d2fe; box-shadow: 0 2px 10px rgba(79,70,229,.08); }
.vf-item.vf-focus { border-color: var(--vf-accent); box-shadow: 0 0 0 3px rgba(79,70,229,.15); }
.vf-item-top { display: flex; align-items: flex-start; gap: 8px; }
.vf-num { flex: none; width: 20px; height: 20px; border-radius: 99px; background: var(--vf-red); color: #fff; font-size: 11px; font-weight: 700;
  display: inline-flex; align-items: center; justify-content: center; margin-top: 1px; }
.vf-num.vf-done { background: #cbd5e1; }
.vf-msg { flex: 1; font-size: 13px; color: var(--vf-ink); white-space: pre-wrap; word-break: break-word; }
.vf-badge { flex: none; font-size: 10.5px; font-weight: 700; padding: 2px 7px; border-radius: 999px; text-transform: uppercase; letter-spacing: .04em; }
.vf-badge.vf-open { background: var(--vf-amber-bg); color: var(--vf-amber); }
.vf-badge.vf-resolved { background: var(--vf-green-bg); color: var(--vf-green); }
.vf-meta-wrap { margin: 7px 0 0 28px; display: flex; gap: 10px; align-items: flex-start; }
.vf-meta { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; color: var(--vf-ink-2); }
.vf-meta-row { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.vf-reply { margin: 8px 0 0 28px; padding: 7px 9px; border-radius: 7px; background: #f0fdf4; border: 1px solid #bbf7d0; color: #14532d; font-size: 12.5px; white-space: pre-wrap; word-break: break-word; }
.vf-reply-h { font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: var(--vf-green); margin-bottom: 2px; }
.vf-foot { margin: 7px 0 0 28px; display: flex; gap: 8px; align-items: center; color: var(--vf-ink-3); font-size: 11.5px; }
.vf-route { color: var(--vf-accent); font-weight: 550; }
.vf-thumb { display: block; flex: none; width: 72px; height: 46px; object-fit: cover; object-position: top left; border-radius: 6px; border: 1px solid var(--vf-line); }
.vf-err-line { padding: 8px 12px; margin: 0 8px 8px; border-radius: 8px; background: #fef2f2; color: #991b1b; font-size: 12px; }

/* pins + pulse */
.vf-pin { position: fixed; z-index: ${Z}; width: 22px; height: 22px; margin: -11px 0 0 -11px; border-radius: 99px 99px 99px 2px; background: var(--vf-red); color: #fff;
  border: 2px solid #fff; font-size: 11px; font-weight: 700; display: flex; align-items: center; justify-content: center; padding: 0;
  box-shadow: 0 3px 10px rgba(239,68,68,.45); transition: transform .12s; }
.vf-pin:hover { transform: scale(1.15); }
.vf-pulse { position: fixed; z-index: ${Z + 1}; pointer-events: none; border: 2px solid var(--vf-accent); border-radius: 4px; animation: vf-pulse 1.1s ease-out 2; }
@keyframes vf-pulse { 0% { box-shadow: 0 0 0 0 rgba(79,70,229,.55); background: rgba(79,70,229,.18); } 100% { box-shadow: 0 0 0 16px rgba(79,70,229,0); background: rgba(79,70,229,0); } }
`;

export function ensureStyles(): void {
  if (document.getElementById('vf-styles')) return;
  const s = document.createElement('style');
  s.id = 'vf-styles';
  s.setAttribute('data-vf-ignore', '');
  s.textContent = CSS_TEXT;
  document.head.appendChild(s);
}
