import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import test from "node:test";
import assert from "node:assert/strict";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scriptPath = path.join(repoRoot, "scripts", "check-prod-domain-dns.mjs");

async function makeFixture(recordSets, terraformState = []) {
  const root = await mkdtemp(path.join(tmpdir(), "shader-gallery-dns-guard-"));
  const bin = path.join(root, "bin");
  await mkdir(bin, { recursive: true });
  await writeFile(path.join(root, "commands.log"), "");

  await writeFile(
    path.join(bin, "aws"),
    `#!/usr/bin/env bash
echo "aws AWS_PROFILE=$AWS_PROFILE $*" >> "$TEST_COMMAND_LOG"
if [[ "$*" == "route53 list-resource-record-sets --hosted-zone-id Z07945021SWCUENBCS47G --output json" ]]; then
  cat <<'JSON'
${JSON.stringify({ ResourceRecordSets: recordSets })}
JSON
  exit 0
fi
echo "unexpected aws command" >&2
exit 1
`,
    { mode: 0o755 },
  );

  await writeFile(
    path.join(bin, "terraform"),
    `#!/usr/bin/env bash
echo "terraform $*" >> "$TEST_COMMAND_LOG"
if [[ "$*" == "-chdir=infra/prod state list" ]]; then
  cat <<'EOF'
${terraformState.join("\n")}
EOF
  exit 0
fi
echo "unexpected terraform command" >&2
exit 1
`,
    { mode: 0o755 },
  );

  return root;
}

async function runGuard(root, env = {}) {
  const child = spawn(process.execPath, [scriptPath], {
    cwd: root,
    env: {
      ...process.env,
      AWS_ACCESS_KEY_ID: "",
      AWS_CONTAINER_CREDENTIALS_RELATIVE_URI: "",
      AWS_DEFAULT_PROFILE: "",
      AWS_PROFILE: "",
      AWS_WEB_IDENTITY_TOKEN_FILE: "",
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

test("DNS guard passes when the Production Domain has no existing records", async () => {
  const root = await makeFixture([{ Name: "deepansh.in.", Type: "NS" }]);

  try {
    const result = await runGuard(root, { AWS_PROFILE: "" });

    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /No existing shaders\.deepansh\.in\. records found/);
    assert.match(
      result.log,
      /aws AWS_PROFILE=indieverse-root route53 list-resource-record-sets --hosted-zone-id Z07945021SWCUENBCS47G --output json/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("DNS guard fails when the Production Domain already has unmanaged records", async () => {
  const root = await makeFixture([{ Name: "shaders.deepansh.in.", Type: "A" }]);

  try {
    const result = await runGuard(root);

    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /Existing shaders\.deepansh\.in\. records found/);
    assert.match(result.stderr, /Import the records into Terraform/);
    assert.match(result.stderr, /ALLOW_EXISTING_PRODUCTION_DOMAIN_RECORDS=1/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("DNS guard passes when existing Production Domain records are already in Terraform state", async () => {
  const root = await makeFixture(
    [
      { Name: "shaders.deepansh.in.", Type: "A" },
      { Name: "shaders.deepansh.in.", Type: "AAAA" },
    ],
    ["aws_route53_record.production_ipv4", "aws_route53_record.production_ipv6"],
  );

  try {
    const result = await runGuard(root);

    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /already managed by Terraform state/);
    assert.match(result.stdout, /shaders\.deepansh\.in\. A/);
    assert.match(result.stdout, /shaders\.deepansh\.in\. AAAA/);
    assert.match(result.log, /terraform -chdir=infra\/prod state list/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("DNS guard fails when existing Production Domain records cannot be checked against Terraform state", async () => {
  const root = await makeFixture([{ Name: "shaders.deepansh.in.", Type: "A" }]);
  await writeFile(
    path.join(root, "bin", "terraform"),
    `#!/usr/bin/env bash
echo "terraform $*" >> "$TEST_COMMAND_LOG"
echo "backend initialization required" >&2
exit 1
`,
    { mode: 0o755 },
  );

  try {
    const result = await runGuard(root);

    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /Terraform state could not be inspected/);
    assert.match(result.stderr, /terraform -chdir=infra\/prod init/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("DNS guard allows existing records only after explicit approval", async () => {
  const root = await makeFixture([{ Name: "shaders.deepansh.in.", Type: "AAAA" }]);

  try {
    const result = await runGuard(root, { ALLOW_EXISTING_PRODUCTION_DOMAIN_RECORDS: "1" });

    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /approved by ALLOW_EXISTING_PRODUCTION_DOMAIN_RECORDS=1/);
    assert.match(result.stdout, /shaders\.deepansh\.in\. AAAA/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
