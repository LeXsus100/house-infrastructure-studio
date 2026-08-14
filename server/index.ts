import express from 'express';
import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ProjectSnapshot } from '../shared/types';
import { backupSchema, projectSchema } from './validation';
import { defaultDatabasePath, openDatabase, ProjectRepository } from './db';
import { SOFTWARE_NAME } from '../shared/branding';

export interface AppOptions {
  serveStatic?: boolean;
  staticDir?: string;
  projectsDir?: string;
}

const loopbackHost = /^(?:127\.0\.0\.1|localhost|\[::1\])(?::\d{1,5})?$/i;
const loopbackOrigin = /^https?:\/\/(?:127\.0\.0\.1|localhost|\[::1\])(?::\d{1,5})?$/i;
const tauriOrigins = new Set(['tauri://localhost', 'http://tauri.localhost', 'https://tauri.localhost']);
const mutatingMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function isTrustedLocalHost(host: string | undefined): boolean {
  return !!host && loopbackHost.test(host);
}

export function isTrustedLocalOrigin(origin: string | undefined): boolean {
  return !origin || loopbackOrigin.test(origin) || tauriOrigins.has(origin);
}

function isTrustedTauriOrigin(origin: string | undefined): boolean {
  return !!origin && tauriOrigins.has(origin);
}

export function createApp(repository = new ProjectRepository(openDatabase()), options: AppOptions = {}) {
  const app = express();
  const projectsRoot = resolve(options.projectsDir ?? join(dirname(defaultDatabasePath), 'projects'));
  const projectFolder = (id: string) => {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new Error('Invalid project identifier.');
    const folder = resolve(projectsRoot, id);
    if (!folder.startsWith(`${projectsRoot}${sep}`)) throw new Error('Invalid project workspace path.');
    return folder;
  };
  const syncWorkspace = (project: ProjectSnapshot) => {
    const folder = projectFolder(project.id); mkdirSync(join(folder, 'assets'), { recursive: true }); mkdirSync(join(folder, 'exports'), { recursive: true });
    const target = join(folder, 'project.json'); const temporary = join(folder, 'project.json.tmp');
    writeFileSync(temporary, JSON.stringify({ format: 'casa-infrastructure-project', version: 1, project }, null, 2), 'utf8'); renameSync(temporary, target);
  };
  app.disable('x-powered-by');
  app.use((request, response, next) => {
    const host = request.headers.host;
    const origin = request.headers.origin;
    const fetchSite = request.headers['sec-fetch-site'];
    if (!isTrustedLocalHost(host)) return response.status(403).json({ error: 'Only loopback host requests are accepted.' });
    if (!isTrustedLocalOrigin(origin)) return response.status(403).json({ error: 'The request origin is not allowed.' });
    if (mutatingMethods.has(request.method) && fetchSite === 'cross-site' && !isTrustedTauriOrigin(origin)) return response.status(403).json({ error: 'Cross-site project changes are not allowed.' });
    if (origin) {
      response.setHeader('Access-Control-Allow-Origin', origin);
      response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
      response.setHeader('Vary', 'Origin');
    }
    if (request.method === 'OPTIONS') return response.status(204).end();
    return next();
  });
  app.use(express.json({ limit: '40mb' }));

  app.get('/api/health', (_request, response) => response.json({ ok: true, localOnly: true }));
  app.get('/api/projects', (_request, response) => response.json(repository.list()));
  app.get('/api/projects/:id', (request, response) => {
    const project = repository.get(request.params.id);
    if (!project) return response.status(404).json({ error: 'Project not found.' });
    return response.json(project);
  });
  app.put('/api/projects/:id', (request, response) => {
    const parsed = projectSchema.safeParse({ ...request.body, id: request.params.id });
    if (!parsed.success) return response.status(400).json({ error: 'Project validation failed.', details: parsed.error.issues });
    try { const project = repository.save(parsed.data as never); syncWorkspace(project); return response.json(project); }
    catch (error) { return response.status(500).json({ error: error instanceof Error ? error.message : 'Could not save project.' }); }
  });
  app.delete('/api/projects/:id', (request, response) => {
    if (!repository.delete(request.params.id)) return response.status(404).json({ error: 'Project not found.' });
    rmSync(projectFolder(request.params.id), { recursive: true, force: true });
    return response.status(204).end();
  });
  app.post('/api/projects/:id/duplicate', (request, response) => {
    const project = repository.duplicate(request.params.id);
    if (!project) return response.status(404).json({ error: 'Project not found.' });
    syncWorkspace(project);
    return response.status(201).json(project);
  });
  app.get('/api/projects/:id/backup', (request, response) => {
    const project = repository.get(request.params.id);
    if (!project) return response.status(404).json({ error: 'Project not found.' });
    const name = project.title.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'house-project';
    response.setHeader('Content-Disposition', `attachment; filename="${name}-backup.json"`);
    return response.json({ format: 'casa-infrastructure-project', version: 1, project });
  });
  app.post('/api/projects/import', (request, response) => {
    const parsed = backupSchema.safeParse(request.body);
    if (!parsed.success) return response.status(400).json({ error: 'Backup validation failed.', details: parsed.error.issues });
    const project = structuredClone(parsed.data.project);
    if (repository.get(project.id)) project.id = crypto.randomUUID();
    project.updatedAt = new Date().toISOString();
    try { const saved = repository.save(project as never); syncWorkspace(saved); return response.status(201).json(saved); }
    catch (error) { return response.status(500).json({ error: error instanceof Error ? error.message : 'Could not import project.' }); }
  });

  app.post('/api/projects/:id/photo-assets', (request, response) => {
    const project = repository.get(request.params.id);
    if (!project) return response.status(404).json({ error: 'Project not found.' });
    const { markerId, fileName, dataUrl, caption = '' } = request.body as Record<string, unknown>;
    if (typeof markerId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(markerId)) return response.status(400).json({ error: 'The photo marker identifier is invalid.' });
    if (typeof fileName !== 'string' || !fileName.trim() || fileName.length > 255 || typeof caption !== 'string' || caption.length > 1000 || typeof dataUrl !== 'string') return response.status(400).json({ error: 'Photo upload data is invalid.' });
    const match = dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
    if (!match) return response.status(400).json({ error: 'Only local JPEG, PNG, and WebP images are supported.' });
    const bytes = Buffer.from(match[2], 'base64');
    if (!bytes.length || bytes.length > 15 * 1024 * 1024) return response.status(400).json({ error: 'Each photo must be between 1 byte and 15 MB.' });
    const mimeType = match[1] as 'image/jpeg' | 'image/png' | 'image/webp'; const extension = mimeType === 'image/jpeg' ? '.jpg' : mimeType === 'image/png' ? '.png' : '.webp';
    const id = crypto.randomUUID(); const storedFileName = `${id}${extension}`; const photosFolder = join(projectFolder(project.id), 'assets', 'photos'); mkdirSync(photosFolder, { recursive: true });
    writeFileSync(join(photosFolder, storedFileName), bytes);
    return response.status(201).json({ id, markerId, originalFileName: basename(fileName).replace(/[^\p{L}\p{N}._ -]/gu, '_'), storedFileName, mimeType, caption, createdAt: new Date().toISOString() });
  });

  app.get('/api/projects/:id/photo-files/:storedFileName', (request, response) => {
    if (!repository.get(request.params.id)) return response.status(404).json({ error: 'Project not found.' });
    if (!/^[0-9a-f-]{36}\.(?:jpg|png|webp)$/i.test(request.params.storedFileName) || !['.jpg','.png','.webp'].includes(extname(request.params.storedFileName).toLowerCase())) return response.status(400).json({ error: 'Invalid photo file.' });
    return response.sendFile(join(projectFolder(request.params.id), 'assets', 'photos', request.params.storedFileName));
  });

  app.delete('/api/projects/:id/photo-files/:storedFileName', (request, response) => {
    if (!repository.get(request.params.id)) return response.status(404).json({ error: 'Project not found.' });
    if (!/^[0-9a-f-]{36}\.(?:jpg|png|webp)$/i.test(request.params.storedFileName)) return response.status(400).json({ error: 'Invalid photo file.' });
    rmSync(join(projectFolder(request.params.id), 'assets', 'photos', request.params.storedFileName), { force: true });
    return response.status(204).end();
  });

  if (options.serveStatic) {
    const dist = options.staticDir ?? join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
    app.use(express.static(dist, { index: false }));
    app.get(/.*/, (_request, response) => response.sendFile(join(dist, 'index.html')));
  }

  app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
    const message = error instanceof Error ? error.message : 'Unexpected local server error.';
    response.status(500).json({ error: message });
  });
  return app;
}

const isMain = process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1]);
if (isMain) {
  const port = Number(process.env.PORT || 4280);
  createApp().listen(port, '127.0.0.1', () => console.log(`${SOFTWARE_NAME} local API: http://127.0.0.1:${port}`));
}
