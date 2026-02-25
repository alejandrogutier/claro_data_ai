# Terraform Base (claro_data)

## Objetivo
Provisionar la base AWS de `claro_data` para V1 en una sola region (`us-east-1`), soportando la vision de monitoreo unificado de marca (social + listening externo + news).

## Incluye
- KMS key y cifrado por defecto
- S3 frontend/raw/exports
- CloudFront para SPA
- Cognito (User Pool + Client + grupos)
- Cognito Hosted UI domain
- API Gateway HTTP + Lambda base
- SQS + DLQ
- Step Functions + EventBridge (15 min)
- Scheduler social configurable (default diario 08:00 America/Bogota para ETL social)
- Aurora PostgreSQL Serverless v2
- Secrets Manager
- SES identidad remitente
- AWS Budget mensual

## Nota de alcance conectores sociales
- La integracion con Hootsuite y Awario se implementa a nivel aplicacion (Lambdas + secretos + jobs).
- Este modulo Terraform provee la infraestructura base para esa integracion, no recursos nativos de terceros.

## Uso
```bash
./scripts/aws/build_lambda_package.sh
./scripts/aws/load_secrets_from_env.sh
./scripts/aws/generate_terraform_tfvars.sh
terraform init
terraform plan -var-file=terraform.tfvars
terraform apply -var-file=terraform.tfvars
```

### Entornos (`prod` / `stg`)
`generate_terraform_tfvars.sh` soporta `ENVIRONMENT` y genera por defecto:
- `prod` -> `infra/terraform/terraform.tfvars`
- cualquier otro entorno -> `infra/terraform/terraform.<env>.tfvars`

Ejemplo para `stg`:
```bash
ENVIRONMENT=stg \
SOCIAL_RISK_STALE_AFTER_MINUTES=1560 \
SOCIAL_SCHEDULE_EXPRESSION='cron(0 13 * * ? *)' \
./scripts/aws/generate_terraform_tfvars.sh
```

## Notas
- Baseline de arranque. Ajustar networking (CIDR/SG), dominios y politicas IAM por entorno real.
- Desarrollo local frontend: callbacks/logout de `http://localhost:5173` habilitados por defecto en Cognito.
- Secretos runtime en Secrets Manager (nombres configurables):
  - `claro-data-prod/provider-api-keys`
  - `claro-data-prod/app-config`
  - `claro-data-prod/aws-credentials`
  - `claro-data-prod/database`
- Artefacto Lambda local: `build/lambda-api.zip`.
- Origen social configurable:
  - `social_raw_bucket_name` (default: `claro-dataslayer-dump`)
  - `social_raw_prefix` (default: `raw/organic/`)
- Frescura y scheduler social configurables:
  - `social_risk_stale_after_minutes` (default: `30`)
  - `social_schedule_expression` (default: `cron(0 13 * * ? *)`)

## Tags obligatorios
Aplicar en todos los recursos:
- `claro=true`
- `app=claro-data`
- `env=prod`
- `owner=<equipo_responsable>`
- `cost-center=<centro_costos>`
- `managed-by=terraform`
