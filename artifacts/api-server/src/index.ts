import app from "./app";
import { logger } from "./lib/logger";
import { ensureDatabaseSchema } from "@workspace/db";
import { autoConfigureFromEnv } from "./lib/apk-builder";

const rawPort = process.env["PORT"] || "3000";
const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function main(): Promise<void> {
  logger.info("Initializing database schema...");
  await ensureDatabaseSchema();

  const server = app.listen(port, () => {
    logger.info({ port }, "Server listening");
    try {
      autoConfigureFromEnv();
    } catch (err) {
      logger.warn({ err }, "APK auto-configure failed (non-fatal)");
    }
  });

  server.on("error", (err) => {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  });
}

main().catch((err) => {
  logger.error({ err }, "Server startup failed");
  process.exit(1);
});
