const fs = require("node:fs");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);
const VALID_DAYS = new Set(["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"]);

function updateEnvFile(envPath, values) {
  const lines = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8").split(/\r?\n/) : [];
  for (const [key, value] of Object.entries(values)) {
    const index = lines.findIndex((line) => new RegExp(`^\\s*${key}\\s*=`).test(line));
    const nextLine = `${key}=${value}`;
    if (index === -1) lines.push(nextLine);
    else lines[index] = nextLine;
  }
  fs.writeFileSync(envPath, `${lines.filter((line, index) => line || index < lines.length - 1).join("\n")}\n`, "utf8");
}

class AutomationManager {
  constructor({ config, projectRoot }) {
    this.config = config;
    this.projectRoot = projectRoot;
    this.envPath = path.join(projectRoot, ".env");
    this.markerPath = path.join(projectRoot, "data", "weekly-task-installed.json");
  }

  getStatus() {
    let marker = {};
    try { marker = JSON.parse(fs.readFileSync(this.markerPath, "utf8").replace(/^\uFEFF/, "")); } catch { marker = {}; }
    return {
      enabled: this.config.schedule.enabled,
      day: this.config.schedule.day,
      hour: this.config.schedule.hour,
      minute: this.config.schedule.minute,
      timezone: this.config.timezone,
      platform: process.platform,
      externalTaskInstalled: Boolean(marker.installedAt),
      taskName: marker.taskName || "",
      installedAt: marker.installedAt || "",
      duplicateProtection: true,
      schedulerOwner: "server",
      botSchedulesUpdates: false
    };
  }

  async configure({ enabled, day, hour, minute }) {
    const normalizedDay = String(day || "").toUpperCase();
    const normalizedHour = Number(hour);
    const normalizedMinute = Number(minute);
    if (!VALID_DAYS.has(normalizedDay)) throw new Error("Día semanal no válido.");
    if (!Number.isInteger(normalizedHour) || normalizedHour < 0 || normalizedHour > 23) throw new Error("Hora no válida.");
    if (!Number.isInteger(normalizedMinute) || normalizedMinute < 0 || normalizedMinute > 59) throw new Error("Minuto no válido.");

    this.config.schedule.enabled = Boolean(enabled);
    this.config.schedule.day = normalizedDay;
    this.config.schedule.hour = normalizedHour;
    this.config.schedule.minute = normalizedMinute;
    updateEnvFile(this.envPath, {
      SCHEDULE_ENABLED: this.config.schedule.enabled ? "true" : "false",
      SCHEDULE_DAY: normalizedDay,
      SCHEDULE_HOUR: normalizedHour,
      SCHEDULE_MINUTE: normalizedMinute
    });

    if (process.platform === "win32") {
      const scriptName = this.config.schedule.enabled ? "install-weekly-task.ps1" : "uninstall-weekly-task.ps1";
      await execFileAsync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(this.projectRoot, "scripts", scriptName)], {
        cwd: this.projectRoot,
        windowsHide: true,
        timeout: 60_000
      });
    }
    return this.getStatus();
  }
}

module.exports = { AutomationManager, updateEnvFile };
