# Security Secrets Checklist (CLARO-001)

## Objetivo
Remediar exposicion de secretos actuales y establecer manejo seguro en AWS.
Nota de alcance actual: **no se rotan llaves por decision operativa**, se migran a Secrets Manager como variables seguras.

## Checklist
- [ ] Inventariar todas las llaves/API keys activas.
- [x] Crear secretos en AWS Secrets Manager (`claro-data-prod/*`).
- [x] Cargar credenciales actuales en Secrets Manager como variables seguras.
- [ ] Actualizar Lambdas para leer secretos desde Secrets Manager.
- [ ] Validar que logs no expongan secretos.
- [ ] Confirmar `.env` fuera de versionado y usar `.env.example`.

## Secretos recomendados
- `claro-data-prod/provider-api-keys`
- `claro-data-prod/app-config`
- `claro-data-prod/aws-credentials`

## Criterio de cierre CLARO-001
- Ningun secreto real en repositorio.
- Credenciales actuales cargadas en Secrets Manager como variables seguras.
- Lectura de secretos operativa en runtime (Lambda/API).
