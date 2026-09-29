import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { defaultDatabasePath, openDatabase, ProjectRepository } from '../server/db';
import { projectSchema } from '../server/validation';
import { findRouteIntersections, isAutomaticRoutePoint, routeLength, routeTurnCount } from '../src/lib/geometry';
import { rebuildProjectRouteGeometry, upgradeProject } from '../src/lib/project';

const argumentsList = process.argv.slice(2); const apply = argumentsList.includes('--apply');
const projectArgument = argumentsList.indexOf('--project'); const requestedProjectId = projectArgument >= 0 ? argumentsList[projectArgument + 1] : undefined;
const db = openDatabase(); const repository = new ProjectRepository(db);

try {
  const summaries = repository.list() as Array<{ id: string; title: string; updatedAt: string }>;
  const summary = requestedProjectId ? summaries.find((item) => item.id === requestedProjectId) : summaries[0];
  if (!summary) throw new Error(requestedProjectId ? `Project ${requestedProjectId} was not found.` : 'No local project was found.');
  const source = repository.get(summary.id); if (!source) throw new Error(`Project ${summary.id} could not be loaded.`);
  const project = upgradeProject(source); let rebuilt = project;
  const geometrySignature = (candidate: typeof project) => candidate.routes.map((route) => `${route.id}:${route.wallIds.join(',')}:${route.points.map((point) => `${point.x},${point.y},${point.z},${point.automatic ?? ''}`).join('|')}`).join('\n');
  for (let pass = 0; pass < 5; pass++) {
    const next = rebuildProjectRouteGeometry(rebuilt); const stable = geometrySignature(next) === geometrySignature(rebuilt); rebuilt = next; if (stable) break;
  }
  if (rebuilt.routes.length !== project.routes.length || rebuilt.routes.some((route) => !project.routes.some((sourceRoute) => sourceRoute.id === route.id))) throw new Error('Route identity validation failed.');
  const parsed = projectSchema.safeParse(rebuilt); if (!parsed.success) throw new Error(`Rebuilt project validation failed: ${parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`);
  const metrics = (candidate: typeof project) => ({
    routes: candidate.routes.length,
    points: candidate.routes.reduce((total, route) => total + route.points.length, 0),
    authoredTurns: candidate.routes.reduce((total, route) => total + routeTurnCount(route), 0),
    automaticHillPoints: candidate.routes.reduce((total, route) => total + route.points.filter(isAutomaticRoutePoint).length, 0),
    lengthMm: candidate.routes.reduce((total, route) => total + routeLength(route, candidate.preferences.routeBendRadiusMm[route.serviceCategory] ?? 0, candidate.walls.filter((wall) => route.wallIds.includes(wall.id))), 0),
    conflicts: findRouteIntersections(candidate.routes, candidate.preferences.routeOverlapPriorities, candidate.preferences.routeSeparationMm, candidate.preferences.routeDiameterMm).length
  });
  const changedRoutes = rebuilt.routes.filter((route) => {
    const previous = project.routes.find((item) => item.id === route.id)!;
    return previous.points.map((point) => `${point.x},${point.y},${point.z}`).join('|') !== route.points.map((point) => `${point.x},${point.y},${point.z}`).join('|');
  });
  const report = { project: { id: project.id, title: project.title }, mode: apply ? 'apply' : 'dry-run', changedRoutes: changedRoutes.map((route) => route.name), before: metrics(project), after: metrics(rebuilt) };
  const remainingConflicts = findRouteIntersections(rebuilt.routes, rebuilt.preferences.routeOverlapPriorities, rebuilt.preferences.routeSeparationMm, rebuilt.preferences.routeDiameterMm).map((conflict) => conflict.label);
  if (apply) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-'); const backupDirectory = join(dirname(defaultDatabasePath), 'backups'); mkdirSync(backupDirectory, { recursive: true });
    const backupPath = join(backupDirectory, `before-route-rebuild-${timestamp}.sqlite`); const escapedBackup = backupPath.replace(/'/g, "''"); db.exec(`VACUUM INTO '${escapedBackup}'`);
    const saved = repository.save(parsed.data as never); const projectDirectory = join(dirname(defaultDatabasePath), 'projects', project.id); mkdirSync(projectDirectory, { recursive: true });
    const workspacePath = join(projectDirectory, 'project.json'); const temporaryPath = `${workspacePath}.tmp`;
    writeFileSync(temporaryPath, JSON.stringify({ format: 'casa-infrastructure-project', version: 1, project: saved }, null, 2), 'utf8'); renameSync(temporaryPath, workspacePath);
    console.log(JSON.stringify({ ...report, remainingConflicts, backupPath, workspacePath }, null, 2));
  } else {
    console.log(JSON.stringify({ ...report, remainingConflicts }, null, 2)); console.log('Dry run only. Add --apply to save the rebuilt route geometry.');
  }
} finally {
  db.close();
}
