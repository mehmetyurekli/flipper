// Map generated (served) positions from React 19 owner stacks back to original source lines,
// using the inline source maps Vite attaches to every dev module. Fails quietly to null.

export interface RawFrame {
  url: string; // full served URL incl. query
  line: number;
  column: number;
}

type Segment = [number, number, number, number]; // genCol, srcIdx, srcLine, srcCol
type Decoded = { lines: Segment[][] };

const cache = new Map<string, Promise<Decoded | null>>();

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_MAP: Record<string, number> = {};
for (let i = 0; i < B64.length; i++) B64_MAP[B64[i]] = i;

function decodeMappings(mappings: string): Segment[][] {
  const lines: Segment[][] = [];
  let srcIdx = 0;
  let srcLine = 0;
  let srcCol = 0;
  for (const lineStr of mappings.split(';')) {
    const segs: Segment[] = [];
    let genCol = 0;
    if (lineStr) {
      for (const segStr of lineStr.split(',')) {
        if (!segStr) continue;
        const vals: number[] = [];
        let value = 0;
        let shift = 0;
        for (let i = 0; i < segStr.length; i++) {
          const d = B64_MAP[segStr[i]];
          if (d === undefined) break;
          value += (d & 31) << shift;
          if (d & 32) {
            shift += 5;
          } else {
            const neg = value & 1;
            value >>>= 1;
            vals.push(neg ? -value : value);
            value = 0;
            shift = 0;
          }
        }
        genCol += vals[0] ?? 0;
        if (vals.length >= 4) {
          srcIdx += vals[1];
          srcLine += vals[2];
          srcCol += vals[3];
          segs.push([genCol, srcIdx, srcLine, srcCol]);
        }
      }
    }
    lines.push(segs);
  }
  return lines;
}

function b64ToUtf8(b64: string): string {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

async function loadMap(url: string): Promise<Decoded | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const code = await res.text();
    const m = /\/\/[#@] sourceMappingURL=(\S+)\s*$/.exec(code.trimEnd());
    if (!m) return null;
    let json: string;
    const ref = m[1];
    if (ref.startsWith('data:')) {
      const comma = ref.indexOf(',');
      const meta = ref.slice(5, comma);
      const data = ref.slice(comma + 1);
      json = meta.includes('base64') ? b64ToUtf8(data) : decodeURIComponent(data);
    } else {
      const r = await fetch(new URL(ref, url).href);
      if (!r.ok) return null;
      json = await r.text();
    }
    const map = JSON.parse(json) as { mappings?: string };
    if (!map.mappings) return null;
    return { lines: decodeMappings(map.mappings) };
  } catch {
    return null;
  }
}

/** Original 1-based line/column for a served-module frame, or null. */
export async function mapFrame(f: RawFrame): Promise<{ line: number; column: number } | null> {
  let key: string;
  try {
    const u = new URL(f.url, location.href);
    if (u.origin !== location.origin) return null; // only same-origin dev modules
    key = u.href;
  } catch {
    return null;
  }
  let p = cache.get(key);
  if (!p) {
    p = loadMap(key);
    cache.set(key, p);
  }
  const decoded = await p;
  const segs = decoded?.lines[f.line - 1];
  if (!segs || segs.length === 0) return null;
  const col = f.column - 1;
  let best: Segment | undefined;
  for (const s of segs) {
    if (s[0] <= col) best = s;
    else break;
  }
  best ??= segs[0];
  return { line: best[2] + 1, column: best[3] + 1 };
}
