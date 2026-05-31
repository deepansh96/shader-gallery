variable "aws_region" {
  description = "AWS region for the production Deployment Stack."
  type        = string
  default     = "us-east-1"
}

variable "aws_profile" {
  description = "Local AWS profile used for production Terraform operations."
  type        = string
  default     = "indieverse-root"
}

variable "environment" {
  description = "Deployment environment name."
  type        = string
  default     = "prod"
}

variable "project_name" {
  description = "Project name used in resource names and tags."
  type        = string
  default     = "shader-gallery"
}

variable "tags" {
  description = "Additional tags for production resources."
  type        = map(string)
  default     = {}
}
