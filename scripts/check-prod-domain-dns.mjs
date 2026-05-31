#!/usr/bin/env node
import { spawn } from "node:child_process";

const DEFAULT_AWS_PROFILE = "indieverse-root";
const HOSTED_ZONE_ID = "Z07945021SWCUENBCS47G";
const PRODUCTION_DOMAIN = "shaders.deepansh.in";
const ALLOW_EXISTING_RECORDS = "ALLOW_EXISTING_PRODUCTION_DOMAIN_RECORDS";

function awsEnv() {
  const env = { ...process.env };
  const hasExplicitCredentials =
    env.AWS_PROFILE ||
    env.AWS_DEFAULT_PROFILE ||
    env.AWS_ACCESS_KEY_ID ||
    env.AWS_WEB_IDENTITY_TOKEN_FILE ||
    env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI;

  if (!hasExplicitCredentials) {
    env.AWS_PROFILE = DEFAULT_AWS_PROFILE;
  }

  return env;
}

function run(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });

    child.on("error", (error) => {
      reject(new Error(`Unable to run ${command}: ${error.message}`));
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        const detail = stderr.trim() ? `\n${stderr.trim()}` : "";
        reject(new Error(`${command} ${args.join(" ")} failed with exit code ${code}${detail}`));
      }
    });
  });
}

function productionRecordName() {
  return `${PRODUCTION_DOMAIN}.`;
}

async function listRecordSets(env) {
  const result = await run(
    "aws",
    ["route53", "list-resource-record-sets", "--hosted-zone-id", HOSTED_ZONE_ID, "--output", "json"],
    env,
  );

  try {
    return JSON.parse(result.stdout).ResourceRecordSets ?? [];
  } catch (error) {
    throw new Error(`Unable to parse Route 53 records: ${error.message}`);
  }
}

async function main() {
  const env = awsEnv();
  const recordName = productionRecordName();
  const recordSets = await listRecordSets(env);
  const existingRecords = recordSets.filter((record) => record.Name === recordName);

  if (existingRecords.length === 0) {
    console.log(`No existing ${recordName} records found in hosted zone ${HOSTED_ZONE_ID}.`);
    return;
  }

  const summary = existingRecords.map((record) => `${record.Name} ${record.Type}`).join(", ");
  if (env[ALLOW_EXISTING_RECORDS] === "1") {
    console.log(`Existing ${recordName} records approved by ${ALLOW_EXISTING_RECORDS}=1: ${summary}`);
    return;
  }

  throw new Error(
    `Existing ${recordName} records found in hosted zone ${HOSTED_ZONE_ID}: ${summary}. ` +
      `Import the records into Terraform or rerun with ${ALLOW_EXISTING_RECORDS}=1 after intentionally approving replacement.`,
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
