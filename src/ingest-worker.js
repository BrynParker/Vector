import { config } from "./config.js";

console.log("[ingest-worker] standalone ingest worker placeholder.");
console.log("[ingest-worker] For Node egg deployments, ingest runs in-process via src/server.js.");
console.log(
  `[ingest-worker] feed polling configs loaded: opensky=${config.feeds.opensky.enabled} adsb=${config.feeds.adsb.enabled}`
);

setInterval(() => {
  console.log("[ingest-worker] heartbeat");
}, 60000);
