# S3 Bucket: claro-dataslayer-dump

Bucket principal de datos crudos para el dashboard de Social Overview.

## Estructura de carpetas

```
claro-dataslayer-dump/
  raw/
    organic/                          ← Dataslayer (automático diario)
      fb/                             ← Facebook
        claro-organicfb-gen-extractor           ← Histórico posts (2024-2025)
        claro-organicfb-historico-extractor      ← Histórico posts con métricas
        post/                         ← Posts diarios (2026+, sin texto)
        comments/                     ← Comentarios de posts (2024-2026)
        page/                         ← Métricas de página diarias
        reels/                        ← Métricas de reels
      ig/                             ← Instagram
        claro-organicig-historial-extractor      ← Histórico posts (2025)
        post/                         ← Posts diarios (2026+, sin texto)
        comments/                     ← Comentarios de posts (2024-2026)
        page/                         ← Métricas de página diarias
        storie/                       ← Stories
      lk/                             ← LinkedIn
        claro-organiclk-historico-extractor      ← Histórico posts (2024-2025)
        comments/                     ← Comentarios (carga manual one-time, 2024)
        page/                         ← Métricas de página diarias
      tiktok/                         ← TikTok
        claro-organictiktok-historico-extractor  ← Histórico posts (2024-2025)
        post/                         ← Posts diarios (2026+, sin texto)
        page/                         ← Métricas de página
      x/                              ← X/Twitter
        claro-organicx-historico-extractor       ← Histórico posts (2025)
        post/                         ← Posts diarios (2026+)
        page/                         ← Métricas de página
        text/                         ← Texto de tweets (cobertura parcial)
    hootsuite/                        ← Hootsuite exports (mensual o mayor frecuencia)
      messages/                       ← Inbox/DM conversations (CSV, RFC 4180)
```

## Frecuencia de actualización

| Fuente | Frecuencia | Formato |
|--------|-----------|---------|
| Dataslayer organic/ | Diario automático | CSV, UTF-8, comma-delimited |
| Hootsuite messages/ | Mensual+ manual | CSV, UTF-8, comma-delimited (RFC 4180, campos multilínea) |

## Notas

- Los archivos de Dataslayer en subcarpetas (`post/`, `comments/`, `page/`, `reels/`, `storie/`) se sobrescriben diariamente con data acumulativa
- Los archivos históricos en la raíz de cada canal (`claro-organic*-historico-extractor`) son cargas únicas que no se actualizan
- El archivo de LK comments (`lk/comments/`) fue una carga manual one-time con encoding Latin-1 y delimiter `;`
- Los archivos nuevos de post (2026+) ya no incluyen texto del post para FB, IG y TikTok
