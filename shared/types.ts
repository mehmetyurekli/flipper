// Shared contract between sdk, backend and mcp-server. Type-only; no runtime code.

export type FeedbackStatus = 'open' | 'resolved';

export type FileStrategy = 'debugSource' | 'inspectorAttr' | 'debugStack' | 'none';
export type InstanceStrategy = 'fiberKey' | 'domId' | 'none';

export interface BoundingRect { x: number; y: number; width: number; height: number }

export interface ElementContext {
  tag: string;
  text?: string;
  selector: string;
  attributes?: Record<string, string>;
  boundingRect: BoundingRect;
}

export interface SourceLocation {
  file: string;      // repo-relative, forward slashes, e.g. "src/modules/admin/components/GlobalMetricCards.tsx"
  line: number;
  column?: number;
  component?: string;
}

export interface InstanceContext {
  key?: string;      // React fiber key of nearest keyed ancestor
  index?: number;    // fiber.index of that ancestor
  domId?: string;    // data-vf-instance / data-testid on nearest DOM ancestor
  component?: string;
  propsSummary?: Record<string, unknown>;
}

export interface HierarchyEntry {
  component: string;
  key?: string;
  index?: number;
  file?: string;
  line?: number;
}

export interface FeedbackContext {
  element: ElementContext;
  source?: SourceLocation;
  instance?: InstanceContext;
  hierarchy: HierarchyEntry[];
  discovery: { fileStrategy: FileStrategy; instanceStrategy: InstanceStrategy };
  screenshot?: string; // URL, set by backend
  viewport: { width: number; height: number };
  scrollPosition: { x: number; y: number };
  userAgent?: string;
}

// Body of the `payload` multipart field on POST /feedback
export interface CreateFeedbackPayload {
  projectId: string;
  message: string;
  pageUrl: string;
  context: Omit<FeedbackContext, 'screenshot'>;
}

export interface Feedback {
  _id: string;
  projectId: string;
  message: string;
  status: FeedbackStatus;
  resolutionComment?: string;
  pageUrl: string;
  context: FeedbackContext;
  createdAt: string;
  resolvedAt?: string;
}

export interface Project {
  _id: string;
  name: string;
  repositoryUrl?: string;
  createdAt: string;
}

export interface UpdateStatusPayload {
  status: FeedbackStatus;
  resolutionComment?: string;
}
