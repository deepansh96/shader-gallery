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
  description = "CloudFront default domain name for this slice."
  value       = aws_cloudfront_distribution.edge.domain_name
}

output "aws_region" {
  description = "AWS region used by the Deployment Stack and deploy command."
  value       = var.aws_region
}
