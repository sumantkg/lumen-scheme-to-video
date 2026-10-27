/**
 * Background pipeline worker.
 *
 *   pnpm worker          # poll forever
 *   pnpm worker --once   # drain the queue, then exit
 *
 * Runs as its own process so heavy work never blocks the web server.
 */
import "dotenv/config";

import { recoverStuckTasks } from "@/lib/pipeline/queue";
import { processOneTask } from "@/lib/pipeline/runner";

const POLL_MS = Number(process.env.WORKER_POLL_MS ?? 1500);
const runOnce = process.argv.includes("--once");

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function main(): Promise<void> {
  console.log(`[worker] starting (mode=${runOnce ? "once" : "loop"})`);

  const recovered = await recoverStuckTasks();
  if (recovered > 0) console.log(`[worker] requeued ${recovered} stale task(s)`);

  let stopping = false;
  const requestStop = () => {
    if (stopping) return;
    stopping = true;
    console.log("[worker] finishing current task, then stopping…");
  };
  process.on("SIGINT", requestStop);
  process.on("SIGTERM", requestStop);

  let processed = 0;

  while (!stopping) {
    let outcome: string;
    try {
      outcome = await processOneTask();
    } catch (error) {
      console.error("[worker] unexpected error:", error);
      outcome = "idle";
    }

    if (outcome !== "idle") {
      processed += 1;
      console.log(`[worker] task ${outcome} (${processed} this session)`);
    }

    if (runOnce) {
      if (outcome === "idle") break;
      continue;
    }

    if (outcome === "idle") await sleep(POLL_MS);
  }

  console.log(`[worker] stopped after ${processed} task(s)`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("[worker] fatal:", error);
    process.exit(1);
  });
