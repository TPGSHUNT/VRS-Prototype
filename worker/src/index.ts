// VRS report worker entry point.
// Picks up jobs from the BullMQ "reports" queue and dispatches to the matching handler.
// Run as a separate Azure Container App in production; locally via `npm run dev:worker`.

import { Worker } from 'bullmq';
import IORedis from 'ioredis';

const connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

const worker = new Worker(
  'reports',
  async (job) => {
    console.log(`[worker] picking up job ${job.id} (${job.name})`);
    // Dispatcher lands here in Sprint 3 — see /worker/src/handlers/*
    throw new Error(`No handler registered for job type: ${job.name}`);
  },
  { connection },
);

worker.on('completed', (job) => console.log(`[worker] completed ${job.id}`));
worker.on('failed', (job, err) => console.error(`[worker] failed ${job?.id}:`, err.message));

console.log('[worker] VRS report worker online — listening on queue "reports"');
