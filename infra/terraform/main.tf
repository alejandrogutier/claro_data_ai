resource "aws_kms_key" "app" {
  description             = "KMS key for claro_data encrypted resources"
  deletion_window_in_days = 30
  enable_key_rotation     = true
}

resource "aws_kms_key_policy" "app" {
  key_id = aws_kms_key.app.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "EnableRootPermissions"
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"
        }
        Action   = "kms:*"
        Resource = "*"
      },
      {
        Sid    = "AllowCloudFrontDecryptFrontendObjects"
        Effect = "Allow"
        Principal = {
          Service = "cloudfront.amazonaws.com"
        }
        Action = [
          "kms:Decrypt",
          "kms:DescribeKey",
          "kms:GenerateDataKey"
        ]
        Resource = "*"
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = aws_cloudfront_distribution.frontend.arn
          }
        }
      }
    ]
  })
}

resource "aws_kms_alias" "app" {
  name          = "alias/${local.name_prefix}"
  target_key_id = aws_kms_key.app.key_id
}

resource "aws_s3_bucket" "frontend" {
  bucket = "${local.name_prefix}-${data.aws_caller_identity.current.account_id}-frontend"
}

resource "aws_s3_bucket" "raw" {
  bucket = "${local.name_prefix}-${data.aws_caller_identity.current.account_id}-raw"
}

resource "aws_s3_bucket" "exports" {
  bucket = "${local.name_prefix}-${data.aws_caller_identity.current.account_id}-exports"
}

resource "aws_s3_bucket_versioning" "raw" {
  bucket = aws_s3_bucket.raw.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_versioning" "exports" {
  bucket = aws_s3_bucket.exports.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  rule {
    apply_server_side_encryption_by_default {
      kms_master_key_id = aws_kms_key.app.arn
      sse_algorithm     = "aws:kms"
    }
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "raw" {
  bucket = aws_s3_bucket.raw.id

  rule {
    apply_server_side_encryption_by_default {
      kms_master_key_id = aws_kms_key.app.arn
      sse_algorithm     = "aws:kms"
    }
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "exports" {
  bucket = aws_s3_bucket.exports.id

  rule {
    apply_server_side_encryption_by_default {
      kms_master_key_id = aws_kms_key.app.arn
      sse_algorithm     = "aws:kms"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "frontend" {
  bucket                  = aws_s3_bucket.frontend.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_cloudfront_origin_access_control" "frontend" {
  name                              = "${local.name_prefix}-oac"
  description                       = "OAC for frontend bucket"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_distribution" "frontend" {
  enabled             = true
  default_root_object = "index.html"
  is_ipv6_enabled     = true

  origin {
    domain_name              = aws_s3_bucket.frontend.bucket_regional_domain_name
    origin_id                = "frontend-s3"
    origin_access_control_id = aws_cloudfront_origin_access_control.frontend.id
  }

  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "frontend-s3"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }
}

resource "aws_s3_bucket_policy" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowCloudFrontServicePrincipalReadOnly"
        Effect = "Allow"
        Principal = {
          Service = "cloudfront.amazonaws.com"
        }
        Action   = "s3:GetObject"
        Resource = "${aws_s3_bucket.frontend.arn}/*"
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = aws_cloudfront_distribution.frontend.arn
          }
        }
      }
    ]
  })
}

resource "aws_cognito_user_pool" "main" {
  name = "${local.name_prefix}-users"

  password_policy {
    minimum_length                   = 12
    require_lowercase                = true
    require_numbers                  = true
    require_symbols                  = true
    require_uppercase                = true
    temporary_password_validity_days = 7
  }

  auto_verified_attributes = ["email"]
}

resource "aws_cognito_user_pool_client" "web" {
  name         = "${local.name_prefix}-web"
  user_pool_id = aws_cognito_user_pool.main.id

  generate_secret                      = false
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = ["openid", "email", "profile"]
  explicit_auth_flows = [
    "ALLOW_USER_PASSWORD_AUTH",
    "ALLOW_USER_SRP_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
    "ALLOW_ADMIN_USER_PASSWORD_AUTH"
  ]
  supported_identity_providers = ["COGNITO"]
  callback_urls = distinct(concat(
    [
      "https://${aws_cloudfront_distribution.frontend.domain_name}",
      "https://${aws_cloudfront_distribution.frontend.domain_name}/auth/callback"
    ],
    var.cognito_additional_callback_urls
  ))
  logout_urls = distinct(concat(
    ["https://${aws_cloudfront_distribution.frontend.domain_name}"],
    var.cognito_additional_logout_urls
  ))
}

resource "aws_cognito_user_pool_domain" "hosted_ui" {
  domain       = local.cognito_domain_prefix
  user_pool_id = aws_cognito_user_pool.main.id
}

resource "aws_cognito_user_group" "admin" {
  name         = "Admin"
  user_pool_id = aws_cognito_user_pool.main.id
}

resource "aws_cognito_user_group" "analyst" {
  name         = "Analyst"
  user_pool_id = aws_cognito_user_pool.main.id
}

resource "aws_cognito_user_group" "viewer" {
  name         = "Viewer"
  user_pool_id = aws_cognito_user_pool.main.id
}

resource "aws_iam_role" "lambda_api" {
  name = "${local.name_prefix}-lambda-api-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_basic" {
  role       = aws_iam_role.lambda_api.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role" "lambda_ingestion" {
  name = "${local.name_prefix}-lambda-ingestion-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_ingestion_basic" {
  role       = aws_iam_role.lambda_ingestion.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy_attachment" "lambda_ingestion_sqs" {
  role       = aws_iam_role.lambda_ingestion.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaSQSQueueExecutionRole"
}

resource "aws_iam_role" "lambda_export" {
  name = "${local.name_prefix}-lambda-export-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_export_basic" {
  role       = aws_iam_role.lambda_export.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy_attachment" "lambda_export_sqs" {
  role       = aws_iam_role.lambda_export.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaSQSQueueExecutionRole"
}

resource "aws_iam_role" "lambda_migrations" {
  name = "${local.name_prefix}-lambda-migrations-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_migrations_basic" {
  role       = aws_iam_role.lambda_migrations.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy_attachment" "lambda_migrations_vpc_access" {
  role       = aws_iam_role.lambda_migrations.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

resource "aws_lambda_function" "api" {
  function_name = "${local.name_prefix}-api"
  role          = aws_iam_role.lambda_api.arn
  runtime       = "nodejs22.x"
  handler       = "lambda/handler.main"

  filename         = var.lambda_package_path
  source_code_hash = filebase64sha256(var.lambda_package_path)

  timeout     = 30
  memory_size = 512

  environment {
    variables = {
      BEDROCK_MODEL_ID            = "anthropic.claude-haiku-4-5-20251001-v1:0"
      APP_ENV                     = var.environment
      PROVIDER_KEYS_SECRET_ARN    = data.aws_secretsmanager_secret.provider_keys.arn
      APP_CONFIG_SECRET_ARN       = data.aws_secretsmanager_secret.app_config.arn
      AWS_CREDENTIALS_SECRET_ARN  = data.aws_secretsmanager_secret.aws_credentials.arn
      PROVIDER_KEYS_SECRET_NAME   = data.aws_secretsmanager_secret.provider_keys.name
      APP_CONFIG_SECRET_NAME      = data.aws_secretsmanager_secret.app_config.name
      AWS_CREDENTIALS_SECRET_NAME = data.aws_secretsmanager_secret.aws_credentials.name
      DB_RESOURCE_ARN             = aws_rds_cluster.aurora.arn
      DB_SECRET_ARN               = data.aws_secretsmanager_secret.database.arn
      DB_NAME                     = var.db_name
      INGESTION_STATE_MACHINE_ARN = aws_sfn_state_machine.ingestion.arn
      RAW_BUCKET_NAME             = aws_s3_bucket.raw.bucket
      EXPORT_BUCKET_NAME          = aws_s3_bucket.exports.bucket
      EXPORT_QUEUE_URL            = aws_sqs_queue.export.url
      EXPORT_SIGNED_URL_SECONDS   = "900"
      INGESTION_DEFAULT_TERMS     = var.ingestion_default_terms
    }
  }
}

resource "aws_lambda_function" "ingestion_worker" {
  function_name = "${local.name_prefix}-ingestion-worker"
  role          = aws_iam_role.lambda_ingestion.arn
  runtime       = "nodejs22.x"
  handler       = "ingestion/worker.main"

  filename         = var.lambda_package_path
  source_code_hash = filebase64sha256(var.lambda_package_path)

  timeout     = 120
  memory_size = 1024

  environment {
    variables = {
      APP_ENV                     = var.environment
      PROVIDER_KEYS_SECRET_ARN    = data.aws_secretsmanager_secret.provider_keys.arn
      APP_CONFIG_SECRET_ARN       = data.aws_secretsmanager_secret.app_config.arn
      AWS_CREDENTIALS_SECRET_ARN  = data.aws_secretsmanager_secret.aws_credentials.arn
      PROVIDER_KEYS_SECRET_NAME   = data.aws_secretsmanager_secret.provider_keys.name
      APP_CONFIG_SECRET_NAME      = data.aws_secretsmanager_secret.app_config.name
      AWS_CREDENTIALS_SECRET_NAME = data.aws_secretsmanager_secret.aws_credentials.name
      DB_RESOURCE_ARN             = aws_rds_cluster.aurora.arn
      DB_SECRET_ARN               = data.aws_secretsmanager_secret.database.arn
      DB_NAME                     = var.db_name
      RAW_BUCKET_NAME             = aws_s3_bucket.raw.bucket
      INGESTION_DEFAULT_TERMS     = var.ingestion_default_terms
    }
  }
}

resource "aws_lambda_function" "export_worker" {
  function_name = "${local.name_prefix}-export-worker"
  role          = aws_iam_role.lambda_export.arn
  runtime       = "nodejs22.x"
  handler       = "exports/worker.main"

  filename         = var.lambda_package_path
  source_code_hash = filebase64sha256(var.lambda_package_path)

  timeout     = 300
  memory_size = 1024

  environment {
    variables = {
      APP_ENV                   = var.environment
      DB_RESOURCE_ARN           = aws_rds_cluster.aurora.arn
      DB_SECRET_ARN             = data.aws_secretsmanager_secret.database.arn
      DB_NAME                   = var.db_name
      EXPORT_BUCKET_NAME        = aws_s3_bucket.exports.bucket
      EXPORT_SIGNED_URL_SECONDS = "900"
    }
  }
}

resource "aws_lambda_function" "db_migration_runner" {
  function_name = "${local.name_prefix}-db-migration-runner"
  role          = aws_iam_role.lambda_migrations.arn
  runtime       = "nodejs22.x"
  handler       = "migrations/runner.main"

  filename         = var.lambda_package_path
  source_code_hash = filebase64sha256(var.lambda_package_path)

  timeout     = 300
  memory_size = 512

  vpc_config {
    subnet_ids         = var.private_subnet_ids
    security_group_ids = [aws_security_group.aurora.id]
  }

  environment {
    variables = {
      APP_ENV      = var.environment
      DB_HOST      = aws_rds_cluster.aurora.endpoint
      DB_PORT      = "5432"
      DB_NAME      = var.db_name
      DB_USER      = var.db_master_username
      DB_PASSWORD  = var.db_master_password
      MIGRATION_ID = "20260217022500_init"
    }
  }
}

resource "aws_apigatewayv2_api" "http" {
  name          = "${local.name_prefix}-http-api"
  protocol_type = "HTTP"

  cors_configuration {
    allow_headers = ["authorization", "content-type", "x-requested-with"]
    allow_methods = ["GET", "POST", "PATCH", "OPTIONS"]
    allow_origins = distinct(concat(
      ["https://${aws_cloudfront_distribution.frontend.domain_name}"],
      var.api_additional_allowed_origins
    ))
    expose_headers = ["content-type"]
    max_age        = 3600
  }
}

resource "aws_apigatewayv2_integration" "lambda" {
  api_id                 = aws_apigatewayv2_api.http.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.api.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_authorizer" "cognito_jwt" {
  api_id          = aws_apigatewayv2_api.http.id
  name            = "${local.name_prefix}-jwt-authorizer"
  authorizer_type = "JWT"
  identity_sources = [
    "$request.header.Authorization"
  ]

  jwt_configuration {
    audience = [aws_cognito_user_pool_client.web.id]
    issuer   = "https://cognito-idp.${var.aws_region}.amazonaws.com/${aws_cognito_user_pool.main.id}"
  }
}

resource "aws_apigatewayv2_route" "health" {
  api_id             = aws_apigatewayv2_api.http.id
  route_key          = "GET /v1/health"
  authorization_type = "NONE"
  target             = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_apigatewayv2_route" "private_routes" {
  for_each = toset([
    "GET /v1/terms",
    "POST /v1/terms",
    "PATCH /v1/terms/{id}",
    "POST /v1/ingestion/runs",
    "GET /v1/content",
    "PATCH /v1/content/{id}/state",
    "POST /v1/content/bulk/state",
    "PATCH /v1/content/{id}/classification",
    "POST /v1/analysis/runs",
    "GET /v1/analysis/history",
    "POST /v1/exports/csv",
    "GET /v1/exports/{id}",
    "GET /v1/feed/news",
    "GET /v1/meta"
  ])

  api_id             = aws_apigatewayv2_api.http.id
  route_key          = each.value
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito_jwt.id
  target             = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_apigatewayv2_stage" "prod" {
  api_id      = aws_apigatewayv2_api.http.id
  name        = "prod"
  auto_deploy = true
}

resource "aws_lambda_permission" "api_gw" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.http.execution_arn}/*/*"
}

resource "aws_sqs_queue" "ingestion_dlq" {
  name                      = "${local.name_prefix}-ingestion-dlq"
  message_retention_seconds = 1209600
  kms_master_key_id         = aws_kms_key.app.arn
}

resource "aws_sqs_queue" "ingestion" {
  name                       = "${local.name_prefix}-ingestion"
  visibility_timeout_seconds = 120
  message_retention_seconds  = 345600
  kms_master_key_id          = aws_kms_key.app.arn
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.ingestion_dlq.arn
    maxReceiveCount     = 5
  })
}

resource "aws_lambda_event_source_mapping" "ingestion_queue_to_worker" {
  event_source_arn = aws_sqs_queue.ingestion.arn
  function_name    = aws_lambda_function.ingestion_worker.arn
  batch_size       = 1
}

resource "aws_sqs_queue" "export_dlq" {
  name                      = "${local.name_prefix}-export-dlq"
  message_retention_seconds = 1209600
  kms_master_key_id         = aws_kms_key.app.arn
}

resource "aws_sqs_queue" "export" {
  name                       = "${local.name_prefix}-export"
  visibility_timeout_seconds = 300
  message_retention_seconds  = 345600
  kms_master_key_id          = aws_kms_key.app.arn
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.export_dlq.arn
    maxReceiveCount     = 5
  })
}

resource "aws_lambda_event_source_mapping" "export_queue_to_worker" {
  event_source_arn = aws_sqs_queue.export.arn
  function_name    = aws_lambda_function.export_worker.arn
  batch_size       = 1
}

resource "aws_iam_role" "step_functions" {
  name = "${local.name_prefix}-sfn-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "states.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy" "step_functions" {
  name = "${local.name_prefix}-sfn-policy"
  role = aws_iam_role.step_functions.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "sqs:SendMessage"
        ]
        Resource = [aws_sqs_queue.ingestion.arn]
      },
      {
        Effect = "Allow"
        Action = [
          "kms:GenerateDataKey",
          "kms:Decrypt",
          "kms:DescribeKey"
        ]
        Resource = [aws_kms_key.app.arn]
      }
    ]
  })
}

resource "aws_sfn_state_machine" "ingestion" {
  name     = "${local.name_prefix}-ingestion"
  role_arn = aws_iam_role.step_functions.arn

  definition = jsonencode({
    Comment = "Ingestion orchestration"
    StartAt = "DispatchToQueue"
    States = {
      DispatchToQueue = {
        Type     = "Task"
        Resource = "arn:aws:states:::sqs:sendMessage"
        Parameters = {
          QueueUrl        = aws_sqs_queue.ingestion.url
          "MessageBody.$" = "States.JsonToString($)"
        }
        End = true
      }
    }
  })
}

resource "aws_cloudwatch_event_rule" "ingestion_schedule" {
  name                = "${local.name_prefix}-ingestion-every-15m"
  schedule_expression = "rate(15 minutes)"
}

resource "aws_cloudwatch_event_target" "ingestion_schedule" {
  rule      = aws_cloudwatch_event_rule.ingestion_schedule.name
  target_id = "start-ingestion-state-machine"
  arn       = aws_sfn_state_machine.ingestion.arn
  role_arn  = aws_iam_role.events_to_sfn.arn
  input = jsonencode({
    triggerType        = "scheduled"
    runId              = "scheduled"
    requestedAt        = "eventbridge"
    terms              = []
    language           = "es"
    maxArticlesPerTerm = 2
  })
}

resource "aws_iam_role" "events_to_sfn" {
  name = "${local.name_prefix}-events-to-sfn-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "events.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy" "events_to_sfn" {
  name = "${local.name_prefix}-events-to-sfn-policy"
  role = aws_iam_role.events_to_sfn.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "states:StartExecution"
        ]
        Resource = [aws_sfn_state_machine.ingestion.arn]
      }
    ]
  })
}

resource "aws_db_subnet_group" "aurora" {
  name       = "${local.name_prefix}-aurora-subnets"
  subnet_ids = var.private_subnet_ids
}

resource "aws_security_group" "aurora" {
  name        = "${local.name_prefix}-aurora-sg"
  description = "Aurora security group"
  vpc_id      = var.vpc_id

  ingress {
    description = "Postgres from VPC"
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = [data.aws_vpc.selected.cidr_block]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_rds_cluster" "aurora" {
  cluster_identifier     = "${local.name_prefix}-aurora"
  engine                 = "aurora-postgresql"
  engine_mode            = "provisioned"
  engine_version         = "16.11"
  database_name          = var.db_name
  master_username        = var.db_master_username
  master_password        = var.db_master_password
  db_subnet_group_name   = aws_db_subnet_group.aurora.name
  vpc_security_group_ids = [aws_security_group.aurora.id]
  storage_encrypted      = true
  kms_key_id             = aws_kms_key.app.arn
  enable_http_endpoint   = true
  skip_final_snapshot    = true

  serverlessv2_scaling_configuration {
    min_capacity = 0.5
    max_capacity = 4
  }
}

resource "aws_rds_cluster_instance" "aurora_writer" {
  identifier           = "${local.name_prefix}-aurora-writer"
  cluster_identifier   = aws_rds_cluster.aurora.id
  instance_class       = "db.serverless"
  engine               = aws_rds_cluster.aurora.engine
  engine_version       = aws_rds_cluster.aurora.engine_version
  db_subnet_group_name = aws_db_subnet_group.aurora.name
}

resource "aws_ses_email_identity" "sender" {
  email = var.ses_sender_email
}

resource "aws_budgets_budget" "monthly" {
  name         = "${local.name_prefix}-monthly-budget"
  budget_type  = "COST"
  limit_amount = var.monthly_budget_usd
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 80
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = [var.budget_email]
  }
}
