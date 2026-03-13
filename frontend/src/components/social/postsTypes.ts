import type { MonitorSocialPostCommentsResponse, SocialChannel, SocialPostSort } from "../../api/client";

export type PostRow = {
  id: string;
  published_at: string | null;
  channel: SocialChannel;
  account_name: string;
  post_type: string | null;
  title: string;
  post_url: string;
  text?: string | null;
  image_url?: string | null;
  // Core metrics
  exposure: number;
  engagement_total: number;
  likes: number;
  comments: number;
  awario_comments_count: number;
  shares: number;
  views: number;
  // Extended metrics
  impressions: number;
  reach: number;
  clicks: number;
  saves: number;
  // Sentiment
  sentiment: string;
  sentiment_confidence: number | null;
  source_score: number;
  // Classification
  campaign?: string | null;
  strategies?: string[];
  hashtags?: string[];
  topics?: Array<{ key: string; label: string; confidence: number; rank: number }>;
};

export type AwarioCommentRow = MonitorSocialPostCommentsResponse["items"][number];

export type PostsViewMode = "table" | "cards";

export type CommentSentimentFilter = "all" | "positive" | "negative" | "neutral" | "unknown";
export type CommentSpamFilter = "all" | "spam" | "not_spam";
export type CommentRelatedFilter = "all" | "related" | "not_related";

export { type SocialChannel, type SocialPostSort };
