import { createApp } from './index';
import { SOFTWARE_NAME } from '../shared/branding';

const port = Number(process.env.PORT || 4281);
const server = createApp().listen(port, '127.0.0.1', () => {
  console.log(`${SOFTWARE_NAME} desktop API: http://127.0.0.1:${port}`);
});

server.on('error', (error: NodeJS.ErrnoException) => {
  console.error(error.code === 'EADDRINUSE'
    ? `Desktop API port ${port} is already in use.`
    : error.message);
  process.exitCode = 1;
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
