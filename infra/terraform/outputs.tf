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

output "aurora_endpoint" {
  value = aws_rds_cluster.aurora.endpoint
}

output "bedrock_model_id" {
  value = "anthropic.claude-haiku-4-5-20251001-v1:0"
}

output "ingestion_state_machine_arn" {
  value = aws_sfn_state_machine.ingestion.arn
}

output "ingestion_queue_url" {
  value = aws_sqs_queue.ingestion.url
}
