const EventEmitter = require('events');

const DEFAULT_INTERVAL_MS = 60000;

function createAutoScanService({ getPreferences, savePreferences, listCustomers, runScan }) {
  if (typeof getPreferences !== 'function') {
    throw new Error('getPreferences function is required for AutoScanService.');
  }
  if (typeof savePreferences !== 'function') {
    throw new Error('savePreferences function is required for AutoScanService.');
  }
  if (typeof listCustomers !== 'function') {
    throw new Error('listCustomers function is required for AutoScanService.');
  }
  if (typeof runScan !== 'function') {
    throw new Error('runScan function is required for AutoScanService.');
  }

  class AutoScanService extends EventEmitter {
    constructor() {
      super();
      const initial = getPreferences() || {};
      this.enabled = Boolean(initial.enabled);
      this.intervalMs =
        typeof initial.intervalMs === 'number' && initial.intervalMs > 0
          ? initial.intervalMs
          : DEFAULT_INTERVAL_MS;
      this.isRunning = false;
      this.timer = null;
      this.lastRunAt = null;
      this.nextRunAt = null;
      this.initialised = false;
    }

    async init() {
      if (this.initialised) {
        return;
      }
      this.initialised = true;
      if (this.enabled) {
        this.schedule(0);
      }
      this.emitStatus();
    }

    getStatus() {
      return {
        enabled: this.enabled,
        intervalMs: this.intervalMs,
        isRunning: this.isRunning,
        lastRunAt: this.lastRunAt,
        nextRunAt: this.nextRunAt
      };
    }

    emitStatus() {
      this.emit('status', this.getStatus());
    }

    clearTimer() {
      if (this.timer) {
        clearTimeout(this.timer);
        this.timer = null;
      }
    }

    schedule(delay = this.intervalMs) {
      if (!this.enabled) {
        this.clearTimer();
        this.nextRunAt = null;
        return;
      }
      const clampedDelay = delay < 0 ? 0 : delay;
      this.clearTimer();
      const nextRunTime = Date.now() + clampedDelay;
      this.nextRunAt = new Date(nextRunTime).toISOString();
      this.timer = setTimeout(() => {
        this.execute().catch((error) => {
          console.error('AutoScanService: execution failed', error);
        });
      }, clampedDelay);
    }

    async setEnabled(enabled) {
      const nextEnabled = Boolean(enabled);
      if (this.enabled === nextEnabled) {
        return this.getStatus();
      }
      this.enabled = nextEnabled;
      savePreferences({
        enabled: this.enabled,
        intervalMs: this.intervalMs
      });
      if (this.enabled) {
        this.schedule(0);
      } else {
        this.clearTimer();
        this.nextRunAt = null;
      }
      this.emitStatus();
      return this.getStatus();
    }

    async execute() {
      if (!this.enabled) {
        return;
      }
      if (this.isRunning) {
        this.schedule(this.intervalMs);
        return;
      }
      this.isRunning = true;
      this.lastRunAt = new Date().toISOString();
      this.emitStatus();
      try {
        const customers = listCustomers();
        for (const customer of customers) {
          if (!customer || !customer.id) {
            continue;
          }
          const subnet = customer.subnet && typeof customer.subnet === 'string' ? customer.subnet.trim() : '';
          if (!subnet) {
            continue;
          }
          try {
            await runScan({
              customerId: customer.id,
              subnet
            });
          } catch (error) {
            console.error(`AutoScanService: scan failed for customer ${customer.id}`, error);
          }
        }
      } finally {
        this.isRunning = false;
        if (this.enabled) {
          this.schedule(this.intervalMs);
        } else {
          this.clearTimer();
          this.nextRunAt = null;
        }
        this.emitStatus();
      }
    }
  }

  return new AutoScanService();
}

module.exports = createAutoScanService;
