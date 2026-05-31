import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import test from "node:test";
import assert from "node:assert/strict";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scriptPath = path.join(repoRoot, "scripts", "deploy-prod.mjs");

async function makeFixture({ terraformOutput } = {}) {
  const root = await mkdtemp(path.join(tmpdir(), "shader-gallery-deploy-"));
  const bin = path.join(root, "bin");
  await mkdir(bin, { recursive: true });
  await mkdir(path.join(root, "infra", "prod"), { recursive: true });
  await mkdir(path.join(root, "dist", "assets"), { recursive: true });
  await writeFile(path.join(root, "dist", "index.html"), "<html></html>");
  await writeFile(path.join(root, "dist", "assets", "app-abc123.js"), "console.log('ok');");
  await writeFile(path.join(root, "commands.log"), "");

  await writeFile(
    path.join(bin, "npm"),
    `#!/usr/bin/env bash
echo "npm $*" >> "$TEST_COMMAND_LOG"
exit 0
`,
    { mode: 0o755 },
  );

  await writeFile(
    path.join(bin, "terraform"),
    `#!/usr/bin/env bash
echo "terraform AWS_PROFILE=$AWS_PROFILE $*" >> "$TEST_COMMAND_LOG"
if [[ "$*" == "-chdir=infra/prod output -json" ]]; then
  cat <<'JSON'
${terraformOutput ?? "{}"}
JSON
fi
exit 0
`,
    { mode: 0o755 },
  );

  await writeFile(
    path.join(bin, "aws"),
    `#!/usr/bin/env bash
echo "aws AWS_PROFILE=$AWS_PROFILE $*" >> "$TEST_COMMAND_LOG"
if [[ "$*" == "sts get-caller-identity --query Account --output text" ]]; then
  if [[ "$AWS_PROFILE" == "missing-profile" ]]; then
    echo "profile not found" >&2
    exit 255
  fi
  echo "339097327659"
fi
exit 0
`,
    { mode: 0o755 },
  );

  return root;
}

async function runDeploy(root, env = {}) {
  const child = spawn(process.execPath, [scriptPath], {
    cwd: root,
    env: {
      ...process.env,
      ...env,
      PATH: `${path.join(root, "bin")}:${process.env.PATH}`,
      TEST_COMMAND_LOG: path.join(root, "commands.log"),
    },
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

  const code = await new Promise((resolve) => child.on("close", resolve));
  return { code, stdout, stderr, log: await readFile(path.join(root, "commands.log"), "utf8") };
}

test("deploy stops before publishing when Terraform outputs are incomplete", async () => {
  const root = await makeFixture({
    terraformOutput: JSON.stringify({
      app_origin_bucket_name: { value: "shader-gallery-prod-app" },
    }),
  });

  try {
    const result = await runDeploy(root);

    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /Missing Terraform output: edge_distribution_id/);
    assert.doesNotMatch(result.log, /aws s3 sync/);
    assert.doesNotMatch(result.log, /aws cloudfront create-invalidation/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("deploy builds, uploads retained assets, and invalidates CloudFront with the local default profile", async () => {
  const root = await makeFixture({
    terraformOutput: JSON.stringify({
      app_origin_bucket_name: { value: "shader-gallery-prod-app" },
      edge_distribution_id: { value: "E123456789" },
      aws_region: { value: "us-east-1" },
    }),
  });

  try {
    const result = await runDeploy(root, { AWS_PROFILE: "" });

    assert.equal(result.code, 0, result.stderr);
    assert.match(result.log, /npm run build/);
    assert.match(result.log, /terraform AWS_PROFILE=indieverse-root -chdir=infra\/prod output -json/);
    assert.match(result.log, /aws AWS_PROFILE=indieverse-root s3 sync dist\/ s3:\/\/shader-gallery-prod-app\/ --region us-east-1/);
    assert.match(result.log, /aws AWS_PROFILE=indieverse-root cloudfront create-invalidation --distribution-id E123456789 --paths \/\* --region us-east-1/);
    assert.doesNotMatch(result.log, /--delete/);
    assert.ok(result.log.indexOf("npm run build") < result.log.indexOf("terraform AWS_PROFILE=indieverse-root -chdir=infra/prod output -json"));
    assert.ok(result.log.indexOf("aws AWS_PROFILE=indieverse-root s3 sync") < result.log.indexOf("aws AWS_PROFILE=indieverse-root cloudfront create-invalidation"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("deploy preserves an explicit AWS profile override", async () => {
  const root = await makeFixture({
    terraformOutput: JSON.stringify({
      app_origin_bucket_name: { value: "shader-gallery-prod-app" },
      edge_distribution_id: { value: "E123456789" },
      aws_region: { value: "us-east-1" },
    }),
  });

  try {
    const result = await runDeploy(root, { AWS_PROFILE: "ci-release" });

    assert.equal(result.code, 0, result.stderr);
    assert.match(result.log, /terraform AWS_PROFILE=ci-release -chdir=infra\/prod output -json/);
    assert.match(result.log, /aws AWS_PROFILE=ci-release s3 sync/);
    assert.doesNotMatch(result.log, /AWS_PROFILE=indieverse-root/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("deploy fails AWS credential preflight before uploading", async () => {
  const root = await makeFixture({
    terraformOutput: JSON.stringify({
      app_origin_bucket_name: { value: "shader-gallery-prod-app" },
      edge_distribution_id: { value: "E123456789" },
      aws_region: { value: "us-east-1" },
    }),
  });

  try {
    const result = await runDeploy(root, { AWS_PROFILE: "missing-profile" });

    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /AWS credential preflight failed/);
    assert.doesNotMatch(result.log, /aws AWS_PROFILE=missing-profile s3 sync/);
    assert.doesNotMatch(result.log, /aws AWS_PROFILE=missing-profile cloudfront create-invalidation/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("deploy fails when the build output is missing before uploading", async () => {
  const root = await makeFixture({
    terraformOutput: JSON.stringify({
      app_origin_bucket_name: { value: "shader-gallery-prod-app" },
      edge_distribution_id: { value: "E123456789" },
      aws_region: { value: "us-east-1" },
    }),
  });
  await rm(path.join(root, "dist"), { recursive: true, force: true });

  try {
    const result = await runDeploy(root);

    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /Build output directory dist\/ is missing/);
    assert.doesNotMatch(result.log, /aws AWS_PROFILE=indieverse-root s3 sync/);
    assert.doesNotMatch(result.log, /aws AWS_PROFILE=indieverse-root cloudfront create-invalidation/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
