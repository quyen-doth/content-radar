// Entrypoint: chạy pipeline 1 lần rồi thoát. Xem plan.md §3.
import "dotenv/config"; // nạp .env (tsx không tự nạp)

import { logger } from "./lib/logger.ts";
import { runPipeline } from "./pipeline.ts";

runPipeline()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error("Run thất bại", err);
    process.exit(1);
  });
