import type { ProjectPhoto, ProjectSnapshot } from '../shared/types';

const desktopRuntime = '__TAURI_INTERNALS__' in globalThis;
const apiBase = desktopRuntime ? 'http://127.0.0.1:4281' : '';
const localUrl = (path: string) => `${apiBase}${path}`;

export interface ApiReadinessOptions {
  attempts?: number;
  delayMs?: number;
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(localUrl(url), { ...options, headers: { 'Content-Type': 'application/json', ...options?.headers } });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: response.statusText })) as { error?: string };
    throw new Error(payload.error || `Local API error ${response.status}`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export async function waitForLocalApi({ attempts = 100, delayMs = 100 }: ApiReadinessOptions = {}): Promise<void> {
  if (!desktopRuntime) return;
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const health = await request<{ ok: boolean }>('/api/health');
      if (health.ok) return;
      lastError = new Error('The local API returned an unhealthy response.');
    } catch (error) {
      lastError = error;
    }
    if (attempt + 1 < attempts) await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  const detail = lastError instanceof Error ? ` (${lastError.message})` : '';
  throw new Error(`The local desktop service did not start. Close and reopen the application.${detail}`);
}

export const api = {
  waitUntilReady: () => waitForLocalApi(),
  listProjects: () => request<Array<{ id: string; title: string; updatedAt: string }>>('/api/projects'),
  getProject: (id: string) => request<ProjectSnapshot>(`/api/projects/${encodeURIComponent(id)}`),
  saveProject: (project: ProjectSnapshot) => request<ProjectSnapshot>(`/api/projects/${encodeURIComponent(project.id)}`, { method: 'PUT', body: JSON.stringify(project) }),
  deleteProject: (id: string) => request<void>(`/api/projects/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  duplicateProject: (id: string) => request<ProjectSnapshot>(`/api/projects/${encodeURIComponent(id)}/duplicate`, { method: 'POST' }),
  importBackup: (backup: unknown) => request<ProjectSnapshot>('/api/projects/import', { method: 'POST', body: JSON.stringify(backup) }),
  uploadPhoto: (projectId: string, markerId: string, file: File, dataUrl: string, caption = '') => request<ProjectPhoto>(`/api/projects/${encodeURIComponent(projectId)}/photo-assets`, { method: 'POST', body: JSON.stringify({ markerId, fileName: file.name, dataUrl, caption }) }),
  photoUrl: (projectId: string, storedFileName: string) => localUrl(`/api/projects/${encodeURIComponent(projectId)}/photo-files/${encodeURIComponent(storedFileName)}`),
  deletePhoto: (projectId: string, storedFileName: string) => request<void>(`/api/projects/${encodeURIComponent(projectId)}/photo-files/${encodeURIComponent(storedFileName)}`, { method: 'DELETE' })
};
