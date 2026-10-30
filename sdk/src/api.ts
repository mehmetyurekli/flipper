import type { CreateFeedbackPayload, Feedback } from './types';

function base(url: string): string {
  return url.replace(/\/+$/, '');
}

export async function postFeedback(backendUrl: string, payload: CreateFeedbackPayload, screenshot: Blob | null): Promise<Feedback | null> {
  const fd = new FormData();
  fd.append('payload', JSON.stringify(payload));
  if (screenshot) fd.append('screenshot', screenshot, 'screenshot.png');
  const res = await fetch(`${base(backendUrl)}/feedback`, { method: 'POST', body: fd });
  if (!res.ok) {
    let detail = '';
    try {
      const j = await res.json();
      detail = Array.isArray(j?.message) ? j.message.join(', ') : j?.message ?? '';
    } catch {
      /* ignore */
    }
    throw new Error(detail || `HTTP ${res.status}`);
  }
  try {
    return (await res.json()) as Feedback;
  } catch {
    return null;
  }
}

export async function listFeedback(backendUrl: string, projectId: string, signal?: AbortSignal): Promise<Feedback[]> {
  const res = await fetch(`${base(backendUrl)}/projects/${encodeURIComponent(projectId)}/feedback`, { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const list: unknown = Array.isArray(data) ? data : data?.items ?? data?.data ?? data?.feedback ?? [];
  return Array.isArray(list) ? (list as Feedback[]) : [];
}

/** Screenshot URLs may come back relative to the backend. */
export function absoluteUrl(backendUrl: string, url?: string): string | undefined {
  if (!url) return undefined;
  if (/^(https?:|data:|blob:)/.test(url)) return url;
  return `${base(backendUrl)}/${url.replace(/^\/+/, '')}`;
}
