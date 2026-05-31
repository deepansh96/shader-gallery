output "app_origin_bucket_name" {
  description = "Private S3 App Origin bucket name for Deploy Artifact uploads."
  value       = aws_s3_bucket.app_origin.bucket
}

output "app_origin_bucket_arn" {
  description = "Private S3 App Origin bucket ARN."
  value       = aws_s3_bucket.app_origin.arn
}

output "edge_distribution_id" {
  description = "CloudFront Edge Distribution ID."
  value       = aws_cloudfront_distribution.edge.id
}

output "edge_distribution_domain_name" {
  description = "CloudFront default domain name."
  value       = aws_cloudfront_distribution.edge.domain_name
}

output "aws_region" {
  description = "AWS region used by the Deployment Stack and deploy command."
  value       = var.aws_region
}

output "certificate_arn" {
  description = "ACM certificate ARN for the Production Domain."
  value       = aws_acm_certificate.production.arn
}

output "hosted_zone_id" {
  description = "Existing public deepansh.in Route 53 hosted zone ID."
  value       = data.aws_route53_zone.production.zone_id
}

output "production_domain" {
  description = "Production Domain served by Shader Gallery."
  value       = var.production_domain
}

output "production_url" {
  description = "HTTPS URL for the production Shader Gallery app."
  value       = "https://${var.production_domain}"
}

output "github_actions_deploy_role_arn" {
  description = "IAM role ARN assumed by the GitHub Actions production deploy workflow."
  value       = aws_iam_role.github_actions_deploy.arn
}
