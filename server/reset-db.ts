import { defaultDatabasePath, resetDatabase } from './db';
resetDatabase();
console.log(`Reset local database and project workspaces: ${defaultDatabasePath}`);
