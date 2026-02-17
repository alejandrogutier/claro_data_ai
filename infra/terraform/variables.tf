variable "project_name" {
  type        = string
  description = "Nombre de la aplicacion"
  default     = "claro-data"
}

variable "environment" {
  type        = string
  description = "Ambiente"
  default     = "prod"
}

variable "aws_region" {
  type        = string
  description = "Region AWS"
  default     = "us-west-2"
}

variable "owner" {
  type        = string
  description = "Equipo responsable"
}

variable "cost_center" {
  type        = string
  description = "Centro de costos"
}

variable "vpc_id" {
  type        = string
  description = "VPC para recursos privados"
}

variable "private_subnet_ids" {
  type        = list(string)
  description = "Subnets privadas para Aurora"
}

variable "lambda_package_path" {
  type        = string
  description = "Ruta local al zip de Lambda API"
  default     = "../../build/lambda-api.zip"
}

variable "db_name" {
  type        = string
  description = "Nombre DB Aurora"
  default     = "clarodata"
}

variable "db_master_username" {
  type        = string
  description = "Usuario master Aurora"
  default     = "claroadmin"
}

variable "db_master_password" {
  type        = string
  description = "Password master Aurora"
  sensitive   = true
}

variable "monthly_budget_usd" {
  type        = string
  description = "Budget mensual USD"
  default     = "1000"
}

variable "budget_email" {
  type        = string
  description = "Email para alertas de budget"
  default     = "ops@example.com"
}

variable "ses_sender_email" {
  type        = string
  description = "Sender verificado en SES"
  default     = "digest@example.com"
}

variable "provider_keys_secret_name" {
  type        = string
  description = "Nombre del secreto con API keys de proveedores"
  default     = "claro-data-prod/provider-api-keys"
}

variable "app_config_secret_name" {
  type        = string
  description = "Nombre del secreto con configuracion de app"
  default     = "claro-data-prod/app-config"
}

variable "aws_credentials_secret_name" {
  type        = string
  description = "Nombre del secreto con credenciales AWS legado"
  default     = "claro-data-prod/aws-credentials"
}

variable "database_secret_name" {
  type        = string
  description = "Nombre del secreto con credenciales de base de datos para runtime"
  default     = "claro-data-prod/database"
}

variable "ingestion_default_terms" {
  type        = string
  description = "Terminos por defecto para corridas programadas, separados por coma"
  default     = ""
}
