locals {
  name_prefix           = "${var.project_name}-${var.environment}"
  cognito_domain_prefix = coalesce(var.cognito_domain_prefix, "${local.name_prefix}-${data.aws_caller_identity.current.account_id}")
}
