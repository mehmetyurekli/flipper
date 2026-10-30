import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { enrichContext, quickLabel, resolveElement } from './resolve';
import type { ResolvedContext } from './resolve';
import { captureViewport } from './screenshot';
import { absoluteUrl, listFeedback, postFeedback } from './api';
import { isOnCurrentPage, locateFeedback, pathOf } from './locate';
import { ensureStyles } from './styles';
import type { Feedback, FeedbackStatus } from './types';

export interface VisualFeedbackProps {
  projectId: string;
  backendUrl: string;
  /** When false the component renders nothing and installs no listeners. Default true. */
  enabled?: boolean;
}

const POLL_MS = 3000;
const IGNORE = '[data-vf-ignore]';

function detectMac(): boolean {
  if (typeof navigator === 'undefined') return false;
  const p = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ?? navigator.platform ?? '';
  return /mac/i.test(p);
}

function isEditable(t: EventTarget | null): boolean {
  if (!(t instanceof Element)) return false;
  if (t.closest(IGNORE)) return false; // the SDK's own inputs don't block the shortcut
  const tag = t.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return (t as HTMLElement).isContentEditable;
}

function inSdk(t: EventTarget | null): boolean {
  return t instanceof Element && !!t.closest(IGNORE);
}

function relTime(iso: string): string {
  const t = Date.parse(iso);
  if (!t) return '';
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.round(s / 86400)}d ago`;
  return new Date(t).toLocaleDateString();
}

function fileLabel(ctx: { source?: { file: string; line: number; column?: number } } | undefined): string | undefined {
  const s = ctx?.source;
  if (!s?.file) return undefined;
  return `${s.file}:${s.line}`;
}

/** Path with line-break opportunities after each slash (so long paths wrap at folders, not mid-name). */
function PathText({ text }: { text: string }) {
  const parts = text.split('/');
  return (
    <>
      {parts.map((p, i) => (
        <span key={i}>
          {p}
          {i < parts.length - 1 && (
            <>
              /<wbr />
            </>
          )}
        </span>
      ))}
    </>
  );
}

const Icon = {
  target: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 4l7 17 2.5-7.5L21 11z" />
    </svg>
  ),
  list: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  ),
  close: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  ),
};

type Toast = { kind: 'ok' | 'err'; text: string; id: number };
type Selection = { el: Element; ctx: ResolvedContext };
type Filter = 'all' | FeedbackStatus;

export function VisualFeedback(props: VisualFeedbackProps): ReactNode {
  if (props.enabled === false) return null;
  if (typeof window === 'undefined' || typeof document === 'undefined') return null;
  return <VisualFeedbackInner projectId={props.projectId} backendUrl={props.backendUrl} />;
}

function VisualFeedbackInner({ projectId, backendUrl }: { projectId: string; backendUrl: string }) {
  const isMac = useMemo(detectMac, []);
  const shortcut = isMac ? '⌘⇧F' : 'Ctrl+Shift+F';
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const [inspecting, setInspecting] = useState(false);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [items, setItems] = useState<Feedback[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [focusId, setFocusId] = useState<string | null>(null);
  const [pulseEl, setPulseEl] = useState<Element | null>(null);
  const [, setTick] = useState(0);

  const hoverRef = useRef<HTMLDivElement>(null);
  const hoverLabelRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const pulseRef = useRef<HTMLDivElement>(null);
  const hovered = useRef<Element | null>(null);
  const enrichRef = useRef<{ el: Element; p: Promise<ResolvedContext> } | null>(null);
  const messageRef = useRef('');
  messageRef.current = message;

  // ---- container + styles -------------------------------------------------
  useEffect(() => {
    ensureStyles();
    const div = document.createElement('div');
    div.className = 'vf-root';
    div.setAttribute('data-vf-ignore', '');
    document.body.appendChild(div);
    setContainer(div);
    return () => {
      div.remove();
    };
  }, []);

  const showToast = useCallback((kind: Toast['kind'], text: string) => {
    setToast({ kind, text, id: Date.now() });
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.kind === 'err' ? 5000 : 2800);
    return () => clearTimeout(t);
  }, [toast]);

  const exitInspection = useCallback(() => {
    setInspecting(false);
    setSelection(null);
    setMessage('');
    hovered.current = null;
  }, []);

  // ---- data ---------------------------------------------------------------
  const refresh = useCallback(async () => {
    try {
      const list = await listFeedback(backendUrl, projectId);
      setItems(list);
      setLoadError(null);
    } catch {
      setLoadError(`Can't reach ${backendUrl}`);
    }
  }, [backendUrl, projectId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!sidebarOpen) return;
    void refresh();
    const id = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(id);
  }, [sidebarOpen, refresh]);

  // ---- keyboard: shortcut + escape ---------------------------------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (mod && e.shiftKey && !e.altKey && e.code === 'KeyF') {
        if (isEditable(e.target) || isEditable(document.activeElement)) return;
        e.preventDefault();
        e.stopPropagation();
        setInspecting((on) => {
          if (on) {
            setSelection(null);
            setMessage('');
          }
          return !on;
        });
        return;
      }
      if (e.key === 'Escape' && (inspecting || selection)) {
        e.preventDefault();
        e.stopPropagation();
        exitInspection();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [isMac, inspecting, selection, exitInspection]);

  // ---- inspection: hover tracking + click capture ------------------------
  useEffect(() => {
    if (!inspecting) return;
    document.documentElement.classList.add('vf-inspecting');

    const onMove = (e: Event) => {
      const t = e.target;
      if (!(t instanceof Element) || inSdk(t) || t === document.documentElement || t === document.body) {
        if (hovered.current) hovered.current = null;
        return;
      }
      if (hovered.current !== t) {
        hovered.current = t;
        if (hoverLabelRef.current) hoverLabelRef.current.textContent = quickLabel(t);
      }
    };
    const onLeave = (e: MouseEvent) => {
      if (!e.relatedTarget) hovered.current = null;
    };
    const block = (e: Event) => {
      if (inSdk(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      if (e.type !== 'click') return;
      const t = e.target;
      if (!(t instanceof Element) || t === document.documentElement || t === document.body) return;
      // don't throw away a half-written comment on a stray click
      if (messageRef.current.trim()) return;
      try {
        const base = resolveElement(t);
        setSelection({ el: t, ctx: base });
        setMessage('');
        const p = enrichContext(base);
        enrichRef.current = { el: t, p };
        void p.then((ctx) => {
          if (ctx !== base) setSelection((cur) => (cur && cur.el === t && cur.ctx === base ? { el: t, ctx } : cur));
        });
      } catch {
        /* resolve never should throw, but stay quiet */
      }
    };
    const types = ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click', 'dblclick', 'auxclick', 'touchstart'];
    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('mouseover', onMove, true);
    document.addEventListener('mouseleave', onLeave as EventListener);
    types.forEach((t) => window.addEventListener(t, block, { capture: true, passive: false }));

    let raf = 0;
    let lastBelow = false;
    const loop = () => {
      const box = hoverRef.current;
      const el = hovered.current;
      if (box) {
        if (el && el.isConnected) {
          const r = el.getBoundingClientRect();
          box.style.display = 'block';
          box.style.left = `${r.left}px`;
          box.style.top = `${r.top}px`;
          box.style.width = `${r.width}px`;
          box.style.height = `${r.height}px`;
          const below = r.top < 28;
          if (below !== lastBelow && hoverLabelRef.current) {
            hoverLabelRef.current.classList.toggle('vf-below', below);
            lastBelow = below;
          }
        } else {
          box.style.display = 'none';
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      document.documentElement.classList.remove('vf-inspecting');
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('mouseover', onMove, true);
      document.removeEventListener('mouseleave', onLeave as EventListener);
      types.forEach((t) => window.removeEventListener(t, block, true));
      cancelAnimationFrame(raf);
      hovered.current = null;
    };
  }, [inspecting]);

  // ---- selected element box + popover positioning ------------------------
  useLayoutEffect(() => {
    if (!selection) return;
    let raf = 0;
    const loop = () => {
      const el = selection.el;
      const r = el.isConnected ? el.getBoundingClientRect() : null;
      const sel = selectedRef.current;
      if (sel && r) {
        sel.style.left = `${r.left}px`;
        sel.style.top = `${r.top}px`;
        sel.style.width = `${r.width}px`;
        sel.style.height = `${r.height}px`;
      }
      const pop = popRef.current;
      if (pop && r) {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const pw = pop.offsetWidth;
        const ph = pop.offsetHeight;
        const gap = 10;
        let top = r.bottom + gap;
        if (top + ph > vh - 12) top = r.top - gap - ph; // flip above
        if (top < 12) top = Math.max(12, Math.min(vh - ph - 12, r.top)); // overlap, clamp
        let left = r.left;
        if (left + pw > vw - 12) left = vw - pw - 12;
        if (left < 12) left = 12;
        pop.style.top = `${Math.round(top)}px`;
        pop.style.left = `${Math.round(left)}px`;
        pop.style.visibility = 'visible';
      }
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [selection]);

  // ---- submit -------------------------------------------------------------
  const submit = useCallback(async () => {
    if (!selection || submitting) return;
    const text = message.trim();
    if (!text) return;
    setSubmitting(true);
    const { el } = selection;
    // the enriched (source-mapped) context may still be in flight
    const latest = enrichRef.current?.el === el ? await enrichRef.current.p : selection.ctx;
    const ctx: ResolvedContext = { ...latest, element: { ...latest.element } };
    if (el.isConnected) {
      const r = el.getBoundingClientRect();
      ctx.element.boundingRect = { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
    }
    ctx.viewport = { width: window.innerWidth, height: window.innerHeight };
    ctx.scrollPosition = { x: Math.round(window.scrollX), y: Math.round(window.scrollY) };
    const blob = await captureViewport(ctx.element.boundingRect);
    try {
      await postFeedback(backendUrl, { projectId, message: text.slice(0, 2000), pageUrl: location.href, context: ctx }, blob);
      showToast('ok', blob ? 'Feedback sent' : 'Feedback sent (without screenshot)');
      exitInspection();
      void refresh();
    } catch (err) {
      showToast('err', `Couldn't send feedback: ${err instanceof Error ? err.message : 'network error'}`);
    } finally {
      setSubmitting(false);
    }
  }, [selection, submitting, message, backendUrl, projectId, showToast, exitInspection, refresh]);

  const onTextareaKey = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void submit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      exitInspection();
    }
  };

  // ---- pins + pulse -------------------------------------------------------
  const openItems = useMemo(
    () => items.filter((f) => f.status === 'open').sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)),
    [items],
  );
  const pinNumber = useMemo(() => {
    const m = new Map<string, number>();
    openItems.forEach((f, i) => m.set(f._id, i + 1));
    return m;
  }, [openItems]);
  const pinItems = openItems.filter(isOnCurrentPage);
  const hasPins = pinItems.length > 0;

  useEffect(() => {
    if (!hasPins && !sidebarOpen) return;
    let queued = false;
    const bump = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        setTick((t) => t + 1);
      });
    };
    window.addEventListener('scroll', bump, { capture: true, passive: true });
    window.addEventListener('resize', bump);
    const id = setInterval(bump, 1000); // layout changes + SPA route changes
    return () => {
      window.removeEventListener('scroll', bump, true);
      window.removeEventListener('resize', bump);
      clearInterval(id);
    };
  }, [hasPins, sidebarOpen]);

  useEffect(() => {
    if (!pulseEl) return;
    let raf = 0;
    const loop = () => {
      const p = pulseRef.current;
      if (p && pulseEl.isConnected) {
        const r = pulseEl.getBoundingClientRect();
        p.style.left = `${r.left - 3}px`;
        p.style.top = `${r.top - 3}px`;
        p.style.width = `${r.width + 6}px`;
        p.style.height = `${r.height + 6}px`;
      }
      raf = requestAnimationFrame(loop);
    };
    loop();
    const t = setTimeout(() => setPulseEl(null), 2400);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
    };
  }, [pulseEl]);

  const focusFeedback = useCallback(
    (fb: Feedback) => {
      setFocusId(fb._id);
      if (!isOnCurrentPage(fb)) {
        location.assign(fb.pageUrl);
        return;
      }
      const el = locateFeedback(fb);
      if (!el) {
        showToast('err', 'That element is no longer on this page');
        return;
      }
      el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
      setPulseEl(null);
      requestAnimationFrame(() => setPulseEl(el));
    },
    [showToast],
  );

  if (!container) return null;

  const counts = {
    all: items.length,
    open: items.filter((f) => f.status === 'open').length,
    resolved: items.filter((f) => f.status === 'resolved').length,
  };
  const visibleItems = items
    .filter((f) => filter === 'all' || f.status === filter)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

  const ctx = selection?.ctx;
  const compName = ctx?.source?.component ?? ctx?.instance?.component ?? ctx?.hierarchy[ctx.hierarchy.length - 1]?.component ?? ctx?.element.tag;
  const crumbs = ctx?.hierarchy.slice(-4).map((h) => h.component).join(' › ');

  return createPortal(
    <>
      {/* hover + selection boxes */}
      {inspecting && !selection && (
        <div ref={hoverRef} className="vf-hover">
          <div ref={hoverLabelRef} className="vf-hover-label" />
        </div>
      )}
      {selection && <div ref={selectedRef} className="vf-selected" />}
      {inspecting && !selection && (
        <div className="vf-banner">
          <span className="vf-dot" /> Click an element to comment · <span className="vf-kbd">Esc</span> to exit
        </div>
      )}

      {/* pins */}
      {!selection &&
        pinItems.map((fb) => {
          const el = locateFeedback(fb);
          if (!el) return null;
          const r = el.getBoundingClientRect();
          if (r.bottom < 0 || r.top > window.innerHeight || r.right < 0 || r.left > window.innerWidth) return null;
          return (
            <button
              key={fb._id}
              type="button"
              className="vf-pin"
              style={{ left: Math.max(11, r.left - 12), top: Math.max(11, r.top + Math.min(11, r.height / 2)) }}
              title={fb.message}
              onClick={() => {
                setSidebarOpen(true);
                setFilter('all');
                focusFeedback(fb);
              }}
            >
              {pinNumber.get(fb._id)}
            </button>
          );
        })}
      {pulseEl && <div ref={pulseRef} className="vf-pulse" />}

      {/* comment popover */}
      {selection && ctx && (
        <div ref={popRef} className="vf-pop" style={{ visibility: 'hidden', top: 0, left: 0 }} role="dialog" aria-label="Leave feedback">
          <div className="vf-ctx">
            <div className="vf-ctx-top">
              <span className="vf-comp">{compName}</span>
              {ctx.instance?.key != null && (
                <span className="vf-chip" title="React key of the repeated instance">
                  key: {ctx.instance.key}
                </span>
              )}
              {ctx.instance?.index != null && <span className="vf-chip vf-grey">#{ctx.instance.index}</span>}
              {ctx.instance?.domId && <span className="vf-chip vf-grey">id: {ctx.instance.domId}</span>}
            </div>
            <div className="vf-file vf-mono">
              {fileLabel(ctx) ? <PathText text={fileLabel(ctx)!} /> : `<${ctx.element.tag}> · no source file detected`}
            </div>
            {crumbs && <div className="vf-crumbs">{crumbs}</div>}
          </div>
          <div className="vf-body">
            <textarea
              className="vf-ta"
              autoFocus
              placeholder="What should change here?"
              value={message}
              maxLength={2000}
              disabled={submitting}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={onTextareaKey}
            />
            <div className="vf-actions">
              <span className="vf-hint">{isMac ? '⌘' : 'Ctrl'}+Enter to send</span>
              <button
                type="button"
                className="vf-btn"
                disabled={submitting}
                onClick={() => {
                  setSelection(null);
                  setMessage('');
                }}
              >
                Cancel
              </button>
              <button type="button" className="vf-btn vf-btn-primary" disabled={submitting || !message.trim()} onClick={() => void submit()}>
                {submitting && <span className="vf-spin" />}
                {submitting ? 'Sending' : 'Submit'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* sidebar */}
      {sidebarOpen && (
        <aside className="vf-side" aria-label="Feedback">
          <div className="vf-side-hd">
            <div className="vf-side-title">
              <h2>Feedback</h2>
              <span className="vf-live" title={`Refreshing every ${POLL_MS / 1000}s`}>
                <i /> live
              </span>
              <button type="button" className="vf-x" aria-label="Close" onClick={() => setSidebarOpen(false)}>
                {Icon.close}
              </button>
            </div>
            <div className="vf-pills" role="tablist">
              {(['all', 'open', 'resolved'] as Filter[]).map((f) => (
                <button key={f} type="button" role="tab" aria-selected={filter === f} className={`vf-pill${filter === f ? ' vf-on' : ''}`} onClick={() => setFilter(f)}>
                  {f === 'all' ? 'All' : f === 'open' ? 'Open' : 'Resolved'} <b>{counts[f]}</b>
                </button>
              ))}
            </div>
          </div>
          {loadError && <div className="vf-err-line" style={{ marginTop: 8 }}>{loadError}</div>}
          <div className="vf-list">
            {visibleItems.length === 0 && (
              <div className="vf-empty">
                {filter === 'all' ? `No feedback yet. Press ${shortcut} and click an element.` : `No ${filter} feedback.`}
              </div>
            )}
            {visibleItems.map((fb) => {
              const c = fb.context;
              const here = isOnCurrentPage(fb);
              const comp = c?.source?.component ?? c?.instance?.component ?? c?.hierarchy?.[c.hierarchy.length - 1]?.component;
              const file = fileLabel(c);
              const shot = absoluteUrl(backendUrl, c?.screenshot);
              const num = pinNumber.get(fb._id);
              return (
                <div
                  key={fb._id}
                  role="button"
                  tabIndex={0}
                  className={`vf-item${focusId === fb._id ? ' vf-focus' : ''}`}
                  onClick={() => focusFeedback(fb)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') focusFeedback(fb);
                  }}
                >
                  <div className="vf-item-top">
                    <span className={`vf-num${fb.status === 'resolved' ? ' vf-done' : ''}`}>{fb.status === 'resolved' ? '✓' : num}</span>
                    <span className="vf-msg">{fb.message}</span>
                    <span className={`vf-badge ${fb.status === 'resolved' ? 'vf-resolved' : 'vf-open'}`}>{fb.status === 'resolved' ? 'Resolved' : 'Open'}</span>
                  </div>
                  <div className="vf-meta-wrap">
                  <div className="vf-meta">
                    {(comp || c?.instance?.key != null) && (
                      <div className="vf-meta-row">
                        {comp && <strong style={{ fontWeight: 600, color: 'var(--vf-ink)' }}>{comp}</strong>}
                        {c?.instance?.key != null && <span className="vf-chip">key: {c.instance.key}</span>}
                      </div>
                    )}
                    {file && (
                      <div className="vf-mono">
                        <PathText text={file} />
                      </div>
                    )}
                  </div>
                  {shot && (
                    <a href={shot} target="_blank" rel="noreferrer" title="Open screenshot" onClick={(e) => e.stopPropagation()}>
                      <img className="vf-thumb" src={shot} alt="Screenshot" loading="lazy" />
                    </a>
                  )}
                  </div>
                  {fb.resolutionComment && (
                    <div className="vf-reply">
                      <div className="vf-reply-h">Agent reply</div>
                      {fb.resolutionComment}
                    </div>
                  )}
                  <div className="vf-foot">
                    <span>{relTime(fb.createdAt)}</span>
                    {!here && <span className="vf-route">on {pathOf(fb.pageUrl)} →</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </aside>
      )}

      {/* launcher */}
      <div className="vf-launcher" style={sidebarOpen ? { right: 400 } : undefined}>
        <button
          type="button"
          className={`vf-lbtn${inspecting ? ' vf-on' : ''}`}
          title={`Comment on an element (${shortcut})`}
          aria-pressed={inspecting}
          onClick={() => (inspecting ? exitInspection() : setInspecting(true))}
        >
          {Icon.target}
          <span>{inspecting ? 'Inspecting' : 'Comment'}</span>
          <span className="vf-kbd">{shortcut}</span>
        </button>
        <span className="vf-sep" />
        <button
          type="button"
          className={`vf-lbtn${sidebarOpen ? ' vf-on' : ''}`}
          title="Show feedback"
          aria-pressed={sidebarOpen}
          onClick={() => setSidebarOpen((o) => !o)}
        >
          {Icon.list}
          {counts.open > 0 && <span className="vf-count">{counts.open}</span>}
        </button>
      </div>

      {toast && (
        <div key={toast.id} className={`vf-toast${toast.kind === 'err' ? ' vf-err' : ''}`} role="status">
          <span className="vf-toast-ic">{toast.kind === 'err' ? '!' : '✓'}</span>
          {toast.text}
        </div>
      )}
    </>,
    container,
  );
}
