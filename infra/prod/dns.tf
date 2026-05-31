data "aws_route53_zone" "production" {
  zone_id      = var.hosted_zone_id
  private_zone = false
}

resource "aws_route53_record" "certificate_validation" {
  for_each = {
    for option in aws_acm_certificate.production.domain_validation_options : option.domain_name => {
      name   = option.resource_record_name
      record = option.resource_record_value
      type   = option.resource_record_type
    }
  }

  zone_id = data.aws_route53_zone.production.zone_id
  name    = each.value.name
  type    = each.value.type
  ttl     = 60
  records = [each.value.record]

  allow_overwrite = true
}

resource "aws_route53_record" "production_ipv4" {
  zone_id = data.aws_route53_zone.production.zone_id
  name    = var.production_domain
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.edge.domain_name
    zone_id                = aws_cloudfront_distribution.edge.hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "production_ipv6" {
  zone_id = data.aws_route53_zone.production.zone_id
  name    = var.production_domain
  type    = "AAAA"

  alias {
    name                   = aws_cloudfront_distribution.edge.domain_name
    zone_id                = aws_cloudfront_distribution.edge.hosted_zone_id
    evaluate_target_health = false
  }
}
