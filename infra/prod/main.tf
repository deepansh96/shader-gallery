provider "aws" {
  region              = var.aws_region
  profile             = var.aws_profile
  allowed_account_ids = ["339097327659"]
}

data "aws_caller_identity" "current" {}

locals {
  default_tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
  }

  tags                   = merge(local.default_tags, var.tags)
  app_origin_bucket_name = "${var.project_name}-${var.environment}-app-origin-339097327659"
  app_origin_id          = "${var.project_name}-${var.environment}-app-origin"
}

resource "aws_s3_bucket" "app_origin" {
  bucket        = local.app_origin_bucket_name
  force_destroy = false

  tags = merge(local.tags, {
    Name = local.app_origin_bucket_name
  })
}

resource "aws_s3_bucket_public_access_block" "app_origin" {
  bucket = aws_s3_bucket.app_origin.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "app_origin" {
  bucket = aws_s3_bucket.app_origin.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "app_origin" {
  bucket = aws_s3_bucket.app_origin.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_versioning" "app_origin" {
  bucket = aws_s3_bucket.app_origin.id

  versioning_configuration {
    status = "Enabled"
  }
}

data "aws_iam_policy_document" "app_origin_cloudfront" {
  statement {
    sid     = "AllowCloudFrontServicePrincipalReadOnly"
    effect  = "Allow"
    actions = ["s3:GetObject"]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    resources = ["${aws_s3_bucket.app_origin.arn}/*"]

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = ["arn:aws:cloudfront::${data.aws_caller_identity.current.account_id}:distribution/${aws_cloudfront_distribution.edge.id}"]
    }
  }
}

resource "aws_s3_bucket_policy" "app_origin_cloudfront" {
  bucket = aws_s3_bucket.app_origin.id
  policy = data.aws_iam_policy_document.app_origin_cloudfront.json
}
