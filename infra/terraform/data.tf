data "aws_vpc" "selected" {
  id = var.vpc_id
}

data "aws_secretsmanager_secret" "provider_keys" {
  name = var.provider_keys_secret_name
}

data "aws_secretsmanager_secret" "app_config" {
  name = var.app_config_secret_name
}

data "aws_secretsmanager_secret" "aws_credentials" {
  name = var.aws_credentials_secret_name
}
