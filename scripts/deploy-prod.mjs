#!/usr/bin/env node
import { readdir, stat } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";

const REQUIRED_OUTPUTS = ["app_origin_bucket_name", "edge_distribution_id", "aws_region"];
const DEFAULT_AWS_PROFILE = "indieverse-root";
const EXPECTED_AWS_ACCOUNT_ID = "339097327659";

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

function run(command, args, { capture = false, env = process.env } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env,
      stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
    });

    let stdout = "";
    let stderr = "";
    if (capture) {
      child.stdout.on("data", (chunk) => {
        stdout += chunk;
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
      });
    }

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

async function assertCommand(command, args) {
  await run(command, args, { capture: true, env: awsEnv() });
}

async function assertAwsCredentials(env) {
  let result;
  try {
    result = await run("aws", ["sts", "get-caller-identity", "--query", "Account", "--output", "text"], {
      capture: true,
      env,
    });
  } catch (error) {
    throw new Error(`AWS credential preflight failed: ${error.message}`);
  }

  const accountId = result.stdout.trim();
  if (accountId !== EXPECTED_AWS_ACCOUNT_ID) {
    throw new Error(
      `AWS credential preflight failed: expected account ${EXPECTED_AWS_ACCOUNT_ID}, got ${accountId || "unknown"}`,
    );
  }
}

async function assertNonEmptyDist() {
  const distPath = path.resolve("dist");
  const distStats = await stat(distPath).catch(() => null);
  if (!distStats?.isDirectory()) {
    throw new Error("Build output directory dist/ is missing");
  }

  const entries = await readdir(distPath);
  if (entries.length === 0) {
    throw new Error("Build output directory dist/ is empty");
  }
}

function readRequiredOutput(outputs, name) {
  const value = outputs[name]?.value;
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Missing Terraform output: ${name}`);
  }
  return value;
}

async function readTerraformOutputs(env) {
  const result = await run("terraform", ["-chdir=infra/prod", "output", "-json"], {
    capture: true,
    env,
  });

  let outputs;
  try {
    outputs = JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(`Unable to parse Terraform outputs: ${error.message}`);
  }

  return Object.fromEntries(REQUIRED_OUTPUTS.map((name) => [name, readRequiredOutput(outputs, name)]));
}

async function main() {
  const env = awsEnv();

  await assertCommand("aws", ["--version"]);
  await assertCommand("terraform", ["version"]);
  await assertAwsCredentials(env);
  await run("npm", ["run", "build"], { env });
  await assertNonEmptyDist();

  const outputs = await readTerraformOutputs(env);
  const bucketUrl = `s3://${outputs.app_origin_bucket_name}/`;

  await run("aws", ["s3", "sync", "dist/", bucketUrl, "--region", outputs.aws_region], { env });
  await run(
    "aws",
    [
      "cloudfront",
      "create-invalidation",
      "--distribution-id",
      outputs.edge_distribution_id,
      "--paths",
      "/*",
      "--region",
      outputs.aws_region,
    ],
    { env },
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
