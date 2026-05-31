data "aws_iam_openid_connect_provider" "github_actions" {
  url = "https://token.actions.githubusercontent.com"
}

data "aws_iam_policy_document" "github_actions_deploy_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [data.aws_iam_openid_connect_provider.github_actions.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:deepansh96/shader-gallery:ref:refs/heads/main"]
    }
  }
}

resource "aws_iam_role" "github_actions_deploy" {
  name               = "${var.project_name}-${var.environment}-github-deploy"
  assume_role_policy = data.aws_iam_policy_document.github_actions_deploy_assume_role.json

  tags = merge(local.tags, {
    Name = "${var.project_name}-${var.environment}-github-deploy"
  })
}

data "aws_iam_policy_document" "github_actions_deploy" {
  statement {
    sid    = "ReadTerraformState"
    effect = "Allow"
    actions = [
      "s3:GetBucketLocation",
      "s3:ListBucket"
    ]
    resources = ["arn:aws:s3:::shader-gallery-prod-tfstate-339097327659"]
  }

  statement {
    sid       = "ReadTerraformStateObjects"
    effect    = "Allow"
    actions   = ["s3:GetObject"]
    resources = ["arn:aws:s3:::shader-gallery-prod-tfstate-339097327659/shader-gallery/prod/terraform.tfstate"]
  }

  statement {
    sid    = "ReadTerraformLockTable"
    effect = "Allow"
    actions = [
      "dynamodb:DescribeTable",
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:DeleteItem",
      "dynamodb:UpdateItem"
    ]
    resources = ["arn:aws:dynamodb:${var.aws_region}:${data.aws_caller_identity.current.account_id}:table/shader-gallery-prod-tfstate-lock"]
  }

  statement {
    sid    = "PublishDeployArtifact"
    effect = "Allow"
    actions = [
      "s3:GetBucketLocation",
      "s3:ListBucket"
    ]
    resources = [aws_s3_bucket.app_origin.arn]
  }

  statement {
    sid    = "WriteDeployArtifactObjects"
    effect = "Allow"
    actions = [
      "s3:PutObject"
    ]
    resources = ["${aws_s3_bucket.app_origin.arn}/*"]
  }

  statement {
    sid    = "InvalidateEdgeDistribution"
    effect = "Allow"
    actions = [
      "cloudfront:CreateInvalidation",
      "cloudfront:GetDistribution"
    ]
    resources = [aws_cloudfront_distribution.edge.arn]
  }
}

resource "aws_iam_role_policy" "github_actions_deploy" {
  name   = "${var.project_name}-${var.environment}-github-deploy"
  role   = aws_iam_role.github_actions_deploy.id
  policy = data.aws_iam_policy_document.github_actions_deploy.json
}
