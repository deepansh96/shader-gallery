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

variable "hosted_zone_id" {
  description = "Existing public deepansh.in Route 53 hosted zone ID."
  type        = string
  default     = "Z07945021SWCUENBCS47G"
}

variable "production_domain" {
  description = "Production Domain served by the Edge Distribution."
  type        = string
  default     = "shaders.deepansh.in"
}

variable "tags" {
  description = "Additional tags for production resources."
  type        = map(string)
  default     = {}
}
