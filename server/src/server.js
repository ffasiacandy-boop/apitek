const app = require('./app');
const cfg = require('./config');
const logger = require('./utils/logger');
const { seedAdmin, seedDemo } = require('./db/seed');
const { purgeSessions } = require('./middleware/auth');

(async () => {
  await seedAdmin();
  await seedDemo();
  purgeSessions();
  setInterval(purgeSessions, 3600 * 1000).unref();
  app.listen(cfg.port, () => {
    logger.info('server_started', { port: cfg.port, env: cfg.env });
    console.log(`\n  Admin:  http://localhost:${cfg.port}/admin/\n  Client: http://localhost:${cfg.port}/client/\n  Demo:   http://localhost:${cfg.port}/demo/\n`);
  });
})().catch((e) => { console.error(e); process.exit(1); });
