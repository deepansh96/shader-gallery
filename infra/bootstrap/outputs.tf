output "terraform_state_bucket_name" {
  description = "S3 bucket that stores production Terraform State."
  value       = aws_s3_bucket.terraform_state.bucket
}

output "terraform_lock_table_name" {
  description = "DynamoDB table used for production Terraform State locking."
  value       = aws_dynamodb_table.terraform_locks.name
}
