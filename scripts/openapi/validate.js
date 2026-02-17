#!/usr/bin/env node
const path = require("path");
const SwaggerParser = require("@apidevtools/swagger-parser");

(async () => {
  const filePath = path.resolve(__dirname, "../../openapi/v1.yaml");
  try {
    const api = await SwaggerParser.validate(filePath);
    console.log(`OpenAPI valid: ${api.info?.title || "API"} ${api.info?.version || ""}`.trim());
  } catch (error) {
    console.error("OpenAPI validation failed");
    console.error(error.message);
    process.exit(1);
  }
})();
