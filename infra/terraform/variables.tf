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
  default     = "us-east-1"
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

variable "alert_email_recipients" {
  type        = string
  description = "Lista CSV de correos para notificaciones de incidentes (SES)."
  default     = ""
}

variable "alert_cooldown_minutes" {
  type        = number
  description = "Cooldown para deduplicacion de incidentes en minutos."
  default     = 60
}

variable "alert_signal_version" {
  type        = string
  description = "Version de la formula de senal de alertas."
  default     = "alert-v1-weighted"
}

variable "report_confidence_threshold" {
  type        = number
  description = "Umbral minimo de confianza para publicar reportes sin revision manual."
  default     = 0.65
}

variable "report_default_timezone" {
  type        = string
  description = "Zona horaria por defecto para programacion de reportes."
  default     = "America/Bogota"
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

variable "cognito_domain_prefix" {
  type        = string
  description = "Prefijo de dominio Cognito Hosted UI (debe ser unico globalmente). Si es null, se construye automaticamente."
  default     = null
}

variable "cognito_additional_callback_urls" {
  type        = list(string)
  description = "URLs adicionales de callback para Cognito (incluye localhost para desarrollo)."
  default     = ["http://localhost:5173/auth/callback"]
}

variable "cognito_additional_logout_urls" {
  type        = list(string)
  description = "URLs adicionales de logout para Cognito (incluye localhost para desarrollo)."
  default     = ["http://localhost:5173"]
}

variable "api_additional_allowed_origins" {
  type        = list(string)
  description = "Origens adicionales permitidos por CORS en API Gateway."
  default     = ["http://localhost:5173"]
}
