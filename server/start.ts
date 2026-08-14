import { createApp } from './index';
import { SOFTWARE_NAME } from '../shared/branding';

const port = Number(process.env.PORT || 4280);
const server = createApp(undefined, { serveStatic: true }).listen(port, '127.0.0.1', () => {
  console.log(`${SOFTWARE_NAME}: http://127.0.0.1:${port}`);
});

server.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${port} is already in use. Close the existing local server window, then try again.`);
  } else {
    console.error(error.message);
  }
  process.exitCode = 1;
});
