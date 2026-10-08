export class ReplayBuffer {
  constructor(retentionMs) {
    this.retentionMs = retentionMs;
    this.events = [];
  }

  add(topic, payload) {
    const event = {
      topic,
      payload,
      ts: Date.now()
    };
    this.events.push(event);
    this.#prune();
    return event;
  }

  query(fromTs, toTs) {
    const from = Number.isFinite(fromTs) ? fromTs : Date.now() - this.retentionMs;
    const to = Number.isFinite(toTs) ? toTs : Date.now();
    return this.events.filter((event) => event.ts >= from && event.ts <= to);
  }

  #prune() {
    const cutoff = Date.now() - this.retentionMs;
    while (this.events.length > 0 && this.events[0].ts < cutoff) {
      this.events.shift();
    }
  }
}
