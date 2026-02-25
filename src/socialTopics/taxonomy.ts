export const SOCIAL_TOPIC_TAXONOMY_KIND = "social_topic";
export const SOCIAL_TOPIC_TAXONOMY_VERSION = "social-topics-v1";

export type SocialTopicDefinition = {
  key: string;
  label: string;
  description: string;
  sortOrder: number;
};

export const SOCIAL_TOPIC_TAXONOMY_V1: SocialTopicDefinition[] = [
  { key: "prepago", label: "Prepago", description: "Oferta y comunicaciones de lineas prepago.", sortOrder: 10 },
  { key: "pospago", label: "Pospago", description: "Oferta y comunicaciones de lineas pospago.", sortOrder: 20 },
  {
    key: "hogares",
    label: "Hogares",
    description: "Servicios residenciales de conectividad y entretenimiento.",
    sortOrder: 30
  },
  {
    key: "tripleplay",
    label: "Tripleplay",
    description: "Paquetes convergentes hogar (internet, tv y voz).",
    sortOrder: 40
  },
  {
    key: "claro_musica_app",
    label: "Claro musica app",
    description: "Contenido relacionado con la app Claro musica.",
    sortOrder: 50
  },
  {
    key: "claro_music_venue_eventos",
    label: "Claro music venue y eventos",
    description: "Eventos, conciertos y venue Claro music.",
    sortOrder: 60
  },
  {
    key: "claro_empresas",
    label: "Claro empresas",
    description: "Soluciones y servicios para segmento corporativo.",
    sortOrder: 70
  },
  { key: "claro_video", label: "Claro video", description: "Comunicaciones sobre Claro video.", sortOrder: 80 },
  {
    key: "promociones_beneficios",
    label: "Promociones y beneficios",
    description: "Promos, descuentos, beneficios y planes destacados.",
    sortOrder: 90
  },
  { key: "recargas", label: "Recargas", description: "Mensajes de recargas y saldos.", sortOrder: 100 },
  {
    key: "streaming_bundles",
    label: "Bundles streaming",
    description: "Bundles y alianzas con plataformas OTT.",
    sortOrder: 110
  },
  {
    key: "servicio_soporte",
    label: "Servicio y soporte",
    description: "Atencion al cliente, soporte y resolucion.",
    sortOrder: 120
  },
  {
    key: "cobertura_conectividad",
    label: "Cobertura y conectividad",
    description: "Cobertura de red, calidad y conectividad.",
    sortOrder: 130
  },
  {
    key: "gaming_esports",
    label: "Gaming y esports",
    description: "Videojuegos, esports y experiencias gamer.",
    sortOrder: 140
  },
  {
    key: "sostenibilidad_impacto_social",
    label: "Sostenibilidad e impacto social",
    description: "Iniciativas de sostenibilidad e impacto.",
    sortOrder: 150
  },
  {
    key: "tema_musica_general",
    label: "Musica general",
    description: "Contenido musical general sin precision app/venue.",
    sortOrder: 160
  },
  {
    key: "tema_humor_social",
    label: "Humor social",
    description: "Piezas de humor y entretenimiento social.",
    sortOrder: 170
  },
  {
    key: "tema_navidad_campana",
    label: "Navidad campana",
    description: "Campanas estacionales de navidad.",
    sortOrder: 180
  },
  {
    key: "tema_tecnologia_innovacion",
    label: "Tecnologia e innovacion",
    description: "Innovacion, tecnologia y lanzamientos.",
    sortOrder: 190
  },
  {
    key: "tema_copa_claro",
    label: "Copa Claro",
    description: "Contenido deportivo de Copa Claro.",
    sortOrder: 200
  },
  {
    key: "tema_conexion_marca",
    label: "Conexion marca",
    description: "Mensajes de conexion emocional con la marca.",
    sortOrder: 210
  },
  {
    key: "tema_futuro_talento",
    label: "Futuro y talento",
    description: "Iniciativas de formacion, talento y futuro.",
    sortOrder: 220
  },
  {
    key: "tema_experiencia_cliente",
    label: "Experiencia cliente",
    description: "Mensajes de experiencia del cliente.",
    sortOrder: 230
  },
  {
    key: "tema_conciertos",
    label: "Conciertos",
    description: "Contenido de conciertos sin marca de venue explicita.",
    sortOrder: 240
  }
];

export const SOCIAL_TOPIC_KEY_SET = new Set(SOCIAL_TOPIC_TAXONOMY_V1.map((item) => item.key));
export const SOCIAL_TOPIC_KEYS = SOCIAL_TOPIC_TAXONOMY_V1.map((item) => item.key);

export const CLARO_MUSICA_APP_TOPIC = "claro_musica_app";
export const CLARO_MUSIC_VENUE_TOPIC = "claro_music_venue_eventos";
