import type {
  ElementContext,
  FeedbackContext,
  FileStrategy,
  HierarchyEntry,
  InstanceContext,
  InstanceStrategy,
  SourceLocation,
} from './types';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Fiber = any;

const MAX_HIERARCHY = 15;
const MAX_STR = 200;
const MAX_SELECTOR_DEPTH = 8;

// ---------------------------------------------------------------------------
// Fiber helpers
// ---------------------------------------------------------------------------

export function getFiber(el: Element | null): Fiber | null {
  if (!el) return null;
  const key = Object.keys(el).find((k) => k.startsWith('__reactFiber$'));
  return key ? (el as any)[key] : null;
}

/** Name of a component type, unwrapping memo / forwardRef / lazy. */
export function typeName(type: any, depth = 0): string | undefined {
  if (!type || depth > 4) return undefined;
  if (typeof type === 'function') return type.displayName || type.name || undefined;
  if (typeof type === 'object') {
    if (typeof type.displayName === 'string' && type.displayName) return type.displayName;
    if (type.render) return typeName(type.render, depth + 1); // forwardRef
    if (type.type) return typeName(type.type, depth + 1); // memo
  }
  return undefined;
}

function isComponentFiber(f: Fiber): boolean {
  const t = f?.type;
  if (!t) return false;
  if (typeof t === 'function') return true;
  // forwardRef / memo objects
  return typeof t === 'object' && (!!t.render || typeof t.type === 'function' || typeof t.type === 'object');
}

/** Component names we never want to surface (anonymous, minified, framework internals). */
function usableName(name: string | undefined): name is string {
  if (!name) return false;
  if (name.length <= 1) return false; // minified
  if (name === 'Anonymous' || name === '_c') return false;
  return true;
}

// ---------------------------------------------------------------------------
// Path normalization + source parsers
// ---------------------------------------------------------------------------

/** Make a path repo-relative: forward slashes, strip origin/query, keep from first `src/`. */
export function normalizePath(raw: string): string {
  let p = raw.replace(/\\/g, '/');
  p = p.replace(/^[a-z]+:\/\/[^/]+/i, ''); // origin
  p = p.replace(/[?#].*$/, '');
  if (p.startsWith('/@fs/')) p = p.slice(4);
  const i = p.indexOf('/src/');
  if (i >= 0) return p.slice(i + 1);
  if (p.startsWith('src/')) return p;
  return p.replace(/^(\.\/)+/, '').replace(/^\/+/, '');
}

type Loc = { file: string; line: number; column?: number };

function fromDebugSource(f: Fiber): Loc | null {
  const s = f?._debugSource;
  if (s && typeof s.fileName === 'string' && typeof s.lineNumber === 'number') {
    return { file: normalizePath(s.fileName), line: s.lineNumber, column: s.columnNumber };
  }
  return null;
}

const FRAME_RE = /(?:\(|@|\s)((?:https?:\/\/[^\s()]+?|\/[^\s()]+?)):(\d+):(\d+)\)?\s*$/;

/** Parse a React 19 owner stack (fiber._debugStack, an Error). First frame under /src/. */
export function parseStack(stack: unknown): Loc | null {
  let text: string | undefined;
  if (stack && typeof stack === 'object' && 'stack' in (stack as any)) text = (stack as any).stack;
  else if (typeof stack === 'string') text = stack;
  if (!text) return null;
  for (const line of text.split('\n')) {
    if (!line.includes('/src/') || line.includes('/node_modules/')) continue;
    const m = FRAME_RE.exec(line.trim());
    if (!m) continue;
    return { file: normalizePath(m[1]), line: Number(m[2]), column: Number(m[3]) };
  }
  return null;
}

function fromDebugStack(f: Fiber): Loc | null {
  try {
    return parseStack(f?._debugStack);
  } catch {
    return null;
  }
}

/**
 * Attribute-based locations from build plugins:
 *  - @react-dev-inspector/babel-plugin: data-inspector-relative-path / -line / -column
 *  - code-inspector-plugin: data-insp-path="path:line:col:tag"
 */
export function fromInspectorAttrs(el: Element | null): Loc | null {
  let cur: Element | null = el;
  while (cur && cur !== document.documentElement) {
    const rel = cur.getAttribute('data-inspector-relative-path');
    if (rel) {
      const line = Number(cur.getAttribute('data-inspector-line'));
      const col = Number(cur.getAttribute('data-inspector-column'));
      if (line) return { file: normalizePath(rel), line, column: col || undefined };
    }
    const insp = cur.getAttribute('data-insp-path');
    if (insp) {
      // path may itself contain ':' (e.g. C:/...), so parse from the right: path:line:col:tag
      const m = /^(.*):(\d+):(\d+)(?::[^:]*)?$/.exec(insp);
      if (m) return { file: normalizePath(m[1]), line: Number(m[2]), column: Number(m[3]) };
    }
    cur = cur.parentElement;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Props summary
// ---------------------------------------------------------------------------

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (!v || typeof v !== 'object') return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

function isReactElement(v: any): boolean {
  return !!v && typeof v === 'object' && typeof v.$$typeof === 'symbol';
}

function primitive(v: unknown): unknown | undefined {
  if (v === null) return null;
  switch (typeof v) {
    case 'string':
      return v.length > MAX_STR ? v.slice(0, MAX_STR) + '…' : v;
    case 'number':
    case 'boolean':
      return v;
    default:
      return undefined;
  }
}

export function summarizeProps(props: unknown): Record<string, unknown> | undefined {
  if (!props || typeof props !== 'object') return undefined;
  const out: Record<string, unknown> = {};
  let n = 0;
  for (const [k, v] of Object.entries(props as Record<string, unknown>)) {
    if (k === 'children' || k === 'key' || k === 'ref') continue;
    if (n >= 40) break;
    const p = primitive(v);
    if (p !== undefined) {
      out[k] = p;
      n++;
      continue;
    }
    if (isPlainObject(v) && !isReactElement(v)) {
      const inner: Record<string, unknown> = {};
      let m = 0;
      for (const [ik, iv] of Object.entries(v)) {
        if (m >= 30) break;
        const ip = primitive(iv);
        if (ip !== undefined) {
          inner[ik] = ip;
          m++;
        }
      }
      if (m > 0) {
        out[k] = inner;
        n++;
      }
    } else if (Array.isArray(v)) {
      const prims = v.slice(0, 10).map(primitive).filter((x) => x !== undefined);
      if (prims.length === v.slice(0, 10).length && prims.length > 0) {
        out[k] = prims;
        n++;
      }
    }
  }
  return n > 0 ? out : undefined;
}

// ---------------------------------------------------------------------------
// DOM context
// ---------------------------------------------------------------------------

function cssEscape(s: string): string {
  return typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(s) : s.replace(/[^a-zA-Z0-9_-]/g, '\\$&');
}

export function selectorFor(el: Element): string {
  const parts: string[] = [];
  let cur: Element | null = el;
  let depth = 0;
  while (cur && cur.nodeType === 1 && depth < MAX_SELECTOR_DEPTH) {
    const tag = cur.tagName.toLowerCase();
    if (cur.id && !/^\d/.test(cur.id)) {
      const sel = `#${cssEscape(cur.id)}`;
      try {
        if (document.querySelectorAll(sel).length === 1) {
          parts.unshift(sel);
          break;
        }
      } catch {
        /* ignore */
      }
    }
    if (tag === 'html' || tag === 'body') {
      parts.unshift(tag);
      break;
    }
    let part = tag;
    const parent: Element | null = cur.parentElement;
    if (parent) {
      const same = Array.from(parent.children).filter((c) => c.tagName === cur!.tagName);
      if (same.length > 1) part += `:nth-of-type(${same.indexOf(cur) + 1})`;
    }
    parts.unshift(part);
    cur = parent;
    depth++;
  }
  return parts.join(' > ');
}

export function isSensitive(el: Element): boolean {
  if (el instanceof HTMLInputElement && el.type === 'password') return true;
  return !!el.closest('[data-vf-sensitive]') || !!el.querySelector?.('input[type=password]');
}

function elementText(el: Element): string | undefined {
  if (isSensitive(el)) return undefined;
  const raw = (el as HTMLElement).innerText ?? el.textContent ?? '';
  const t = raw.replace(/\s+/g, ' ').trim();
  if (!t) return undefined;
  return t.length > MAX_STR ? t.slice(0, MAX_STR) + '…' : t;
}

const ATTR_NAMES = ['id', 'class', 'name', 'href', 'alt', 'role', 'aria-label'];

function elementAttributes(el: Element): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  for (const a of Array.from(el.attributes)) {
    const n = a.name;
    if (ATTR_NAMES.includes(n) || (n.startsWith('data-') && !n.startsWith('data-inspector-') && n !== 'data-insp-path')) {
      out[n] = a.value.length > MAX_STR ? a.value.slice(0, MAX_STR) + '…' : a.value;
    }
  }
  return Object.keys(out).length ? out : undefined;
}

function rectOf(el: Element) {
  const r = el.getBoundingClientRect();
  return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
}

function domIdFor(el: Element): string | undefined {
  const holder = el.closest('[data-vf-instance],[data-testid]');
  if (!holder) return undefined;
  return holder.getAttribute('data-vf-instance') || holder.getAttribute('data-testid') || undefined;
}

// ---------------------------------------------------------------------------
// resolveElement
// ---------------------------------------------------------------------------

export type ResolvedContext = Omit<FeedbackContext, 'screenshot'>;

export function resolveElement(el: Element): ResolvedContext {
  const fiber = getFiber(el);

  // --- hierarchy + nearest component (innermost first while walking) ---
  const walked: HierarchyEntry[] = [];
  let keyed: Fiber | null = null;
  let nearestComponent: string | undefined;
  for (let f = fiber, guard = 0; f && guard < 500; f = f.return, guard++) {
    if (!keyed && f.key != null) keyed = f;
    if (isComponentFiber(f)) {
      const name = typeName(f.type);
      if (!usableName(name)) continue;
      if (!nearestComponent) nearestComponent = name;
      const prev = walked[walked.length - 1];
      // memo()/forwardRef wrappers produce an outer + inner fiber with the same name
      if (prev && prev.component === name) {
        if (prev.key === undefined && f.key != null) prev.key = String(f.key);
        continue;
      }
      const entry: HierarchyEntry = { component: name };
      if (f.key != null) entry.key = String(f.key);
      if (typeof f.index === 'number') entry.index = f.index;
      const loc = fromDebugSource(f) ?? fromDebugStack(f);
      if (loc) {
        entry.file = loc.file;
        entry.line = loc.line;
      }
      walked.push(entry);
    }
  }
  const hierarchy = walked.slice(0, MAX_HIERARCHY).reverse(); // outermost first

  // --- source location ---
  let source: SourceLocation | undefined;
  let fileStrategy: FileStrategy = 'none';
  const owner = fiber?._debugOwner;
  const ownerName = owner ? typeName(owner.type) : undefined;
  const component = usableName(ownerName) ? ownerName : nearestComponent;
  let loc = fromDebugSource(fiber);
  if (loc) fileStrategy = 'debugSource';
  if (!loc) {
    loc = fromInspectorAttrs(el);
    if (loc) fileStrategy = 'inspectorAttr';
  }
  if (!loc) {
    // nearest fiber with a parsable owner stack (host fibers created from JSX carry one)
    for (let f = fiber, i = 0; f && i < 50 && !loc; f = f.return, i++) loc = fromDebugStack(f);
    if (loc) fileStrategy = 'debugStack';
  }
  if (loc) source = { ...loc, component };

  // --- instance ---
  let instance: InstanceContext | undefined;
  let instanceStrategy: InstanceStrategy = 'none';
  const domId = domIdFor(el);
  if (keyed) {
    instanceStrategy = 'fiberKey';
    let instComponent = isComponentFiber(keyed) ? typeName(keyed.type) : undefined;
    if (!usableName(instComponent)) {
      const o = keyed._debugOwner ? typeName(keyed._debugOwner.type) : undefined;
      instComponent = usableName(o) ? `${o} > ${keyed.type}` : String(keyed.type ?? '');
    }
    instance = {
      key: String(keyed.key),
      index: typeof keyed.index === 'number' ? keyed.index : undefined,
      component: instComponent || undefined,
      propsSummary: summarizeProps(keyed.memoizedProps),
    };
    if (domId) instance.domId = domId;
  } else if (domId) {
    instanceStrategy = 'domId';
    instance = { domId };
  }

  // --- DOM fallback ---
  const element: ElementContext = {
    tag: el.tagName.toLowerCase(),
    selector: selectorFor(el),
    boundingRect: rectOf(el),
  };
  const text = elementText(el);
  if (text) element.text = text;
  const attrs = elementAttributes(el);
  if (attrs) element.attributes = attrs;

  return {
    element,
    source,
    instance,
    hierarchy,
    discovery: { fileStrategy, instanceStrategy },
    viewport: { width: window.innerWidth, height: window.innerHeight },
    scrollPosition: { x: Math.round(window.scrollX), y: Math.round(window.scrollY) },
    userAgent: navigator.userAgent,
  };
}

/** Cheap label for the hover overlay: "ComponentName · key". */
export function quickLabel(el: Element): string {
  const fiber = getFiber(el);
  let name: string | undefined;
  let key: string | undefined;
  for (let f = fiber, i = 0; f && i < 200 && !(name && key); f = f.return, i++) {
    if (!key && f.key != null) key = String(f.key);
    if (!name && isComponentFiber(f)) {
      const n = typeName(f.type);
      if (usableName(n)) name = n;
    }
  }
  const owner = fiber?._debugOwner ? typeName(fiber._debugOwner.type) : undefined;
  if (usableName(owner)) name = owner;
  const base = name ?? el.tagName.toLowerCase();
  return key ? `${base} · ${key}` : base;
}
