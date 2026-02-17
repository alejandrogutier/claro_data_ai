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
          data.aws_secretsmanager_secret.aws_credentials.arn
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "kms:Decrypt"
        ]
        Resource = [aws_kms_key.app.arn]
      }
    ]
  })
}
