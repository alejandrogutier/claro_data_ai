output "cloudfront_domain_name" {
  value = aws_cloudfront_distribution.frontend.domain_name
}

output "http_api_endpoint" {
  value = aws_apigatewayv2_stage.prod.invoke_url
}

output "cognito_user_pool_id" {
  value = aws_cognito_user_pool.main.id
}

output "cognito_client_id" {
  value = aws_cognito_user_pool_client.web.id
}

output "cognito_hosted_ui_domain" {
  value = "https://${aws_cognito_user_pool_domain.hosted_ui.domain}.auth.${var.aws_region}.amazoncognito.com"
}

output "aurora_endpoint" {
  value = aws_rds_cluster.aurora.endpoint
}

output "bedrock_model_id" {
  value = "us.anthropic.claude-haiku-4-5-20251001-v1:0"
}

output "ingestion_state_machine_arn" {
  value = aws_sfn_state_machine.ingestion.arn
}

output "ingestion_queue_url" {
  value = aws_sqs_queue.ingestion.url
}

output "export_queue_url" {
  value = aws_sqs_queue.export.url
}

output "incident_evaluation_queue_url" {
  value = aws_sqs_queue.incident_evaluation.url
}

output "analysis_generation_queue_url" {
  value = aws_sqs_queue.analysis_generation.url
}

output "db_migration_lambda_name" {
  value = aws_lambda_function.db_migration_runner.function_name
}

output "export_worker_lambda_name" {
  value = aws_lambda_function.export_worker.function_name
}

output "incident_worker_lambda_name" {
  value = aws_lambda_function.incident_worker.function_name
}

output "digest_worker_lambda_name" {
  value = aws_lambda_function.digest_worker.function_name
}

output "analysis_worker_lambda_name" {
  value = aws_lambda_function.analysis_worker.function_name
}
