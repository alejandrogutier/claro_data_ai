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

variable "api_lambda_s3_bucket" {
  type        = string
  description = "Bucket con paquete zip de Lambda API"
}

variable "api_lambda_s3_key" {
  type        = string
  description = "Objeto zip de Lambda API"
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
}

variable "ses_sender_email" {
  type        = string
  description = "Sender verificado en SES"
}
