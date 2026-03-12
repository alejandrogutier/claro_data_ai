# Prompt: Social Comment Sentiment v1

## Objetivo
Clasificar comentarios de usuarios en posts de redes sociales de Claro Colombia (principal operador de telecomunicaciones del país). Debes analizar el comentario en el contexto del post al que responde.

## Análisis requerido

### 1. Sentimiento (hacia Claro Colombia)
Evalúa el sentimiento del comentario HACIA CLARO:
- "positivo" — El comentario expresa satisfacción, agradecimiento, apoyo, recomendación de Claro o sus servicios
- "negativo" — El comentario expresa queja, insatisfacción, reclamo, crítica hacia Claro, sus servicios, precios, cobertura o atención
- "neutro" — El comentario es informativo, una pregunta sin carga emocional, o no afecta la percepción de marca

### 2. Relación con el post (relatedToPostText)
Determina si el comentario responde, reacciona o se relaciona temáticamente con el contenido del post:
- true — El comentario habla sobre el mismo tema del post, responde a lo que el post comunica, reacciona al contenido del post, o hace referencia directa/indirecta al mensaje del post
- false — El comentario es off-topic, spam, publicidad no relacionada, o no guarda relación con lo que el post comunica (ej: alguien se queja de cobertura en un post sobre música)

### 3. Detección de spam (isSpam)
- true — El comentario es spam, publicidad no relacionada con Claro, contenido de bots, cadenas, contenido repetitivo irrelevante, links sospechosos
- false — El comentario es genuino (puede ser positivo, negativo o neutro pero es auténtico)

### 4. Categoría del comentario
Asigna exactamente UNA de estas categorías:
- "queja" — Reclamo sobre servicio, cobertura, facturación, velocidad, atención al cliente, fallas técnicas, problemas con equipos
- "consulta" — Pregunta sobre planes, precios, disponibilidad, cómo hacer algo, información de producto, horarios, requisitos
- "elogio" — Comentario positivo, agradecimiento, reconocimiento al servicio, la marca o una experiencia positiva
- "experiencia" — El usuario comparte su experiencia personal como cliente de Claro (puede ser positiva, negativa o neutra)
- "sugerencia" — Propuesta de mejora, feature request, idea para el servicio, feedback constructivo
- "interaccion_social" — Emojis, tags a amigos, comentarios sociales sin valor informativo (risas, "yo quiero", "qué genial", reacciones simples)
- "spam" — Publicidad, bots, cadenas, contenido completamente irrelevante, links sospechosos
- "otro" — No encaja en ninguna categoría anterior

### 5. Confianza
Valor entre 0.0 y 1.0:
- 0.9-1.0: Clasificación clara e inequívoca
- 0.7-0.89: Clasificación probable pero con alguna ambigüedad
- 0.5-0.69: Comentario corto o ambiguo, clasificación incierta
- <0.5: Muy poco texto o contenido incomprensible

## Reglas
- Responde SOLO con JSON válido, sin markdown ni texto adicional.
- Si el comentario es muy corto (1-2 palabras, emojis), usar categoría "interaccion_social", sentimiento "neutro" y confianza baja.
- Un comentario puede ser "negativo" en sentimiento pero "true" en relatedToPostText (ej: queja relacionada al tema del post).
- Si no hay texto de post disponible, evaluar relatedToPostText como true por defecto.

## Output esperado
```json
{
  "sentimiento": "positivo|neutro|negativo",
  "relatedToPostText": true|false,
  "isSpam": true|false,
  "confianza": 0.0,
  "categoria": "string (de las 8 categorías listadas)"
}
```

## Contexto
- canal: {{channel}}
- texto del post original: {{post_text}}
- texto del comentario a clasificar: {{comment_text}}
