resource "aws_acm_certificate" "production" {
  domain_name       = var.production_domain
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = merge(local.tags, {
    Name = var.production_domain
  })
}

resource "aws_acm_certificate_validation" "production" {
  certificate_arn         = aws_acm_certificate.production.arn
  validation_record_fqdns = [for record in aws_route53_record.certificate_validation : record.fqdn]

  timeouts {
    create = "45m"
  }
}
