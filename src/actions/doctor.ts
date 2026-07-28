#!/usr/bin/env bun

import { runDoctorChecks } from "../configuration.ts";

const checks = await runDoctorChecks();
for (const check of checks) {
  console.log(`${check.ok ? "ok" : "not ok"} - ${check.name}: ${check.detail}`);
}
if (checks.some((check) => !check.ok)) {
  process.exit(1);
}
