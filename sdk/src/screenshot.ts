import { toCanvas } from 'html-to-image';
import type { BoundingRect } from './types';

const TIMEOUT_MS = 3000;

const REDACT_CSS = `
[data-vf-sensitive], [data-vf-sensitive] * , input[type=password] {
  color: transparent !important; -webkit-text-fill-color: transparent !important;
  text-shadow: none !important; caret-color: transparent !important;
}
[data-vf-sensitive] img, [data-vf-sensitive] svg, [data-vf-sensitive] canvas, [data-vf-sensitive] video { opacity: 0 !important; }
`;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('screenshot timeout')), ms)),
  ]);
}

/** Temporarily blank sensitive content in the live DOM; returns a restore function. */
function redact(): () => void {
  const style = document.createElement('style');
  style.setAttribute('data-vf-redact', '');
  style.textContent = REDACT_CSS;
  document.head.appendChild(style);
  const restored: Array<[HTMLInputElement, string]> = [];
  document.querySelectorAll<HTMLInputElement>('input[type=password], [data-vf-sensitive] input, [data-vf-sensitive] textarea').forEach((inp) => {
    restored.push([inp, inp.value]);
    try {
      inp.value = '';
    } catch {
      /* ignore */
    }
  });
  return () => {
    for (const [inp, v] of restored) {
      try {
        inp.value = v;
      } catch {
        /* ignore */
      }
    }
    style.remove();
  };
}

// Icon-font glyphs (Material Symbols/Icons, Font Awesome) render as their
// ligature words when fonts are skipped; leave them out of the capture.
const ICON_FONT_CLASS = /(^|\s)(material-symbols[\w-]*|material-icons[\w-]*|fa[srlbd]?|fa-solid|fa-regular)(\s|$)/;
function isIconFont(n: Element): boolean {
  const c = n.getAttribute('class');
  return !!c && ICON_FONT_CLASS.test(c);
}

function pageBackground(): string {
  for (const el of [document.body, document.documentElement]) {
    const c = el ? getComputedStyle(el).backgroundColor : '';
    if (c && c !== 'transparent' && !/rgba\(.*,\s*0\)$/.test(c)) return c;
  }
  return '#ffffff';
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((b) => resolve(b), 'image/png');
    } catch {
      resolve(null); // tainted canvas etc.
    }
  });
}

/**
 * Capture the current viewport as a PNG, with a red 2px rectangle around `highlight`.
 * Resolves to null on any failure (never throws).
 */
export async function captureViewport(highlight?: BoundingRect): Promise<Blob | null> {
  const restore = redact();
  try {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const options = {
      width: w,
      height: h,
      canvasWidth: w,
      canvasHeight: h,
      style: { transform: `translate(${-window.scrollX}px, ${-window.scrollY}px)` } as Partial<CSSStyleDeclaration>,
      skipFonts: true,
      cacheBust: true,
      pixelRatio: 1,
      backgroundColor: pageBackground(),
      filter: (n: HTMLElement) =>
        !(n instanceof Element && (n.hasAttribute('data-vf-ignore') || n.hasAttribute('data-vf-redact') || isIconFont(n))),
    };
    // Capture <body>, not <html>: cloning <head> breaks the SVG render on apps
    // that @import cross-origin stylesheets (e.g. Google Fonts into a cascade
    // layer). Styles are inlined per node, so nothing visible is lost.
    const deadline = Date.now() + TIMEOUT_MS;
    let canvas: HTMLCanvasElement;
    try {
      canvas = await withTimeout(toCanvas(document.body, options), TIMEOUT_MS);
    } catch {
      canvas = await withTimeout(toCanvas(document.documentElement, options), Math.max(500, deadline - Date.now()));
    }
    restore();
    if (highlight) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const sx = canvas.width / w;
        const sy = canvas.height / h;
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2 * sx;
        ctx.strokeRect(highlight.x * sx - 1, highlight.y * sy - 1, highlight.width * sx + 2, highlight.height * sy + 2);
      }
    }
    return await toBlob(canvas);
  } catch {
    restore();
    return null;
  }
}
