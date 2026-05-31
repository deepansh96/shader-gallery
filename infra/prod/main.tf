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

resource "aws_cloudfront_origin_access_control" "app_origin" {
  name                              = "${var.project_name}-${var.environment}-app-origin"
  description                       = "OAC for Shader Gallery ${var.environment} App Origin"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_cache_policy" "origin_cache_control" {
  name        = "${var.project_name}-${var.environment}-origin-cache-control"
  comment     = "Honor App Origin Cache-Control headers with a zero minimum TTL"
  default_ttl = 3600
  max_ttl     = 31536000
  min_ttl     = 0

  parameters_in_cache_key_and_forwarded_to_origin {
    cookies_config {
      cookie_behavior = "none"
    }

    headers_config {
      header_behavior = "none"
    }

    query_strings_config {
      query_string_behavior = "none"
    }

    enable_accept_encoding_brotli = true
    enable_accept_encoding_gzip   = true
  }
}

resource "aws_cloudfront_distribution" "edge" {
  enabled             = true
  is_ipv6_enabled     = true
  price_class         = "PriceClass_100"
  default_root_object = "index.html"

  origin {
    domain_name              = aws_s3_bucket.app_origin.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.app_origin.id
    origin_id                = local.app_origin_id
  }

  default_cache_behavior {
    target_origin_id       = local.app_origin_id
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true
    cache_policy_id        = aws_cloudfront_cache_policy.origin_cache_control.id
  }

  custom_error_response {
    error_code            = 403
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 10
  }

  custom_error_response {
    error_code            = 404
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 10
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }

  tags = local.tags
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
