import type { Feedback } from './types';

function q(sel: string): Element | null {
  try {
    return document.querySelector(sel);
  } catch {
    return null;
  }
}

function visible(el: Element | null): el is Element {
  if (!el || el.closest('[data-vf-ignore]')) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 || r.height > 0;
}

/** Re-locate a feedback's element on the current page: domId, then selector, else null. */
export function locateFeedback(fb: Feedback): Element | null {
  const ctx = fb.context;
  if (!ctx) return null;
  const domId = ctx.instance?.domId;
  const selector = ctx.element?.selector;
  const bySelector = selector ? q(selector) : null;
  if (domId) {
    const esc = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(domId) : domId.replace(/"/g, '\\"');
    const holder = q(`[data-vf-instance="${esc}"]`) ?? q(`[data-testid="${esc}"]`);
    if (visible(holder)) {
      // Prefer the precise element if the selector still points inside the right instance.
      if (bySelector && holder.contains(bySelector) && visible(bySelector)) return bySelector;
      return holder;
    }
  }
  return visible(bySelector) ? bySelector : null;
}

export function pathOf(url: string): string {
  try {
    return new URL(url, location.href).pathname;
  } catch {
    return url;
  }
}

export function isOnCurrentPage(fb: Feedback): boolean {
  return !fb.pageUrl || pathOf(fb.pageUrl) === location.pathname;
}
