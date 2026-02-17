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
./scripts/aws/build_lambda_package.sh
./scripts/aws/load_secrets_from_env.sh
./scripts/aws/generate_terraform_tfvars.sh
terraform init
terraform plan -var-file=terraform.tfvars
terraform apply -var-file=terraform.tfvars
```

## Notas
- Este modulo es un baseline de arranque. Ajustar networking (CIDR/SG), dominios y politicas IAM por entorno real.
- Los secretos se leen desde Secrets Manager via nombres configurables:
  - `claro-data-prod/provider-api-keys`
  - `claro-data-prod/app-config`
  - `claro-data-prod/aws-credentials`
- El artefacto Lambda se empaqueta localmente en `build/lambda-api.zip`.
