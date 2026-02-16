# Security Rotation Checklist (CLARO-001)

## Objetivo
Remediar exposicion de secretos actuales y establecer manejo seguro en AWS.

## Checklist
- [ ] Inventariar todas las llaves/API keys activas.
- [ ] Rotar credenciales en proveedores externos (NewsAPI, GNews, NewsData, WorldNews, Guardian, NYT).
- [ ] Rotar credenciales AWS afectadas y revocar las anteriores.
- [ ] Crear secretos en AWS Secrets Manager (`claro-data/prod/*`).
- [ ] Actualizar Lambdas para leer secretos desde Secrets Manager.
- [ ] Validar que logs no expongan secretos.
- [ ] Confirmar `.env` fuera de versionado y usar `.env.example`.

## Secretos recomendados
- `claro-data/prod/provider-api-keys`
- `claro-data/prod/database`
- `claro-data/prod/bedrock-config`
- `claro-data/prod/cognito`

## Criterio de cierre CLARO-001
- Ningun secreto real en repositorio.
- Todas las credenciales rotadas y validadas.
- Lectura de secretos operativa en runtime.
