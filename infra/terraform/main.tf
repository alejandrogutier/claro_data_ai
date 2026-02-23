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

  custom_error_response {
    error_code            = 403
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 0
  }

  custom_error_response {
    error_code            = 404
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 0
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

resource "aws_cognito_user_group" "social_overview_viewer" {
  name         = "SocialOverviewViewer"
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

resource "aws_iam_role" "lambda_incident" {
  name = "${local.name_prefix}-lambda-incident-role"

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

resource "aws_iam_role_policy_attachment" "lambda_incident_basic" {
  role       = aws_iam_role.lambda_incident.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy_attachment" "lambda_incident_sqs" {
  role       = aws_iam_role.lambda_incident.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaSQSQueueExecutionRole"
}

resource "aws_iam_role" "lambda_report" {
  name = "${local.name_prefix}-lambda-report-role"

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

resource "aws_iam_role_policy_attachment" "lambda_report_basic" {
  role       = aws_iam_role.lambda_report.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy_attachment" "lambda_report_sqs" {
  role       = aws_iam_role.lambda_report.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaSQSQueueExecutionRole"
}

resource "aws_iam_role" "lambda_analysis" {
  name = "${local.name_prefix}-lambda-analysis-role"

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

resource "aws_iam_role_policy_attachment" "lambda_analysis_basic" {
  role       = aws_iam_role.lambda_analysis.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy_attachment" "lambda_analysis_sqs" {
  role       = aws_iam_role.lambda_analysis.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaSQSQueueExecutionRole"
}

resource "aws_iam_role" "lambda_digest" {
  name = "${local.name_prefix}-lambda-digest-role"

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

resource "aws_iam_role_policy_attachment" "lambda_digest_basic" {
  role       = aws_iam_role.lambda_digest.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role" "lambda_classification_worker" {
  name = "${local.name_prefix}-lambda-classification-worker-role"

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

resource "aws_iam_role_policy_attachment" "lambda_classification_worker_basic" {
  role       = aws_iam_role.lambda_classification_worker.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy_attachment" "lambda_classification_worker_sqs" {
  role       = aws_iam_role.lambda_classification_worker.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaSQSQueueExecutionRole"
}

resource "aws_iam_role" "lambda_classification_scheduler" {
  name = "${local.name_prefix}-lambda-classification-scheduler-role"

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

resource "aws_iam_role_policy_attachment" "lambda_classification_scheduler_basic" {
  role       = aws_iam_role.lambda_classification_scheduler.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role" "lambda_social_scheduler" {
  name = "${local.name_prefix}-lambda-social-scheduler-role"

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

resource "aws_iam_role_policy_attachment" "lambda_social_scheduler_basic" {
  role       = aws_iam_role.lambda_social_scheduler.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
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

  timeout     = 300
  memory_size = 512

  environment {
    variables = {
      BEDROCK_MODEL_ID            = "us.anthropic.claude-haiku-4-5-20251001-v1:0"
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
      SOCIAL_RAW_BUCKET_NAME      = var.social_raw_bucket_name
      SOCIAL_RAW_PREFIX           = var.social_raw_prefix
      SOCIAL_SCHEDULER_LAMBDA_NAME = aws_lambda_function.social_scheduler.function_name
      EXPORT_BUCKET_NAME          = aws_s3_bucket.exports.bucket
      EXPORT_QUEUE_URL            = aws_sqs_queue.export.url
      INCIDENT_QUEUE_URL          = aws_sqs_queue.incident_evaluation.url
      REPORT_QUEUE_URL            = aws_sqs_queue.report_generation.url
      ANALYSIS_QUEUE_URL          = aws_sqs_queue.analysis_generation.url
      CLASSIFICATION_QUEUE_URL    = aws_sqs_queue.classification_generation.url
      REPORT_CONFIDENCE_THRESHOLD = tostring(var.report_confidence_threshold)
      REPORT_DEFAULT_TIMEZONE     = var.report_default_timezone
      REPORT_EMAIL_SENDER         = var.ses_sender_email
      EXPORT_SIGNED_URL_SECONDS   = "900"
      INGESTION_DEFAULT_TERMS     = var.ingestion_default_terms
      SOCIAL_ANALYTICS_V2_ENABLED = "true"
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

resource "aws_lambda_function" "incident_worker" {
  function_name = "${local.name_prefix}-incident-worker"
  role          = aws_iam_role.lambda_incident.arn
  runtime       = "nodejs22.x"
  handler       = "incidents/worker.main"

  filename         = var.lambda_package_path
  source_code_hash = filebase64sha256(var.lambda_package_path)

  timeout     = 180
  memory_size = 512

  environment {
    variables = {
      APP_ENV                = var.environment
      DB_RESOURCE_ARN        = aws_rds_cluster.aurora.arn
      DB_SECRET_ARN          = data.aws_secretsmanager_secret.database.arn
      DB_NAME                = var.db_name
      ALERT_EMAIL_SENDER     = var.ses_sender_email
      ALERT_EMAIL_RECIPIENTS = var.alert_email_recipients
      ALERT_COOLDOWN_MINUTES = tostring(var.alert_cooldown_minutes)
      ALERT_SIGNAL_VERSION   = var.alert_signal_version
    }
  }
}

resource "aws_lambda_function" "digest_worker" {
  function_name = "${local.name_prefix}-digest-worker"
  role          = aws_iam_role.lambda_digest.arn
  runtime       = "nodejs22.x"
  handler       = "digest/worker.main"

  filename         = var.lambda_package_path
  source_code_hash = filebase64sha256(var.lambda_package_path)

  timeout     = 180
  memory_size = 512

  environment {
    variables = {
      APP_ENV                 = var.environment
      DB_RESOURCE_ARN         = aws_rds_cluster.aurora.arn
      DB_SECRET_ARN           = data.aws_secretsmanager_secret.database.arn
      DB_NAME                 = var.db_name
      EXPORT_BUCKET_NAME      = aws_s3_bucket.exports.bucket
      REPORT_DEFAULT_TIMEZONE = var.report_default_timezone
      REPORT_EMAIL_SENDER     = var.ses_sender_email
      ALERT_EMAIL_SENDER      = var.ses_sender_email
      ALERT_EMAIL_RECIPIENTS  = var.alert_email_recipients
    }
  }
}

resource "aws_lambda_function" "report_worker" {
  function_name = "${local.name_prefix}-report-worker"
  role          = aws_iam_role.lambda_report.arn
  runtime       = "nodejs22.x"
  handler       = "reports/worker.main"

  filename         = var.lambda_package_path
  source_code_hash = filebase64sha256(var.lambda_package_path)

  timeout     = 300
  memory_size = 1024

  environment {
    variables = {
      APP_ENV                     = var.environment
      DB_RESOURCE_ARN             = aws_rds_cluster.aurora.arn
      DB_SECRET_ARN               = data.aws_secretsmanager_secret.database.arn
      DB_NAME                     = var.db_name
      EXPORT_QUEUE_URL            = aws_sqs_queue.export.url
      EXPORT_BUCKET_NAME          = aws_s3_bucket.exports.bucket
      REPORT_CONFIDENCE_THRESHOLD = tostring(var.report_confidence_threshold)
      REPORT_DEFAULT_TIMEZONE     = var.report_default_timezone
      REPORT_EMAIL_SENDER         = var.ses_sender_email
      ALERT_EMAIL_SENDER          = var.ses_sender_email
    }
  }
}

resource "aws_lambda_function" "analysis_worker" {
  function_name = "${local.name_prefix}-analysis-worker"
  role          = aws_iam_role.lambda_analysis.arn
  runtime       = "nodejs22.x"
  handler       = "analysis/worker.main"

  filename         = var.lambda_package_path
  source_code_hash = filebase64sha256(var.lambda_package_path)

  timeout     = 300
  memory_size = 1024

  environment {
    variables = {
      APP_ENV          = var.environment
      DB_RESOURCE_ARN  = aws_rds_cluster.aurora.arn
      DB_SECRET_ARN    = data.aws_secretsmanager_secret.database.arn
      DB_NAME          = var.db_name
      BEDROCK_MODEL_ID = "us.anthropic.claude-haiku-4-5-20251001-v1:0"
    }
  }
}

resource "aws_lambda_function" "classification_worker" {
  function_name = "${local.name_prefix}-classification-worker"
  role          = aws_iam_role.lambda_classification_worker.arn
  runtime       = "nodejs22.x"
  handler       = "classification/worker.main"

  filename         = var.lambda_package_path
  source_code_hash = filebase64sha256(var.lambda_package_path)

  timeout                        = 240
  memory_size                    = 1024
  reserved_concurrent_executions = 2

  environment {
    variables = {
      APP_ENV                       = var.environment
      DB_RESOURCE_ARN               = aws_rds_cluster.aurora.arn
      DB_SECRET_ARN                 = data.aws_secretsmanager_secret.database.arn
      DB_NAME                       = var.db_name
      BEDROCK_MODEL_ID              = "us.anthropic.claude-haiku-4-5-20251001-v1:0"
      CLASSIFICATION_PROMPT_VERSION = "classification-v1"
    }
  }
}

resource "aws_lambda_function" "classification_scheduler" {
  function_name = "${local.name_prefix}-classification-scheduler"
  role          = aws_iam_role.lambda_classification_scheduler.arn
  runtime       = "nodejs22.x"
  handler       = "classification/scheduler.main"

  filename         = var.lambda_package_path
  source_code_hash = filebase64sha256(var.lambda_package_path)

  timeout                        = 120
  memory_size                    = 512
  reserved_concurrent_executions = 1

  environment {
    variables = {
      APP_ENV                        = var.environment
      DB_RESOURCE_ARN                = aws_rds_cluster.aurora.arn
      DB_SECRET_ARN                  = data.aws_secretsmanager_secret.database.arn
      DB_NAME                        = var.db_name
      BEDROCK_MODEL_ID               = "us.anthropic.claude-haiku-4-5-20251001-v1:0"
      CLASSIFICATION_QUEUE_URL       = aws_sqs_queue.classification_generation.url
      CLASSIFICATION_PROMPT_VERSION  = "classification-v1"
      CLASSIFICATION_WINDOW_DAYS     = "7"
      CLASSIFICATION_SCHEDULER_LIMIT = "120"
    }
  }
}

resource "aws_lambda_function" "social_scheduler" {
  function_name = "${local.name_prefix}-social-scheduler"
  role          = aws_iam_role.lambda_social_scheduler.arn
  runtime       = "nodejs22.x"
  handler       = "social/scheduler.main"

  filename         = var.lambda_package_path
  source_code_hash = filebase64sha256(var.lambda_package_path)

  timeout                        = 300
  memory_size                    = 1024
  reserved_concurrent_executions = 1

  environment {
    variables = {
      APP_ENV                = var.environment
      DB_RESOURCE_ARN        = aws_rds_cluster.aurora.arn
      DB_SECRET_ARN          = data.aws_secretsmanager_secret.database.arn
      DB_NAME                = var.db_name
      RAW_BUCKET_NAME        = aws_s3_bucket.raw.bucket
      SOCIAL_RAW_BUCKET_NAME = var.social_raw_bucket_name
      SOCIAL_RAW_PREFIX      = var.social_raw_prefix
      CLASSIFICATION_QUEUE_URL = aws_sqs_queue.classification_generation.url
      CLASSIFICATION_PROMPT_VERSION = "social-sentiment-v1"
      BEDROCK_MODEL_ID       = "us.anthropic.claude-haiku-4-5-20251001-v1:0"
    }
  }
}

resource "aws_lambda_function" "report_scheduler" {
  function_name = "${local.name_prefix}-report-scheduler"
  role          = aws_iam_role.lambda_report.arn
  runtime       = "nodejs22.x"
  handler       = "reports/scheduler.main"

  filename         = var.lambda_package_path
  source_code_hash = filebase64sha256(var.lambda_package_path)

  timeout     = 120
  memory_size = 512

  environment {
    variables = {
      APP_ENV                 = var.environment
      DB_RESOURCE_ARN         = aws_rds_cluster.aurora.arn
      DB_SECRET_ARN           = data.aws_secretsmanager_secret.database.arn
      DB_NAME                 = var.db_name
      REPORT_QUEUE_URL        = aws_sqs_queue.report_generation.url
      REPORT_DEFAULT_TIMEZONE = var.report_default_timezone
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
    "GET /v1/analyze/overview",
    "GET /v1/analyze/channel",
    "GET /v1/analyze/competitors",
    "POST /v1/analysis/runs",
    "GET /v1/analysis/history",
    "GET /v1/analysis/runs/{id}",
    "POST /v1/exports/csv",
    "GET /v1/exports/{id}",
    "GET /v1/reports/center",
    "GET /v1/reports/runs/{id}",
    "POST /v1/reports/runs",
    "GET /v1/reports/templates",
    "POST /v1/reports/templates",
    "PATCH /v1/reports/templates/{id}",
    "GET /v1/reports/schedules",
    "POST /v1/reports/schedules",
    "PATCH /v1/reports/schedules/{id}",
    "POST /v1/reports/schedules/{id}/run",
    "GET /v1/feed/news",
    "GET /v1/monitor/overview",
    "GET /v1/monitor/social/overview",
    "GET /v1/monitor/social/accounts",
    "GET /v1/monitor/social/posts",
    "GET /v1/monitor/social/risk",
    "GET /v1/monitor/social/charts/heatmap",
    "GET /v1/monitor/social/charts/scatter",
    "GET /v1/monitor/social/charts/er-breakdown",
    "GET /v1/monitor/social/targets/er",
    "PATCH /v1/monitor/social/targets/er",
    "POST /v1/monitor/social/hashtags/backfill",
    "GET /v1/monitor/social/etl-quality",
    "GET /v1/monitor/social/export.xlsx",
    "POST /v1/monitor/social/runs",
    "GET /v1/monitor/social/runs",
    "GET /v1/monitor/social/settings",
    "PATCH /v1/monitor/social/settings",
    "GET /v1/monitor/incidents",
    "PATCH /v1/monitor/incidents/{id}",
    "GET /v1/monitor/incidents/{id}/notes",
    "POST /v1/monitor/incidents/{id}/notes",
    "POST /v1/monitor/incidents/evaluate",
    "GET /v1/meta",
    "GET /v1/connectors",
    "PATCH /v1/connectors/{id}",
    "POST /v1/connectors/{id}/sync",
    "GET /v1/connectors/{id}/runs",
    "GET /v1/config/accounts",
    "POST /v1/config/accounts",
    "PATCH /v1/config/accounts/{id}",
    "GET /v1/config/queries",
    "POST /v1/config/queries",
    "POST /v1/config/queries/preview",
    "GET /v1/config/queries/{id}",
    "PATCH /v1/config/queries/{id}",
    "DELETE /v1/config/queries/{id}",
    "GET /v1/config/queries/{id}/revisions",
    "POST /v1/config/queries/{id}/rollback",
    "POST /v1/config/queries/{id}/dry-run",
    "GET /v1/config/competitors",
    "POST /v1/config/competitors",
    "PATCH /v1/config/competitors/{id}",
    "GET /v1/config/taxonomies/{kind}",
    "POST /v1/config/taxonomies/{kind}",
    "PATCH /v1/config/taxonomies/{kind}/{id}",
    "GET /v1/config/source-scoring/weights",
    "POST /v1/config/source-scoring/weights",
    "PATCH /v1/config/source-scoring/weights/{id}",
    "GET /v1/config/audit",
    "GET /v1/config/notifications/recipients",
    "POST /v1/config/notifications/recipients",
    "PATCH /v1/config/notifications/recipients/{id}",
    "GET /v1/config/notifications/status",
    "POST /v1/config/audit/export"
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

resource "aws_sqs_queue" "incident_evaluation_dlq" {
  name                      = "${local.name_prefix}-incident-evaluation-dlq"
  message_retention_seconds = 1209600
  kms_master_key_id         = aws_kms_key.app.arn
}

resource "aws_sqs_queue" "incident_evaluation" {
  name                       = "${local.name_prefix}-incident-evaluation"
  visibility_timeout_seconds = 240
  message_retention_seconds  = 345600
  kms_master_key_id          = aws_kms_key.app.arn
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.incident_evaluation_dlq.arn
    maxReceiveCount     = 5
  })
}

resource "aws_sqs_queue_policy" "incident_evaluation_events" {
  queue_url = aws_sqs_queue.incident_evaluation.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowEventBridgeSendMessage"
        Effect = "Allow"
        Principal = {
          Service = "events.amazonaws.com"
        }
        Action   = "sqs:SendMessage"
        Resource = aws_sqs_queue.incident_evaluation.arn
        Condition = {
          ArnEquals = {
            "aws:SourceArn" = aws_cloudwatch_event_rule.incident_evaluation_schedule.arn
          }
        }
      }
    ]
  })
}

resource "aws_lambda_event_source_mapping" "incident_queue_to_worker" {
  event_source_arn = aws_sqs_queue.incident_evaluation.arn
  function_name    = aws_lambda_function.incident_worker.arn
  batch_size       = 1
}

resource "aws_sqs_queue" "report_generation_dlq" {
  name                      = "${local.name_prefix}-report-generation-dlq"
  message_retention_seconds = 1209600
  kms_master_key_id         = aws_kms_key.app.arn
}

resource "aws_sqs_queue" "report_generation" {
  name                       = "${local.name_prefix}-report-generation"
  visibility_timeout_seconds = 300
  message_retention_seconds  = 345600
  kms_master_key_id          = aws_kms_key.app.arn
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.report_generation_dlq.arn
    maxReceiveCount     = 5
  })
}

resource "aws_lambda_event_source_mapping" "report_queue_to_worker" {
  event_source_arn = aws_sqs_queue.report_generation.arn
  function_name    = aws_lambda_function.report_worker.arn
  batch_size       = 1
}

resource "aws_sqs_queue" "classification_generation_dlq" {
  name                      = "${local.name_prefix}-classification-generation-dlq"
  message_retention_seconds = 1209600
  kms_master_key_id         = aws_kms_key.app.arn
}

resource "aws_sqs_queue" "classification_generation" {
  name                       = "${local.name_prefix}-classification-generation"
  visibility_timeout_seconds = 360
  message_retention_seconds  = 345600
  kms_master_key_id          = aws_kms_key.app.arn
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.classification_generation_dlq.arn
    maxReceiveCount     = 5
  })
}

resource "aws_lambda_event_source_mapping" "classification_queue_to_worker" {
  event_source_arn = aws_sqs_queue.classification_generation.arn
  function_name    = aws_lambda_function.classification_worker.arn
  batch_size       = 1
}

resource "aws_sqs_queue" "analysis_generation_dlq" {
  name                      = "${local.name_prefix}-analysis-generation-dlq"
  message_retention_seconds = 1209600
  kms_master_key_id         = aws_kms_key.app.arn
}

resource "aws_sqs_queue" "analysis_generation" {
  name                       = "${local.name_prefix}-analysis-generation"
  visibility_timeout_seconds = 360
  message_retention_seconds  = 345600
  kms_master_key_id          = aws_kms_key.app.arn
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.analysis_generation_dlq.arn
    maxReceiveCount     = 5
  })
}

resource "aws_lambda_event_source_mapping" "analysis_queue_to_worker" {
  event_source_arn = aws_sqs_queue.analysis_generation.arn
  function_name    = aws_lambda_function.analysis_worker.arn
  batch_size       = 1
}

resource "aws_cloudwatch_event_rule" "incident_evaluation_schedule" {
  name                = "${local.name_prefix}-incident-evaluation-every-15m"
  schedule_expression = "rate(15 minutes)"
}

resource "aws_cloudwatch_event_target" "incident_evaluation_schedule" {
  rule      = aws_cloudwatch_event_rule.incident_evaluation_schedule.name
  target_id = "incident-evaluation-queue"
  arn       = aws_sqs_queue.incident_evaluation.arn
  input = jsonencode({
    trigger_type = "scheduled"
    requested_at = "eventbridge"
  })
}

resource "aws_cloudwatch_event_rule" "report_schedule" {
  name                = "${local.name_prefix}-report-scheduler-every-15m"
  schedule_expression = "rate(15 minutes)"
}

resource "aws_cloudwatch_event_target" "report_schedule" {
  rule      = aws_cloudwatch_event_rule.report_schedule.name
  target_id = "report-scheduler-lambda"
  arn       = aws_lambda_function.report_scheduler.arn
  input = jsonencode({
    trigger_type = "scheduled"
    requested_at = "eventbridge"
  })
}

resource "aws_lambda_permission" "report_scheduler_eventbridge" {
  statement_id  = "AllowExecutionFromEventBridgeReportScheduler"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.report_scheduler.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.report_schedule.arn
}

resource "aws_cloudwatch_event_rule" "classification_schedule" {
  name                = "${local.name_prefix}-classification-scheduler-every-15m"
  schedule_expression = "rate(15 minutes)"
}

resource "aws_cloudwatch_event_target" "classification_schedule" {
  rule      = aws_cloudwatch_event_rule.classification_schedule.name
  target_id = "classification-scheduler-lambda"
  arn       = aws_lambda_function.classification_scheduler.arn
  input = jsonencode({
    trigger_type = "scheduled"
    requested_at = "eventbridge"
  })
}

resource "aws_lambda_permission" "classification_scheduler_eventbridge" {
  statement_id  = "AllowExecutionFromEventBridgeClassificationScheduler"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.classification_scheduler.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.classification_schedule.arn
}

resource "aws_cloudwatch_event_rule" "social_daily_8am_bogota" {
  name                = "${local.name_prefix}-social-daily-8am-bogota"
  schedule_expression = "cron(0 13 * * ? *)"
}

resource "aws_cloudwatch_event_target" "social_daily_8am_bogota" {
  rule      = aws_cloudwatch_event_rule.social_daily_8am_bogota.name
  target_id = "social-scheduler-lambda"
  arn       = aws_lambda_function.social_scheduler.arn
  input = jsonencode({
    request_id   = "scheduled"
    requested_at = "eventbridge"
  })
}

resource "aws_lambda_permission" "social_scheduler_eventbridge" {
  statement_id  = "AllowExecutionFromEventBridgeSocialScheduler"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.social_scheduler.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.social_daily_8am_bogota.arn
}

resource "aws_cloudwatch_event_rule" "digest_daily" {
  name                = "${local.name_prefix}-digest-daily-8am-bogota"
  schedule_expression = "cron(0 13 * * ? *)"
}

resource "aws_cloudwatch_event_target" "digest_daily" {
  rule      = aws_cloudwatch_event_rule.digest_daily.name
  target_id = "digest-worker-lambda"
  arn       = aws_lambda_function.digest_worker.arn
  input = jsonencode({
    trigger_type    = "scheduled"
    recipient_scope = "ops"
    requested_at    = "eventbridge"
  })
}

resource "aws_lambda_permission" "digest_worker_eventbridge" {
  statement_id  = "AllowExecutionFromEventBridgeDigestWorker"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.digest_worker.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.digest_daily.arn
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
