resource "aws_iam_role_policy" "lambda_secrets_access" {
  name = "${local.name_prefix}-lambda-secrets-policy"
  role = aws_iam_role.lambda_api.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue",
          "secretsmanager:DescribeSecret"
        ]
        Resource = [
          data.aws_secretsmanager_secret.provider_keys.arn,
          data.aws_secretsmanager_secret.app_config.arn,
          data.aws_secretsmanager_secret.aws_credentials.arn,
          data.aws_secretsmanager_secret.database.arn
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "rds-data:ExecuteStatement",
          "rds-data:BatchExecuteStatement",
          "rds-data:BeginTransaction",
          "rds-data:CommitTransaction",
          "rds-data:RollbackTransaction"
        ]
        Resource = [aws_rds_cluster.aurora.arn]
      },
      {
        Effect = "Allow"
        Action = [
          "kms:Decrypt",
          "kms:Encrypt",
          "kms:GenerateDataKey",
          "kms:DescribeKey"
        ]
        Resource = [aws_kms_key.app.arn]
      },
      {
        Effect = "Allow"
        Action = [
          "sqs:SendMessage"
        ]
        Resource = [
          aws_sqs_queue.export.arn,
          aws_sqs_queue.incident_evaluation.arn,
          aws_sqs_queue.report_generation.arn,
          aws_sqs_queue.analysis_generation.arn,
          aws_sqs_queue.classification_generation.arn,
          aws_sqs_queue.social_topic_generation.arn,
          aws_sqs_queue.awario_sync.arn
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "lambda:InvokeFunction"
        ]
        Resource = [
          aws_lambda_function.social_scheduler.arn,
          aws_lambda_function.social_topic_scheduler.arn
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:PutObjectTagging"
        ]
        Resource = ["${aws_s3_bucket.exports.arn}/*"]
      },
      {
        Effect = "Allow"
        Action = [
          "s3:ListBucket"
        ]
        Resource = [
          aws_s3_bucket.raw.arn,
          "arn:aws:s3:::${var.social_raw_bucket_name}"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject"
        ]
        Resource = [
          "${aws_s3_bucket.raw.arn}/*",
          "arn:aws:s3:::${var.social_raw_bucket_name}/*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "bedrock:InvokeModel"
        ]
        Resource = ["*"]
      },
      {
        Effect = "Allow"
        Action = [
          "ses:GetAccount",
          "ses:GetEmailIdentity",
          "sesv2:GetAccount",
          "sesv2:GetEmailIdentity"
        ]
        Resource = ["*"]
      }
    ]
  })
}

resource "aws_iam_role_policy" "lambda_api_ingestion_start" {
  name = "${local.name_prefix}-lambda-api-ingestion-start"
  role = aws_iam_role.lambda_api.id

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

resource "aws_iam_role_policy" "lambda_ingestion_access" {
  name = "${local.name_prefix}-lambda-ingestion-access"
  role = aws_iam_role.lambda_ingestion.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue",
          "secretsmanager:DescribeSecret"
        ]
        Resource = [
          data.aws_secretsmanager_secret.provider_keys.arn,
          data.aws_secretsmanager_secret.app_config.arn,
          data.aws_secretsmanager_secret.aws_credentials.arn,
          data.aws_secretsmanager_secret.database.arn
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "rds-data:ExecuteStatement",
          "rds-data:BatchExecuteStatement",
          "rds-data:BeginTransaction",
          "rds-data:CommitTransaction",
          "rds-data:RollbackTransaction"
        ]
        Resource = [aws_rds_cluster.aurora.arn]
      },
      {
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:PutObjectTagging"
        ]
        Resource = ["${aws_s3_bucket.raw.arn}/*"]
      },
      {
        Effect = "Allow"
        Action = [
          "kms:Decrypt",
          "kms:Encrypt",
          "kms:GenerateDataKey",
          "kms:DescribeKey"
        ]
        Resource = [aws_kms_key.app.arn]
      }
    ]
  })
}

resource "aws_iam_role_policy" "lambda_export_access" {
  name = "${local.name_prefix}-lambda-export-access"
  role = aws_iam_role.lambda_export.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue",
          "secretsmanager:DescribeSecret"
        ]
        Resource = [data.aws_secretsmanager_secret.database.arn]
      },
      {
        Effect = "Allow"
        Action = [
          "rds-data:ExecuteStatement",
          "rds-data:BatchExecuteStatement",
          "rds-data:BeginTransaction",
          "rds-data:CommitTransaction",
          "rds-data:RollbackTransaction"
        ]
        Resource = [aws_rds_cluster.aurora.arn]
      },
      {
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:PutObjectTagging",
          "s3:GetObject"
        ]
        Resource = ["${aws_s3_bucket.exports.arn}/*"]
      },
      {
        Effect = "Allow"
        Action = [
          "kms:Decrypt",
          "kms:Encrypt",
          "kms:GenerateDataKey",
          "kms:DescribeKey"
        ]
        Resource = [aws_kms_key.app.arn]
      }
    ]
  })
}

resource "aws_iam_role_policy" "lambda_incident_access" {
  name = "${local.name_prefix}-lambda-incident-access"
  role = aws_iam_role.lambda_incident.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue",
          "secretsmanager:DescribeSecret"
        ]
        Resource = [data.aws_secretsmanager_secret.database.arn]
      },
      {
        Effect = "Allow"
        Action = [
          "rds-data:ExecuteStatement",
          "rds-data:BatchExecuteStatement",
          "rds-data:BeginTransaction",
          "rds-data:CommitTransaction",
          "rds-data:RollbackTransaction"
        ]
        Resource = [aws_rds_cluster.aurora.arn]
      },
      {
        Effect = "Allow"
        Action = [
          "ses:SendEmail",
          "ses:SendRawEmail",
          "ses:GetAccount",
          "ses:GetEmailIdentity",
          "ses:GetIdentityVerificationAttributes",
          "sesv2:GetAccount",
          "sesv2:GetEmailIdentity",
          "sesv2:SendEmail"
        ]
        Resource = ["*"]
      },
      {
        Effect = "Allow"
        Action = [
          "kms:Decrypt",
          "kms:Encrypt",
          "kms:GenerateDataKey",
          "kms:DescribeKey"
        ]
        Resource = [aws_kms_key.app.arn]
      }
    ]
  })
}

resource "aws_iam_role_policy" "lambda_digest_access" {
  name = "${local.name_prefix}-lambda-digest-access"
  role = aws_iam_role.lambda_digest.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue",
          "secretsmanager:DescribeSecret"
        ]
        Resource = [data.aws_secretsmanager_secret.database.arn]
      },
      {
        Effect = "Allow"
        Action = [
          "rds-data:ExecuteStatement",
          "rds-data:BatchExecuteStatement",
          "rds-data:BeginTransaction",
          "rds-data:CommitTransaction",
          "rds-data:RollbackTransaction"
        ]
        Resource = [aws_rds_cluster.aurora.arn]
      },
      {
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:PutObjectTagging",
          "s3:GetObject"
        ]
        Resource = ["${aws_s3_bucket.exports.arn}/*"]
      },
      {
        Effect = "Allow"
        Action = [
          "ses:SendEmail",
          "ses:SendRawEmail",
          "ses:GetAccount",
          "ses:GetEmailIdentity",
          "ses:GetIdentityVerificationAttributes",
          "sesv2:GetAccount",
          "sesv2:GetEmailIdentity",
          "sesv2:SendEmail"
        ]
        Resource = ["*"]
      },
      {
        Effect = "Allow"
        Action = [
          "kms:Decrypt",
          "kms:Encrypt",
          "kms:GenerateDataKey",
          "kms:DescribeKey"
        ]
        Resource = [aws_kms_key.app.arn]
      }
    ]
  })
}

resource "aws_iam_role_policy" "lambda_report_access" {
  name = "${local.name_prefix}-lambda-report-access"
  role = aws_iam_role.lambda_report.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue",
          "secretsmanager:DescribeSecret"
        ]
        Resource = [data.aws_secretsmanager_secret.database.arn]
      },
      {
        Effect = "Allow"
        Action = [
          "rds-data:ExecuteStatement",
          "rds-data:BatchExecuteStatement",
          "rds-data:BeginTransaction",
          "rds-data:CommitTransaction",
          "rds-data:RollbackTransaction"
        ]
        Resource = [aws_rds_cluster.aurora.arn]
      },
      {
        Effect = "Allow"
        Action = [
          "sqs:SendMessage"
        ]
        Resource = [
          aws_sqs_queue.export.arn,
          aws_sqs_queue.report_generation.arn
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "ses:SendEmail",
          "ses:SendRawEmail",
          "ses:GetAccount",
          "ses:GetEmailIdentity",
          "ses:GetIdentityVerificationAttributes",
          "sesv2:GetAccount",
          "sesv2:GetEmailIdentity",
          "sesv2:SendEmail"
        ]
        Resource = ["*"]
      },
      {
        Effect = "Allow"
        Action = [
          "kms:Decrypt",
          "kms:Encrypt",
          "kms:GenerateDataKey",
          "kms:DescribeKey"
        ]
        Resource = [aws_kms_key.app.arn]
      }
    ]
  })
}

resource "aws_iam_role_policy" "lambda_analysis_access" {
  name = "${local.name_prefix}-lambda-analysis-access"
  role = aws_iam_role.lambda_analysis.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue",
          "secretsmanager:DescribeSecret"
        ]
        Resource = [data.aws_secretsmanager_secret.database.arn]
      },
      {
        Effect = "Allow"
        Action = [
          "rds-data:ExecuteStatement",
          "rds-data:BatchExecuteStatement",
          "rds-data:BeginTransaction",
          "rds-data:CommitTransaction",
          "rds-data:RollbackTransaction"
        ]
        Resource = [aws_rds_cluster.aurora.arn]
      },
      {
        Effect = "Allow"
        Action = [
          "bedrock:InvokeModel"
        ]
        Resource = ["*"]
      },
      {
        Effect = "Allow"
        Action = [
          "sqs:SendMessage"
        ]
        Resource = [aws_sqs_queue.classification_generation.arn]
      },
      {
        Effect = "Allow"
        Action = [
          "kms:Decrypt",
          "kms:Encrypt",
          "kms:GenerateDataKey",
          "kms:DescribeKey"
        ]
        Resource = [aws_kms_key.app.arn]
      }
    ]
  })
}

resource "aws_iam_role_policy" "lambda_classification_worker_access" {
  name = "${local.name_prefix}-lambda-classification-worker-access"
  role = aws_iam_role.lambda_classification_worker.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue",
          "secretsmanager:DescribeSecret"
        ]
        Resource = [data.aws_secretsmanager_secret.database.arn]
      },
      {
        Effect = "Allow"
        Action = [
          "rds-data:ExecuteStatement",
          "rds-data:BatchExecuteStatement",
          "rds-data:BeginTransaction",
          "rds-data:CommitTransaction",
          "rds-data:RollbackTransaction"
        ]
        Resource = [aws_rds_cluster.aurora.arn]
      },
      {
        Effect = "Allow"
        Action = [
          "bedrock:InvokeModel"
        ]
        Resource = ["*"]
      },
      {
        Effect = "Allow"
        Action = [
          "kms:Decrypt",
          "kms:Encrypt",
          "kms:GenerateDataKey",
          "kms:DescribeKey"
        ]
        Resource = [aws_kms_key.app.arn]
      }
    ]
  })
}

resource "aws_iam_role_policy" "lambda_classification_scheduler_access" {
  name = "${local.name_prefix}-lambda-classification-scheduler-access"
  role = aws_iam_role.lambda_classification_scheduler.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue",
          "secretsmanager:DescribeSecret"
        ]
        Resource = [data.aws_secretsmanager_secret.database.arn]
      },
      {
        Effect = "Allow"
        Action = [
          "rds-data:ExecuteStatement",
          "rds-data:BatchExecuteStatement",
          "rds-data:BeginTransaction",
          "rds-data:CommitTransaction",
          "rds-data:RollbackTransaction"
        ]
        Resource = [aws_rds_cluster.aurora.arn]
      },
      {
        Effect = "Allow"
        Action = [
          "sqs:SendMessage"
        ]
        Resource = [aws_sqs_queue.classification_generation.arn]
      },
      {
        Effect = "Allow"
        Action = [
          "kms:Decrypt",
          "kms:Encrypt",
          "kms:GenerateDataKey",
          "kms:DescribeKey"
        ]
        Resource = [aws_kms_key.app.arn]
      }
    ]
  })
}

resource "aws_iam_role_policy" "lambda_social_topic_worker_access" {
  name = "${local.name_prefix}-lambda-social-topic-worker-access"
  role = aws_iam_role.lambda_social_topic_worker.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue",
          "secretsmanager:DescribeSecret"
        ]
        Resource = [data.aws_secretsmanager_secret.database.arn]
      },
      {
        Effect = "Allow"
        Action = [
          "rds-data:ExecuteStatement",
          "rds-data:BatchExecuteStatement",
          "rds-data:BeginTransaction",
          "rds-data:CommitTransaction",
          "rds-data:RollbackTransaction"
        ]
        Resource = [aws_rds_cluster.aurora.arn]
      },
      {
        Effect = "Allow"
        Action = [
          "bedrock:InvokeModel"
        ]
        Resource = ["*"]
      },
      {
        Effect = "Allow"
        Action = [
          "kms:Decrypt",
          "kms:Encrypt",
          "kms:GenerateDataKey",
          "kms:DescribeKey"
        ]
        Resource = [aws_kms_key.app.arn]
      }
    ]
  })
}

resource "aws_iam_role_policy" "lambda_social_topic_scheduler_access" {
  name = "${local.name_prefix}-lambda-social-topic-scheduler-access"
  role = aws_iam_role.lambda_social_topic_scheduler.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue",
          "secretsmanager:DescribeSecret"
        ]
        Resource = [data.aws_secretsmanager_secret.database.arn]
      },
      {
        Effect = "Allow"
        Action = [
          "rds-data:ExecuteStatement",
          "rds-data:BatchExecuteStatement",
          "rds-data:BeginTransaction",
          "rds-data:CommitTransaction",
          "rds-data:RollbackTransaction"
        ]
        Resource = [aws_rds_cluster.aurora.arn]
      },
      {
        Effect = "Allow"
        Action = [
          "sqs:SendMessage"
        ]
        Resource = [aws_sqs_queue.social_topic_generation.arn]
      },
      {
        Effect = "Allow"
        Action = [
          "kms:Decrypt",
          "kms:Encrypt",
          "kms:GenerateDataKey",
          "kms:DescribeKey"
        ]
        Resource = [aws_kms_key.app.arn]
      }
    ]
  })
}

resource "aws_iam_role_policy" "lambda_social_scheduler_access" {
  name = "${local.name_prefix}-lambda-social-scheduler-access"
  role = aws_iam_role.lambda_social_scheduler.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue",
          "secretsmanager:DescribeSecret"
        ]
        Resource = [data.aws_secretsmanager_secret.database.arn]
      },
      {
        Effect = "Allow"
        Action = [
          "rds-data:ExecuteStatement",
          "rds-data:BatchExecuteStatement",
          "rds-data:BeginTransaction",
          "rds-data:CommitTransaction",
          "rds-data:RollbackTransaction"
        ]
        Resource = [aws_rds_cluster.aurora.arn]
      },
      {
        Effect = "Allow"
        Action = [
          "s3:ListBucket"
        ]
        Resource = [
          aws_s3_bucket.raw.arn,
          "arn:aws:s3:::${var.social_raw_bucket_name}"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject"
        ]
        Resource = [
          "${aws_s3_bucket.raw.arn}/*",
          "arn:aws:s3:::${var.social_raw_bucket_name}/*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "sqs:SendMessage"
        ]
        Resource = [
          aws_sqs_queue.classification_generation.arn,
          aws_sqs_queue.social_topic_generation.arn
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "bedrock:InvokeModel"
        ]
        Resource = ["*"]
      },
      {
        Effect = "Allow"
        Action = [
          "kms:Decrypt",
          "kms:Encrypt",
          "kms:GenerateDataKey",
          "kms:DescribeKey"
        ]
        Resource = [aws_kms_key.app.arn]
      }
    ]
  })
}

resource "aws_iam_role_policy" "lambda_awario_sync_worker_access" {
  name = "${local.name_prefix}-lambda-awario-sync-worker-access"
  role = aws_iam_role.lambda_awario_sync_worker.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue",
          "secretsmanager:DescribeSecret"
        ]
        Resource = [
          data.aws_secretsmanager_secret.database.arn,
          data.aws_secretsmanager_secret.provider_keys.arn,
          data.aws_secretsmanager_secret.app_config.arn,
          data.aws_secretsmanager_secret.aws_credentials.arn
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "rds-data:ExecuteStatement",
          "rds-data:BatchExecuteStatement",
          "rds-data:BeginTransaction",
          "rds-data:CommitTransaction",
          "rds-data:RollbackTransaction"
        ]
        Resource = [aws_rds_cluster.aurora.arn]
      },
      {
        Effect = "Allow"
        Action = [
          "sqs:SendMessage"
        ]
        Resource = [aws_sqs_queue.awario_sync.arn]
      },
      {
        Effect = "Allow"
        Action = [
          "kms:Decrypt",
          "kms:Encrypt",
          "kms:GenerateDataKey",
          "kms:DescribeKey"
        ]
        Resource = [aws_kms_key.app.arn]
      }
    ]
  })
}

resource "aws_iam_role_policy" "lambda_awario_sync_scheduler_access" {
  name = "${local.name_prefix}-lambda-awario-sync-scheduler-access"
  role = aws_iam_role.lambda_awario_sync_scheduler.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue",
          "secretsmanager:DescribeSecret"
        ]
        Resource = [data.aws_secretsmanager_secret.database.arn]
      },
      {
        Effect = "Allow"
        Action = [
          "rds-data:ExecuteStatement",
          "rds-data:BatchExecuteStatement",
          "rds-data:BeginTransaction",
          "rds-data:CommitTransaction",
          "rds-data:RollbackTransaction"
        ]
        Resource = [aws_rds_cluster.aurora.arn]
      },
      {
        Effect = "Allow"
        Action = [
          "sqs:SendMessage"
        ]
        Resource = [aws_sqs_queue.awario_sync.arn]
      },
      {
        Effect = "Allow"
        Action = [
          "kms:Decrypt",
          "kms:Encrypt",
          "kms:GenerateDataKey",
          "kms:DescribeKey"
        ]
        Resource = [aws_kms_key.app.arn]
      }
    ]
  })
}
