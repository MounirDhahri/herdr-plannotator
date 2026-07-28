#!/usr/bin/env bun

import { unconfigurePlannotator } from "../plannotator-config.ts";
import { plannotatorConfigPath } from "../paths.ts";

try {
  const result = await unconfigurePlannotator();
  if (!result.changed) {
    console.log("Plannotator had no Herdr-owned presenter configuration.");
  } else if (result.presenterPreserved) {
    console.log("Removed Herdr ownership metadata and preserved the user-modified presenter.");
  } else {
    console.log("Removed the Herdr presenter and restored the previous Plannotator setting.");
  }
  console.log(`Plannotator config: ${plannotatorConfigPath()}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
