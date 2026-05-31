# Shader Gallery

Modern Three.js shader gallery SPA for routed, high-end realtime shader demos.

## Scripts

- `npm run dev` starts the local Vite server.
- `npm run build` type-checks and builds the app.
- `npm run check:prod-domain-dns` checks that the Production Domain has no unmanaged Route 53 records before Terraform creates DNS aliases.
- `npm run deploy:prod` builds `dist/`, uploads the Deploy Artifact to the App Origin, and invalidates the Edge Distribution.

## Debug Mode

Open a gallery item with `?debug=true` to show Tweakpane controls and renderer stats.

## Production Deployment

Production is served from `https://shaders.deepansh.in` through a private S3 App Origin and CloudFront Edge Distribution managed by Terraform in `infra/prod/`.

Before applying the custom-domain slice, run:

```bash
npm run check:prod-domain-dns
terraform -chdir=infra/prod init
terraform -chdir=infra/prod plan
terraform -chdir=infra/prod apply
```

The DNS guard reads hosted zone `Z07945021SWCUENBCS47G` and exits non-zero if an exact `shaders.deepansh.in.` record already exists. If that happens, inspect the record before applying. Either import the existing A/AAAA records into the matching Terraform resources, remove or replace them intentionally, or rerun with `ALLOW_EXISTING_PRODUCTION_DOMAIN_RECORDS=1` only after approving replacement.

ACM DNS validation is managed in the existing `deepansh.in.` hosted zone. Certificate issuance commonly takes several minutes, and CloudFront distribution updates can take roughly 15-30 minutes to propagate after Terraform completes. During that window, the default CloudFront domain or the Production Domain may briefly serve the previous certificate/configuration.
