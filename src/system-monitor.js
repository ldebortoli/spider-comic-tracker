const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

function directorySize(rootPath) {
  if (!fs.existsSync(rootPath)) return 0;
  let total = 0;
  const pending = [rootPath];

  while (pending.length) {
    const current = pending.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const absolutePath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        pending.push(absolutePath);
      } else if (entry.isFile()) {
        try { total += fs.statSync(absolutePath).size; } catch { /* Ignore transient files. */ }
      }
    }
  }

  return total;
}

function cpuTotals() {
  return os.cpus().reduce((totals, cpu) => {
    for (const [name, value] of Object.entries(cpu.times)) {
      totals[name] = (totals[name] || 0) + value;
    }
    return totals;
  }, {});
}

class SystemMonitor {
  constructor({ dataDir, dbPath }) {
    this.dataDir = dataDir;
    this.dbPath = dbPath;
    this.lastSampleAt = process.hrtime.bigint();
    this.lastProcessCpu = process.cpuUsage();
    this.lastSystemCpu = cpuTotals();
    this.cachedStorage = null;
    this.storageSampleAt = 0;
  }

  sampleStorage() {
    if (this.cachedStorage && Date.now() - this.storageSampleAt < 10_000) {
      return this.cachedStorage;
    }

    let diskTotalBytes = 0;
    let diskFreeBytes = 0;
    try {
      const stats = fs.statfsSync(this.dataDir);
      diskTotalBytes = Number(stats.bsize) * Number(stats.blocks);
      diskFreeBytes = Number(stats.bsize) * Number(stats.bavail);
    } catch {
      // statfs can be unavailable on older Node builds.
    }

    const backupDir = path.join(this.dataDir, "backups");
    this.cachedStorage = {
      databaseBytes: fs.existsSync(this.dbPath) ? fs.statSync(this.dbPath).size : 0,
      backupsBytes: directorySize(backupDir),
      appDataBytes: directorySize(this.dataDir),
      diskTotalBytes,
      diskFreeBytes,
      diskUsedPercent: diskTotalBytes
        ? Number((((diskTotalBytes - diskFreeBytes) / diskTotalBytes) * 100).toFixed(1))
        : null
    };
    this.storageSampleAt = Date.now();
    return this.cachedStorage;
  }

  snapshot() {
    const now = process.hrtime.bigint();
    const elapsedMicros = Math.max(1, Number(now - this.lastSampleAt) / 1_000);
    const currentProcessCpu = process.cpuUsage();
    const processCpuMicros = (currentProcessCpu.user - this.lastProcessCpu.user)
      + (currentProcessCpu.system - this.lastProcessCpu.system);
    const processCpuPercent = Number(((processCpuMicros / elapsedMicros) * 100).toFixed(1));

    const currentSystemCpu = cpuTotals();
    const names = Object.keys(currentSystemCpu);
    const systemDelta = names.reduce((total, name) => total + currentSystemCpu[name] - (this.lastSystemCpu[name] || 0), 0);
    const idleDelta = (currentSystemCpu.idle || 0) - (this.lastSystemCpu.idle || 0);
    const systemCpuPercent = systemDelta > 0
      ? Number((((systemDelta - idleDelta) / systemDelta) * 100).toFixed(1))
      : 0;

    this.lastSampleAt = now;
    this.lastProcessCpu = currentProcessCpu;
    this.lastSystemCpu = currentSystemCpu;

    const memory = process.memoryUsage();
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();

    return {
      sampledAt: new Date().toISOString(),
      process: {
        pid: process.pid,
        cpuPercent: processCpuPercent,
        memoryRssBytes: memory.rss,
        heapUsedBytes: memory.heapUsed,
        heapTotalBytes: memory.heapTotal,
        uptimeSeconds: Math.floor(process.uptime())
      },
      system: {
        cpuPercent: systemCpuPercent,
        logicalCores: os.cpus().length,
        totalMemoryBytes: totalMemory,
        freeMemoryBytes: freeMemory,
        usedMemoryPercent: Number((((totalMemory - freeMemory) / totalMemory) * 100).toFixed(1)),
        uptimeSeconds: Math.floor(os.uptime()),
        platform: process.platform,
        architecture: process.arch,
        nodeVersion: process.version,
        hostname: os.hostname()
      },
      storage: this.sampleStorage()
    };
  }
}

module.exports = { SystemMonitor };
