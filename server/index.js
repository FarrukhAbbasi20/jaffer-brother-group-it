import 'dotenv/config';
import app from './app.js';

const port = Number(process.env.PORT || 3850);

const server = app.listen(port, () => {
  console.log(`Jaffer Brothers Group IT listening on http://localhost:${port}`);
});

server.on('error', (err) => {
  // Unhandled listen errors (esp. EADDRINUSE) previously crashed Node with
  // "throw er; // Unhandled 'error' event" and left nginx returning 502 / errno 111.
  console.error('HTTP server failed to bind:', err?.code || err?.message || err);
  process.exitCode = 1;
  process.exit(1);
});

function shutdown(signal) {
  console.log(`Received ${signal}, shutting down…`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 8000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  console.error('unhandledRejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('uncaughtException:', err);
  process.exit(1);
});
