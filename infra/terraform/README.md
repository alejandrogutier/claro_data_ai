# Terraform Base (claro_data)

## Objetivo
Provisionar base de arquitectura AWS para V1 en una sola region (`us-west-2`).

## Incluye
- KMS key y cifrado por defecto
- S3 frontend/raw/exports
- CloudFront para SPA
- Cognito (User Pool + Client + grupos)
- API Gateway HTTP + Lambda base
- SQS + DLQ
- Step Functions + EventBridge (15 min)
- Aurora PostgreSQL Serverless v2
- Secrets Manager
- SES identidad remitente
- AWS Budget mensual

## Uso
```bash
terraform init
terraform plan -var-file=terraform.tfvars
terraform apply -var-file=terraform.tfvars
```

## Notas
- Este modulo es un baseline de arranque. Ajustar networking (CIDR/SG), dominios y politicas IAM por entorno real.
- El paquete Lambda se asume publicado en S3 (`api_lambda_s3_bucket`/`api_lambda_s3_key`).
