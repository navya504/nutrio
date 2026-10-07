import app from "./app";
import { logger } from "./lib/logger";
import { initializeCatalogue } from "./lib/catalogue-store";
import { startNewsletterNotificationWorker } from "./lib/newsletter-notifications";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

initializeCatalogue().then(() => app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  startNewsletterNotificationWorker();
})).catch((err) => {
  logger.error({ err }, "Catalogue migration failed; refusing to serve incomplete operational data");
  process.exit(1);
});
