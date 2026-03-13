import React, { useState } from "react";
import type { PostRow } from "./postsTypes";
import {
  channelColors,
  channelIcon,
  toChannelLabel,
  formatDateTime,
  formatNumber,
  formatPercent,
  formatScore,
  computeER,
  erLabel,
  sentimentPillClass
} from "./postsUtils";
import SentimentBalanceBar from "./SentimentBalanceBar";
import PostDetailComments from "./PostDetailComments";
import type { ApiClient } from "../../api/client";

type Props = {
  post: PostRow;
  onClose: () => void;
  client: ApiClient;
  canOverrideComments: boolean;
  onError: (error: unknown) => void;
};

const PostDetailModal: React.FC<Props> = ({ post, onClose, client, canOverrideComments, onError }) => {
  const [imgError, setImgError] = useState(false);
  const [commentSentimentCounts, setCommentSentimentCounts] = useState<{
    positive: number;
    neutral: number;
    negative: number;
    unknown: number;
  } | null>(null);

  const colors = channelColors[post.channel] ?? channelColors.facebook;
  const er = computeER(post);
  const erLbl = erLabel(post);
  const showReach = post.reach > 0;
  const hasImage = post.image_url && !imgError;

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center p-3 sm:p-6">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/45"
        onClick={onClose}
        aria-label="Cerrar modal"
      />
      <div className="relative z-[71] w-full max-w-5xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        {/* Channel color bar */}
        <div className={`h-1 w-full ${colors.bg}`} style={{ background: `var(--bar-${post.channel}, currentColor)` }}>
          <div className={`h-full ${post.channel === "facebook" ? "bg-blue-500" : post.channel === "instagram" ? "bg-fuchsia-500" : post.channel === "x" ? "bg-slate-800" : post.channel === "linkedin" ? "bg-sky-600" : "bg-pink-500"}`} />
        </div>

        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <div className={`mb-1 flex items-center gap-2 text-sm font-semibold ${colors.text}`}>
              <span className="text-lg">{channelIcon[post.channel] ?? ""}</span>
              <span>{toChannelLabel(post.channel)}</span>
              <span className="text-slate-400">&middot;</span>
              <span className="text-slate-600 font-normal">{post.account_name}</span>
              {post.post_type && <span className="post-type-badge ml-1">{post.post_type}</span>}
              <span className="text-slate-400">&middot;</span>
              <span className="text-slate-400 font-normal text-xs">{formatDateTime(post.published_at)}</span>
            </div>
            <h3
              className="text-lg font-semibold text-slate-900 leading-snug"
              style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
            >
              {post.title}
            </h3>
            <a
              href={post.post_url}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-block text-xs text-red-700 font-semibold hover:underline"
            >
              Ver post original &#x2197;
            </a>
          </div>
          <button
            type="button"
            className="rounded-md border border-slate-200 px-2 py-1 text-sm text-slate-700 hover:bg-slate-50 shrink-0"
            onClick={onClose}
          >
            Cerrar
          </button>
        </div>

        {/* Scrollable content */}
        <div className="max-h-[75vh] overflow-auto">
          {/* Image + Text section */}
          <div className={`px-5 py-4 ${hasImage ? "grid gap-4" : ""}`} style={hasImage ? { gridTemplateColumns: "280px 1fr" } : undefined}>
            {hasImage && (
              <img
                src={post.image_url!}
                alt=""
                className="w-full rounded-xl object-cover"
                style={{ maxHeight: "320px" }}
                loading="lazy"
                onError={() => setImgError(true)}
              />
            )}
            <div>
              {post.text && (
                <p className="text-sm text-slate-700 leading-relaxed mb-3">{post.text}</p>
              )}
              {post.hashtags && post.hashtags.length > 0 && (
                <div className={`text-xs font-medium ${colors.text} mb-3`}>
                  {post.hashtags.map((h) => `#${h}`).join(" ")}
                </div>
              )}
              {!post.text && !hasImage && (
                <p className="text-sm text-slate-400 italic">Sin texto disponible.</p>
              )}
            </div>
          </div>

          {/* Metrics Grid */}
          <div className="border-t border-slate-100 px-5 py-4">
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">M\u00e9tricas</h4>
            <div className="post-detail-metrics-grid">
              <MetricCell label={showReach ? "Reach" : "Impressions"} value={formatNumber(showReach ? post.reach : post.impressions)} />
              <MetricCell label="Engagement" value={formatNumber(post.engagement_total)} />
              <MetricCell label={erLbl} value={formatPercent(er)} />
              <MetricCell label="Likes" value={formatNumber(post.likes)} />
              <MetricCell label="Comentarios" value={formatNumber(post.comments)} sub={post.awario_comments_count > 0 ? `${formatNumber(post.awario_comments_count)} capt.` : undefined} />
              <MetricCell label="Shares" value={formatNumber(post.shares)} />
              <MetricCell label="Views" value={formatNumber(post.views)} />
              <MetricCell label="Impressions" value={formatNumber(post.impressions)} />
              <MetricCell label="Clicks" value={formatNumber(post.clicks)} />
              <MetricCell label="Saves" value={formatNumber(post.saves)} />
            </div>
          </div>

          {/* Classification */}
          <div className="border-t border-slate-100 px-5 py-4">
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Clasificaci\u00f3n</h4>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">Sentimiento:</span>
                <span className={sentimentPillClass(post.sentiment)}>{post.sentiment}</span>
              </div>
              {post.sentiment_confidence !== null && (
                <div className="flex items-center gap-1">
                  <span className="text-xs text-slate-500">Confianza:</span>
                  <span className="text-xs font-semibold text-slate-700">{formatScore(post.sentiment_confidence)}</span>
                </div>
              )}
              <div className="flex items-center gap-1">
                <span className="text-xs text-slate-500">Source:</span>
                <span className="text-xs font-semibold text-slate-700">{formatScore(post.source_score)}</span>
              </div>
            </div>

            {post.campaign && (
              <div className="mt-2 text-xs text-slate-600">
                <span className="text-slate-500">Campa\u00f1a:</span>{" "}
                <strong className="text-slate-800">{post.campaign}</strong>
              </div>
            )}

            {post.strategies && post.strategies.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                <span className="text-xs text-slate-500 mr-1">Estrategias:</span>
                {post.strategies.map((s) => (
                  <span key={s} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                    {s}
                  </span>
                ))}
              </div>
            )}

            {post.topics && post.topics.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                <span className="text-xs text-slate-500 mr-1">Topics:</span>
                {post.topics.map((t) => (
                  <span key={t.key} className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700">
                    {t.label}
                    <span className="ml-1 text-[9px] text-sky-400">{formatScore(t.confidence)}</span>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Sentiment Balance (from comments) */}
          {commentSentimentCounts && (commentSentimentCounts.positive + commentSentimentCounts.neutral + commentSentimentCounts.negative + commentSentimentCounts.unknown) > 0 && (
            <div className="border-t border-slate-100 px-5 py-4">
              <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Balance de sentimiento (comentarios)</h4>
              <SentimentBalanceBar {...commentSentimentCounts} />
            </div>
          )}

          {/* Comments section */}
          {post.awario_comments_count > 0 && (
            <div className="border-t border-slate-100 px-5 py-4">
              <PostDetailComments
                post={post}
                client={client}
                canOverride={canOverrideComments}
                onError={onError}
                onSentimentCounts={setCommentSentimentCounts}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ── Mini metric cell ──────────────────────────────────────
const MetricCell: React.FC<{ label: string; value: string; sub?: string }> = ({ label, value, sub }) => (
  <div className="text-center">
    <div className="kpi-value text-base">{value}</div>
    <div className="kpi-caption">{label}</div>
    {sub && <div className="text-[10px] text-slate-400">{sub}</div>}
  </div>
);

export default PostDetailModal;
