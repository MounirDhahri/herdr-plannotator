#!/usr/bin/env bun

import { configureIntegration } from "../configuration.ts";

try {
  const result = await configureIntegration();
  console.log("Plannotator will now open reviews inside Herdr.");
  console.log(`Presenter: ${result.presenterCommand}`);
  console.log(`Plannotator config: ${result.plannotatorConfig}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
