provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      claro       = "true"
      app         = var.project_name
      env         = var.environment
      owner       = var.owner
      cost-center = var.cost_center
      managed-by  = "terraform"
    }
  }
}
