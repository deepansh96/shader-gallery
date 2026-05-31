import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import test from "node:test";
import assert from "node:assert/strict";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scriptPath = path.join(repoRoot, "scripts", "deploy-prod.mjs");

async function makeFixture({ terraformOutput, distributionStatus = "Deployed" } = {}) {
  const root = await mkdtemp(path.join(tmpdir(), "shader-gallery-deploy-"));
  const bin = path.join(root, "bin");
  await mkdir(bin, { recursive: true });
  await mkdir(path.join(root, "infra", "prod"), { recursive: true });
  await mkdir(path.join(root, "dist", "assets"), { recursive: true });
  await writeFile(path.join(root, "dist", "index.html"), "<html></html>");
  await writeFile(path.join(root, "dist", "assets", "app-abc123.js"), "console.log('ok');");
  await writeFile(path.join(root, "dist", "assets", "style-def456.css"), "body {}");
  await writeFile(path.join(root, "dist", "favicon.svg"), "<svg></svg>");
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
if [[ "$*" == cloudfront\\ create-invalidation* ]]; then
  cat <<'JSON'
{"Invalidation":{"Id":"I123456789","Status":"InProgress"}}
JSON
fi
if [[ "$*" == cloudfront\\ get-distribution* ]]; then
  cat <<'JSON'
{"Distribution":{"Status":"${distributionStatus}"}}
JSON
fi
exit 0
`,
    { mode: 0o755 },
  );

  return root;
}

async function runDeploy(root, env = {}, args = []) {
  const child = spawn(process.execPath, [scriptPath, ...args], {
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

test("deploy preflight validates target without building, uploading, or invalidating", async () => {
  const root = await makeFixture({
    terraformOutput: JSON.stringify({
      app_origin_bucket_name: { value: "shader-gallery-prod-app" },
      edge_distribution_id: { value: "E123456789" },
      aws_region: { value: "us-east-1" },
    }),
  });

  try {
    const result = await runDeploy(root, {}, ["--preflight"]);

    assert.equal(result.code, 0, result.stderr);
    assert.doesNotMatch(result.log, /npm run build/);
    assert.match(result.log, /aws AWS_PROFILE=indieverse-root s3api head-bucket --bucket shader-gallery-prod-app --region us-east-1/);
    assert.match(
      result.log,
      /aws AWS_PROFILE=indieverse-root cloudfront get-distribution --id E123456789 --region us-east-1 --output json/,
    );
    assert.doesNotMatch(result.log, /aws AWS_PROFILE=indieverse-root s3 cp/);
    assert.doesNotMatch(result.log, /aws AWS_PROFILE=indieverse-root s3 sync/);
    assert.doesNotMatch(result.log, /aws AWS_PROFILE=indieverse-root cloudfront create-invalidation/);
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
    assert.match(result.log, /aws AWS_PROFILE=indieverse-root s3 cp .*\/dist\/assets\/app-abc123\.js s3:\/\/shader-gallery-prod-app\/assets\/app-abc123\.js/);
    assert.match(result.log, /aws AWS_PROFILE=indieverse-root cloudfront create-invalidation --distribution-id E123456789 --paths \/\* --region us-east-1 --output json/);
    assert.doesNotMatch(result.log, /--delete/);
    assert.ok(result.log.indexOf("npm run build") < result.log.indexOf("terraform AWS_PROFILE=indieverse-root -chdir=infra/prod output -json"));
    assert.ok(result.log.indexOf("aws AWS_PROFILE=indieverse-root s3 cp") < result.log.indexOf("aws AWS_PROFILE=indieverse-root cloudfront create-invalidation"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("deploy uploads hashed assets before index with cache and content metadata", async () => {
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
    assert.match(
      result.log,
      /aws AWS_PROFILE=indieverse-root s3 cp .*\/dist\/assets\/app-abc123\.js s3:\/\/shader-gallery-prod-app\/assets\/app-abc123\.js --cache-control public, max-age=31536000, immutable --content-type text\/javascript; charset=utf-8 --region us-east-1/,
    );
    assert.match(
      result.log,
      /aws AWS_PROFILE=indieverse-root s3 cp .*\/dist\/assets\/style-def456\.css s3:\/\/shader-gallery-prod-app\/assets\/style-def456\.css --cache-control public, max-age=31536000, immutable --content-type text\/css; charset=utf-8 --region us-east-1/,
    );
    assert.match(
      result.log,
      /aws AWS_PROFILE=indieverse-root s3 cp .*\/dist\/favicon\.svg s3:\/\/shader-gallery-prod-app\/favicon\.svg --cache-control no-cache --content-type image\/svg\+xml --region us-east-1/,
    );
    assert.match(
      result.log,
      /aws AWS_PROFILE=indieverse-root s3 cp .*\/dist\/index\.html s3:\/\/shader-gallery-prod-app\/index\.html --cache-control no-cache --content-type text\/html; charset=utf-8 --region us-east-1/,
    );
    assert.ok(result.log.indexOf("assets/app-abc123.js") < result.log.indexOf("index.html"));
    assert.ok(result.log.indexOf("assets/style-def456.css") < result.log.indexOf("index.html"));
    assert.doesNotMatch(result.log, /--delete/);
    assert.match(result.stdout, /Created CloudFront invalidation I123456789/);
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
    assert.match(result.log, /aws AWS_PROFILE=ci-release s3 cp/);
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

test("deploy fails before uploading when a dist file has an unknown content type", async () => {
  const root = await makeFixture({
    terraformOutput: JSON.stringify({
      app_origin_bucket_name: { value: "shader-gallery-prod-app" },
      edge_distribution_id: { value: "E123456789" },
      aws_region: { value: "us-east-1" },
    }),
  });
  await writeFile(path.join(root, "dist", "assets", "shader-abc123.binpack"), "unknown");

  try {
    const result = await runDeploy(root);

    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /Unknown content type for dist\/assets\/shader-abc123\.binpack/);
    assert.doesNotMatch(result.log, /aws AWS_PROFILE=indieverse-root s3 cp/);
    assert.doesNotMatch(result.log, /aws AWS_PROFILE=indieverse-root cloudfront create-invalidation/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("deploy preflight fails when dist index uses a non-root Vite base path", async () => {
  const root = await makeFixture({
    terraformOutput: JSON.stringify({
      app_origin_bucket_name: { value: "shader-gallery-prod-app" },
      edge_distribution_id: { value: "E123456789" },
      aws_region: { value: "us-east-1" },
    }),
  });
  await writeFile(path.join(root, "dist", "index.html"), '<script type="module" src="assets/app-abc123.js"></script>');

  try {
    const result = await runDeploy(root, {}, ["--preflight"]);

    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /Vite base path must be \//);
    assert.doesNotMatch(result.log, /aws AWS_PROFILE=indieverse-root s3api head-bucket/);
    assert.doesNotMatch(result.log, /aws AWS_PROFILE=indieverse-root s3 cp/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("deploy preflight warns when the CloudFront distribution is still deploying", async () => {
  const root = await makeFixture({
    distributionStatus: "Deploying",
    terraformOutput: JSON.stringify({
      app_origin_bucket_name: { value: "shader-gallery-prod-app" },
      edge_distribution_id: { value: "E123456789" },
      aws_region: { value: "us-east-1" },
    }),
  });

  try {
    const result = await runDeploy(root, {}, ["--preflight"]);

    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stderr, /Warning: CloudFront distribution E123456789 is still Deploying/);
    assert.doesNotMatch(result.log, /aws AWS_PROFILE=indieverse-root s3 cp/);
    assert.doesNotMatch(result.log, /aws AWS_PROFILE=indieverse-root cloudfront create-invalidation/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("deploy can run repeatedly against the same App Origin without deleting retained assets", async () => {
  const root = await makeFixture({
    terraformOutput: JSON.stringify({
      app_origin_bucket_name: { value: "shader-gallery-prod-app" },
      edge_distribution_id: { value: "E123456789" },
      aws_region: { value: "us-east-1" },
    }),
  });

  try {
    const first = await runDeploy(root);
    const second = await runDeploy(root);

    assert.equal(first.code, 0, first.stderr);
    assert.equal(second.code, 0, second.stderr);
    assert.match(first.stdout, /Created CloudFront invalidation I123456789/);
    assert.match(second.stdout, /Created CloudFront invalidation I123456789/);
    assert.doesNotMatch(first.log, /--delete/);
    assert.doesNotMatch(second.log, /--delete/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
