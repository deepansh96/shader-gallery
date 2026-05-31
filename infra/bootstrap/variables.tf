variable "aws_region" {
  description = "AWS region for Terraform State bootstrap resources."
  type        = string
  default     = "us-east-1"
}

variable "aws_profile" {
  description = "Local AWS profile used for bootstrap operations."
  type        = string
  default     = "indieverse-root"
}

variable "tags" {
  description = "Common tags for bootstrap resources."
  type        = map(string)
  default = {
    Project     = "shader-gallery"
    Environment = "prod"
    ManagedBy   = "terraform"
  }
}
