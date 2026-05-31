terraform {
  required_version = "~> 1.10"

  backend "s3" {
    bucket         = "shader-gallery-prod-tfstate-339097327659"
    key            = "shader-gallery/prod/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "shader-gallery-prod-tfstate-lock"
    encrypt        = true
  }

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}
