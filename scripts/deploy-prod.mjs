#!/usr/bin/env node
import { readdir, readFile, stat } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";

const REQUIRED_OUTPUTS = ["app_origin_bucket_name", "edge_distribution_id", "aws_region"];
const DEFAULT_AWS_PROFILE = "indieverse-root";
const EXPECTED_AWS_ACCOUNT_ID = "339097327659";
const IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable";
const NO_CACHE_CONTROL = "no-cache";
const CONTENT_TYPES = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".wasm", "application/wasm"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".gif", "image/gif"],
  [".webp", "image/webp"],
  [".svg", "image/svg+xml"],
  [".ico", "image/x-icon"],
  [".avif", "image/avif"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
  [".ttf", "font/ttf"],
  [".otf", "font/otf"],
]);

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

async function assertViteBasePath() {
  const indexPath = path.resolve("dist", "index.html");
  const indexHtml = await readFile(indexPath, "utf8").catch(() => null);
  if (indexHtml === null) {
    throw new Error("Build output dist/index.html is missing");
  }

  const relativeAssetReference = /\b(?:src|href)=["'](?:\.\/)?assets\//;
  if (relativeAssetReference.test(indexHtml)) {
    throw new Error("Vite base path must be / so built asset URLs are rooted at /assets/");
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

async function listDistFiles(directory = path.resolve("dist")) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return listDistFiles(absolutePath);
      }
      if (!entry.isFile()) {
        return [];
      }

      const relativePath = path.relative(path.resolve("dist"), absolutePath).split(path.sep).join("/");
      return [{ absolutePath, relativePath }];
    }),
  );

  return files.flat().sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

function contentTypeForFile(relativePath) {
  const contentType = CONTENT_TYPES.get(path.extname(relativePath).toLowerCase());
  if (!contentType) {
    throw new Error(`Unknown content type for dist/${relativePath}`);
  }
  return contentType;
}

function isHashedViteAsset(relativePath) {
  return /^assets\/.+-[A-Za-z0-9_-]{6,}\.[^.]+$/.test(relativePath);
}

async function createDeployPlan() {
  const files = await listDistFiles();
  const plan = files.map((file) => ({
    ...file,
    cacheControl: isHashedViteAsset(file.relativePath) ? IMMUTABLE_CACHE_CONTROL : NO_CACHE_CONTROL,
    contentType: contentTypeForFile(file.relativePath),
  }));

  const indexEntry = plan.find((file) => file.relativePath === "index.html");
  if (!indexEntry) {
    throw new Error("Build output dist/index.html is missing");
  }

  const hashedAssets = plan.filter((file) => isHashedViteAsset(file.relativePath));
  const otherFiles = plan.filter((file) => !isHashedViteAsset(file.relativePath) && file.relativePath !== "index.html");
  return [...hashedAssets, ...otherFiles, indexEntry];
}

async function assertBucketAccess(outputs, env) {
  await run(
    "aws",
    ["s3api", "head-bucket", "--bucket", outputs.app_origin_bucket_name, "--region", outputs.aws_region],
    { capture: true, env },
  );
}

async function assertCloudFrontDistribution(outputs, env) {
  const result = await run(
    "aws",
    [
      "cloudfront",
      "get-distribution",
      "--id",
      outputs.edge_distribution_id,
      "--region",
      outputs.aws_region,
      "--output",
      "json",
    ],
    { capture: true, env },
  );
  if (!result.stdout.trim()) {
    return;
  }

  let distribution;
  try {
    distribution = JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(`Unable to parse CloudFront distribution status: ${error.message}`);
  }

  const status = distribution.Distribution?.Status;
  if (status === "Deploying") {
    console.warn(`Warning: CloudFront distribution ${outputs.edge_distribution_id} is still Deploying.`);
  }
}

async function runPreflight(env) {
  await assertCommand("aws", ["--version"]);
  await assertCommand("terraform", ["version"]);
  await assertAwsCredentials(env);
  await assertNonEmptyDist();
  await assertViteBasePath();
  await createDeployPlan();

  const outputs = await readTerraformOutputs(env);
  await assertBucketAccess(outputs, env);
  await assertCloudFrontDistribution(outputs, env);
}

async function uploadDeployPlan(plan, outputs, env) {
  for (const file of plan) {
    await run(
      "aws",
      [
        "s3",
        "cp",
        file.absolutePath,
        `s3://${outputs.app_origin_bucket_name}/${file.relativePath}`,
        "--cache-control",
        file.cacheControl,
        "--content-type",
        file.contentType,
        "--region",
        outputs.aws_region,
      ],
      { env },
    );
  }
}

async function createInvalidation(outputs, env) {
  const result = await run(
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
      "--output",
      "json",
    ],
    { capture: true, env },
  );

  let invalidation;
  try {
    invalidation = JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(`Unable to parse CloudFront invalidation response: ${error.message}`);
  }

  const invalidationId = invalidation.Invalidation?.Id;
  if (!invalidationId) {
    throw new Error("CloudFront invalidation response did not include an invalidation ID");
  }

  console.log(`Created CloudFront invalidation ${invalidationId}. Edge propagation continues after this command exits.`);
}

async function main(argv = process.argv.slice(2)) {
  const env = awsEnv();
  const isPreflight = argv.includes("--preflight") || argv.includes("--dry-run");

  if (isPreflight) {
    await runPreflight(env);
    console.log("Deploy preflight passed; no files were uploaded and no invalidation was created.");
    return;
  }

  await assertCommand("aws", ["--version"]);
  await assertCommand("terraform", ["version"]);
  await assertAwsCredentials(env);
  await run("npm", ["run", "build"], { env });
  await assertNonEmptyDist();
  await assertViteBasePath();

  const outputs = await readTerraformOutputs(env);
  await assertBucketAccess(outputs, env);
  await assertCloudFrontDistribution(outputs, env);

  const deployPlan = await createDeployPlan();
  await uploadDeployPlan(deployPlan, outputs, env);
  await createInvalidation(outputs, env);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
