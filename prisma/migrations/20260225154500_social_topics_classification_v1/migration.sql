-- CreateTable
CREATE TABLE "public"."SocialPostTopicClassification" (
    "id" UUID NOT NULL,
    "contentItemId" UUID NOT NULL,
    "socialPostMetricId" UUID NOT NULL,
    "taxonomyVersion" TEXT NOT NULL DEFAULT 'social-topics-v1',
    "promptVersion" TEXT NOT NULL DEFAULT 'social-topics-v1',
    "modelId" TEXT NOT NULL,
    "overallConfidence" DECIMAL(4,3),
    "needsReview" BOOLEAN NOT NULL DEFAULT false,
    "ambiguousDualContext" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SocialPostTopicClassification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SocialPostTopicAssignment" (
    "id" UUID NOT NULL,
    "classificationId" UUID NOT NULL,
    "taxonomyEntryId" UUID NOT NULL,
    "rank" INTEGER NOT NULL,
    "confidence" DECIMAL(4,3) NOT NULL,
    "evidence" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SocialPostTopicAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SocialPostTopicClassification_contentItemId_taxonomyVersion_promptVersion_modelId_key"
ON "public"."SocialPostTopicClassification"("contentItemId", "taxonomyVersion", "promptVersion", "modelId");

-- CreateIndex
CREATE INDEX "SocialPostTopicClassification_socialPostMetricId_updatedAt_idx"
ON "public"."SocialPostTopicClassification"("socialPostMetricId", "updatedAt");

-- CreateIndex
CREATE INDEX "SocialPostTopicClassification_needsReview_updatedAt_idx"
ON "public"."SocialPostTopicClassification"("needsReview", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SocialPostTopicAssignment_classificationId_taxonomyEntryId_key"
ON "public"."SocialPostTopicAssignment"("classificationId", "taxonomyEntryId");

-- CreateIndex
CREATE INDEX "SocialPostTopicAssignment_taxonomyEntryId_createdAt_idx"
ON "public"."SocialPostTopicAssignment"("taxonomyEntryId", "createdAt");

-- CreateIndex
CREATE INDEX "SocialPostTopicAssignment_classificationId_rank_idx"
ON "public"."SocialPostTopicAssignment"("classificationId", "rank");

-- AddForeignKey
ALTER TABLE "public"."SocialPostTopicClassification"
ADD CONSTRAINT "SocialPostTopicClassification_contentItemId_fkey"
FOREIGN KEY ("contentItemId") REFERENCES "public"."ContentItem"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SocialPostTopicClassification"
ADD CONSTRAINT "SocialPostTopicClassification_socialPostMetricId_fkey"
FOREIGN KEY ("socialPostMetricId") REFERENCES "public"."SocialPostMetric"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SocialPostTopicAssignment"
ADD CONSTRAINT "SocialPostTopicAssignment_classificationId_fkey"
FOREIGN KEY ("classificationId") REFERENCES "public"."SocialPostTopicClassification"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SocialPostTopicAssignment"
ADD CONSTRAINT "SocialPostTopicAssignment_taxonomyEntryId_fkey"
FOREIGN KEY ("taxonomyEntryId") REFERENCES "public"."TaxonomyEntry"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed taxonomy kind='social_topic' (v1 curated)
INSERT INTO "public"."TaxonomyEntry"
  ("id", "kind", "key", "label", "description", "isActive", "sortOrder", "metadata", "createdAt", "updatedAt")
VALUES
  (CAST('a0e292c4-2192-4b05-a6cc-48bca09b3669' AS UUID), 'social_topic', 'prepago', 'Prepago', 'Oferta y comunicaciones de líneas prepago.', true, 10, CAST('{"taxonomy_version":"social-topics-v1","seed":"migration"}' AS JSONB), NOW(), NOW()),
  (CAST('597e320a-c9c9-43b5-a694-ccefd3a3ab12' AS UUID), 'social_topic', 'pospago', 'Pospago', 'Oferta y comunicaciones de líneas pospago.', true, 20, CAST('{"taxonomy_version":"social-topics-v1","seed":"migration"}' AS JSONB), NOW(), NOW()),
  (CAST('310f4414-f5bf-4aea-bb3a-ad74f869458a' AS UUID), 'social_topic', 'hogares', 'Hogares', 'Servicios residenciales de conectividad y entretenimiento.', true, 30, CAST('{"taxonomy_version":"social-topics-v1","seed":"migration"}' AS JSONB), NOW(), NOW()),
  (CAST('7f25b08c-34ff-4207-bbd4-3b64bc760464' AS UUID), 'social_topic', 'tripleplay', 'Tripleplay', 'Paquetes convergentes hogar (internet, tv y voz).', true, 40, CAST('{"taxonomy_version":"social-topics-v1","seed":"migration"}' AS JSONB), NOW(), NOW()),
  (CAST('7d561490-852d-4150-90a8-1eeb9464f7eb' AS UUID), 'social_topic', 'claro_musica_app', 'Claro música app', 'Contenido relacionado con la app Claro música.', true, 50, CAST('{"taxonomy_version":"social-topics-v1","seed":"migration"}' AS JSONB), NOW(), NOW()),
  (CAST('6bcd834d-3b37-405d-8d9c-94d02862b578' AS UUID), 'social_topic', 'claro_music_venue_eventos', 'Claro music venue y eventos', 'Eventos, conciertos y venue Claro music.', true, 60, CAST('{"taxonomy_version":"social-topics-v1","seed":"migration"}' AS JSONB), NOW(), NOW()),
  (CAST('3f24c4af-01a6-4a42-9a94-506d85591977' AS UUID), 'social_topic', 'claro_empresas', 'Claro empresas', 'Soluciones y servicios para segmento corporativo.', true, 70, CAST('{"taxonomy_version":"social-topics-v1","seed":"migration"}' AS JSONB), NOW(), NOW()),
  (CAST('354c9ec0-e614-468c-aaab-eddefe75d09d' AS UUID), 'social_topic', 'claro_video', 'Claro video', 'Comunicaciones sobre Claro video.', true, 80, CAST('{"taxonomy_version":"social-topics-v1","seed":"migration"}' AS JSONB), NOW(), NOW()),
  (CAST('dd84ae73-b378-45cc-a629-4f2ab0da1a21' AS UUID), 'social_topic', 'promociones_beneficios', 'Promociones y beneficios', 'Promos, descuentos, beneficios y planes destacados.', true, 90, CAST('{"taxonomy_version":"social-topics-v1","seed":"migration"}' AS JSONB), NOW(), NOW()),
  (CAST('90ecece9-bda5-4906-abcf-2fdd8af4a289' AS UUID), 'social_topic', 'recargas', 'Recargas', 'Mensajes de recargas y saldos.', true, 100, CAST('{"taxonomy_version":"social-topics-v1","seed":"migration"}' AS JSONB), NOW(), NOW()),
  (CAST('ac1e3c6a-c3b3-425e-b552-c23798852609' AS UUID), 'social_topic', 'streaming_bundles', 'Bundles streaming', 'Bundles y alianzas con plataformas OTT.', true, 110, CAST('{"taxonomy_version":"social-topics-v1","seed":"migration"}' AS JSONB), NOW(), NOW()),
  (CAST('12f8e56e-b08e-4c42-a729-38db38f395d5' AS UUID), 'social_topic', 'servicio_soporte', 'Servicio y soporte', 'Atención al cliente, soporte y resolución.', true, 120, CAST('{"taxonomy_version":"social-topics-v1","seed":"migration"}' AS JSONB), NOW(), NOW()),
  (CAST('2c7518f5-96d4-41bc-bce9-02e3e92bb6bb' AS UUID), 'social_topic', 'cobertura_conectividad', 'Cobertura y conectividad', 'Cobertura de red, calidad y conectividad.', true, 130, CAST('{"taxonomy_version":"social-topics-v1","seed":"migration"}' AS JSONB), NOW(), NOW()),
  (CAST('18eeb548-59d9-4e39-9c18-b0eafa827503' AS UUID), 'social_topic', 'gaming_esports', 'Gaming y esports', 'Videojuegos, esports y experiencias gamer.', true, 140, CAST('{"taxonomy_version":"social-topics-v1","seed":"migration"}' AS JSONB), NOW(), NOW()),
  (CAST('39a978a4-193f-4d59-8cdc-8a46ca0ebb92' AS UUID), 'social_topic', 'sostenibilidad_impacto_social', 'Sostenibilidad e impacto social', 'Iniciativas de sostenibilidad e impacto.', true, 150, CAST('{"taxonomy_version":"social-topics-v1","seed":"migration"}' AS JSONB), NOW(), NOW()),
  (CAST('f9f13c51-737a-47ee-ab80-25fb358d381f' AS UUID), 'social_topic', 'tema_musica_general', 'Música general', 'Contenido musical general sin precisión app/venue.', true, 160, CAST('{"taxonomy_version":"social-topics-v1","seed":"migration"}' AS JSONB), NOW(), NOW()),
  (CAST('2e11c2f8-4015-40ca-8565-4f01084d78e0' AS UUID), 'social_topic', 'tema_humor_social', 'Humor social', 'Piezas de humor y entretenimiento social.', true, 170, CAST('{"taxonomy_version":"social-topics-v1","seed":"migration"}' AS JSONB), NOW(), NOW()),
  (CAST('5ad7ab12-4317-442a-a4a3-8153eb1c5d13' AS UUID), 'social_topic', 'tema_navidad_campana', 'Navidad campaña', 'Campañas estacionales de navidad.', true, 180, CAST('{"taxonomy_version":"social-topics-v1","seed":"migration"}' AS JSONB), NOW(), NOW()),
  (CAST('f90f6c88-45ec-4611-9676-217b952a3ef0' AS UUID), 'social_topic', 'tema_tecnologia_innovacion', 'Tecnología e innovación', 'Innovación, tecnología y lanzamientos.', true, 190, CAST('{"taxonomy_version":"social-topics-v1","seed":"migration"}' AS JSONB), NOW(), NOW()),
  (CAST('77381881-946e-4790-9a38-40a194796c50' AS UUID), 'social_topic', 'tema_copa_claro', 'Copa Claro', 'Contenido deportivo de Copa Claro.', true, 200, CAST('{"taxonomy_version":"social-topics-v1","seed":"migration"}' AS JSONB), NOW(), NOW()),
  (CAST('dd0878fc-074c-4eab-a2bd-fab51dd95a3b' AS UUID), 'social_topic', 'tema_conexion_marca', 'Conexión marca', 'Mensajes de conexión emocional con la marca.', true, 210, CAST('{"taxonomy_version":"social-topics-v1","seed":"migration"}' AS JSONB), NOW(), NOW()),
  (CAST('5c22abbd-f3f1-4e80-aa97-caf5897dee13' AS UUID), 'social_topic', 'tema_futuro_talento', 'Futuro y talento', 'Iniciativas de formación, talento y futuro.', true, 220, CAST('{"taxonomy_version":"social-topics-v1","seed":"migration"}' AS JSONB), NOW(), NOW()),
  (CAST('74627a00-784b-4a6a-afbf-4dc3f3ec324e' AS UUID), 'social_topic', 'tema_experiencia_cliente', 'Experiencia cliente', 'Mensajes de experiencia del cliente.', true, 230, CAST('{"taxonomy_version":"social-topics-v1","seed":"migration"}' AS JSONB), NOW(), NOW()),
  (CAST('82fff6ea-d304-4708-9d06-147df1537631' AS UUID), 'social_topic', 'tema_conciertos', 'Conciertos', 'Contenido de conciertos sin marca de venue explícita.', true, 240, CAST('{"taxonomy_version":"social-topics-v1","seed":"migration"}' AS JSONB), NOW(), NOW())
ON CONFLICT ("kind", "key") DO UPDATE SET
  "label" = EXCLUDED."label",
  "description" = EXCLUDED."description",
  "isActive" = EXCLUDED."isActive",
  "sortOrder" = EXCLUDED."sortOrder",
  "metadata" = EXCLUDED."metadata",
  "updatedAt" = NOW();
