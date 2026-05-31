# Shader Gallery

Modern Three.js shader gallery SPA for routed, high-end realtime shader demos.

## Scripts

- `npm run dev` starts the local Vite server.
- `npm run build` type-checks and builds the app.
- `npm run check:prod-domain-dns` checks that the Production Domain has no unmanaged Route 53 records before Terraform creates DNS aliases.
- `npm run test:deploy` runs deployment script and DNS guard tests without publishing.
- `npm run deploy:prod` builds `dist/`, uploads the Deploy Artifact to the App Origin, and invalidates the Edge Distribution.

## Debug Mode

Open a gallery item with `?debug=true` to show Tweakpane controls and renderer stats.

## Production Deployment

Production is served from `https://shaders.deepansh.in` through a private S3 App Origin and CloudFront Edge Distribution managed by Terraform. Use AWS profile `indieverse-root` in account `339097327659`. The existing public Route 53 hosted zone is `deepansh.in.` with ID `Z07945021SWCUENBCS47G`.

Terraform uses two roots:

- `infra/bootstrap/` creates the remote Terraform State bucket `shader-gallery-prod-tfstate-339097327659` and DynamoDB lock table `shader-gallery-prod-tfstate-lock`.
- `infra/prod/` creates the production Deployment Stack and stores state at `shader-gallery/prod/terraform.tfstate`.

### Bootstrap Terraform State

Run once from the project root on a machine with the `indieverse-root` AWS profile:

```bash
terraform -chdir=infra/bootstrap init
terraform -chdir=infra/bootstrap fmt -check
terraform -chdir=infra/bootstrap validate
terraform -chdir=infra/bootstrap plan
terraform -chdir=infra/bootstrap apply
```

### Plan And Apply Production

Before applying, check that Terraform will not replace unmanaged Production Domain records:

```bash
npm run check:prod-domain-dns
terraform -chdir=infra/prod init
terraform -chdir=infra/prod fmt -check
terraform -chdir=infra/prod validate
terraform -chdir=infra/prod plan
terraform -chdir=infra/prod apply
```

The DNS guard reads hosted zone `Z07945021SWCUENBCS47G` and exits non-zero if an exact `shaders.deepansh.in.` record already exists. If that happens, inspect the record before applying. Either import the existing A/AAAA records into the matching Terraform resources, remove or replace them intentionally, or rerun with `ALLOW_EXISTING_PRODUCTION_DOMAIN_RECORDS=1` only after approving replacement.

ACM DNS validation is managed in the existing `deepansh.in.` hosted zone. Certificate issuance commonly takes several minutes, and CloudFront distribution updates can take roughly 15-30 minutes to propagate after Terraform completes. During that window, the default CloudFront domain or the Production Domain may briefly serve the previous certificate/configuration.

### Deploy The App

Run a non-publishing deploy preflight first:

```bash
npm run build
npm run deploy:prod -- --preflight
```

The preflight validates `dist/`, Terraform outputs, AWS identity, App Origin bucket access, root Vite base path `/`, and CloudFront distribution status without uploading files or creating invalidations. `--dry-run` is accepted as an alias.

Publish the current build:

```bash
npm run deploy:prod
```

The deploy command rebuilds the app, reads `app_origin_bucket_name`, `edge_distribution_id`, and `aws_region` from `infra/prod` Terraform outputs, uploads hashed `dist/assets/` files before `index.html`, and creates a `/*` CloudFront invalidation. Old hashed assets are retained during deploys so already-loaded clients can still request previous content-addressed files. `index.html` uses `Cache-Control: no-cache`; hashed Vite assets use `Cache-Control: public, max-age=31536000, immutable`; other classified static files default to `no-cache`.

The v1 deploy path has no deploy mutex. Avoid running simultaneous manual deploys. Roll back by checking out or rebuilding a known-good version, then rerunning `npm run deploy:prod`.

### Verify Production

After Terraform and deploy propagation complete, verify:

```bash
APP_BUCKET=$(terraform -chdir=infra/prod output -raw app_origin_bucket_name)
HASHED_ASSET=$(find dist/assets -type f | head -n 1 | sed 's#dist/##')

curl -I https://shaders.deepansh.in
curl -I http://shaders.deepansh.in
curl -I https://shaders.deepansh.in/index.html
curl -I "https://shaders.deepansh.in/${HASHED_ASSET}"
curl -I https://shaders.deepansh.in/missing-asset.js
curl -I "https://shaders.deepansh.in/gallery/template-lab"
curl -I "https://shaders.deepansh.in/gallery/not-a-real-item"
curl -I "https://${APP_BUCKET}.s3.us-east-1.amazonaws.com/index.html"
```

Expected behavior:

- `https://shaders.deepansh.in` serves the Shader Gallery app over HTTPS.
- `http://shaders.deepansh.in` redirects to HTTPS.
- `/gallery/template-lab` refreshes through CloudFront and renders Template Lab.
- `/gallery/not-a-real-item` loads the SPA and the client redirects home.
- A missing asset may return the SPA HTML fallback in v1.
- Direct S3 object access to the App Origin returns AccessDenied or equivalent.
- `/index.html` returns `Cache-Control: no-cache`.
- Hashed assets under `/assets/` return `Cache-Control: public, max-age=31536000, immutable`.
- `?debug=true` shows Tweakpane controls on Gallery Item routes; without that query, Debug Tooling remains hidden.
