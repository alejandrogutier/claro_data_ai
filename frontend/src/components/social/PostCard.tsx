import React, { useState } from "react";
import type { PostRow } from "./postsTypes";
import { channelColors, channelIcon, toChannelLabel, truncate, formatShortDate, formatCompact, formatPercent, computeER, erLabel, sentimentPillClass } from "./postsUtils";
import SentimentBalanceBar from "./SentimentBalanceBar";

type Props = {
  post: PostRow;
  onSelect: (post: PostRow) => void;
  sentimentCounts?: { positive: number; neutral: number; negative: number; unknown: number } | null;
};

const PostCard: React.FC<Props> = ({ post, onSelect, sentimentCounts }) => {
  const [imgError, setImgError] = useState(false);
  const colors = channelColors[post.channel] ?? channelColors.facebook;
  const er = computeER(post);
  const erLbl = erLabel(post);

  return (
    <div
      className={`social-post-card border-l-4 ${colors.accent}`}
      onClick={() => onSelect(post)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onSelect(post); }}
    >
      {/* Header */}
      <div className="mb-2 flex items-center justify-between text-xs">
        <div className={`flex items-center gap-1.5 font-semibold ${colors.text}`}>
          <span className="text-base">{channelIcon[post.channel] ?? ""}</span>
          <span>{toChannelLabel(post.channel)}</span>
          <span className="text-slate-400">&middot;</span>
          <span className="text-slate-600 font-normal">{post.account_name}</span>
          {post.post_type && (
            <span className="post-type-badge ml-1">{post.post_type}</span>
          )}
        </div>
        <span className="text-slate-400">{formatShortDate(post.published_at)}</span>
      </div>

      {/* Image or Placeholder */}
      {post.image_url && !imgError ? (
        <img
          src={post.image_url}
          alt=""
          className="mb-3 w-full rounded-lg object-cover"
          style={{ aspectRatio: "16/9", maxHeight: "176px" }}
          loading="lazy"
          onError={() => setImgError(true)}
        />
      ) : (
        <div
          className={`mb-3 w-full rounded-lg flex items-center justify-center ${colors.bg}`}
          style={{ aspectRatio: "16/9", maxHeight: "176px" }}
        >
          <span className="text-5xl opacity-30">{channelIcon[post.channel] ?? "?"}</span>
        </div>
      )}

      {/* Title */}
      <h4
        className="mb-1 font-semibold text-slate-900 leading-snug"
        style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: "1.05rem", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}
      >
        {post.title}
      </h4>

      {/* Text preview */}
      {post.text && (
        <p
          className="mb-2 text-sm text-slate-500 leading-relaxed"
          style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}
        >
          {post.text}
        </p>
      )}

      {/* Hashtags */}
      {post.hashtags && post.hashtags.length > 0 && (
        <div className={`mb-2 text-xs ${colors.text} font-medium`}>
          {post.hashtags.slice(0, 5).map((h) => `#${h}`).join(" ")}
          {post.hashtags.length > 5 && <span className="text-slate-400"> +{post.hashtags.length - 5}</span>}
        </div>
      )}

      {/* Sentiment + Balance Bar */}
      <div className="mb-3 flex items-center gap-2">
        <span className={sentimentPillClass(post.sentiment)}>{post.sentiment}</span>
        {sentimentCounts && (sentimentCounts.positive + sentimentCounts.neutral + sentimentCounts.negative + sentimentCounts.unknown) > 0 ? (
          <div className="flex-1">
            <SentimentBalanceBar {...sentimentCounts} compact />
          </div>
        ) : post.awario_comments_count > 0 ? (
          <span className="text-[10px] text-slate-400 italic">Balance al abrir detalle</span>
        ) : null}
      </div>

      {/* Mini-KPIs */}
      <div className="post-card-kpi-grid mb-2">
        <div>
          <div className="post-card-kpi-value">{formatCompact(post.reach > 0 ? post.reach : post.impressions)}</div>
          <div className="post-card-kpi-label">{post.reach > 0 ? "Reach" : "Impr"}</div>
        </div>
        <div>
          <div className="post-card-kpi-value">{formatCompact(post.engagement_total)}</div>
          <div className="post-card-kpi-label">Eng</div>
        </div>
        <div>
          <div className="post-card-kpi-value">{formatPercent(er)}</div>
          <div className="post-card-kpi-label">{erLbl}</div>
        </div>
        <div>
          <div className="post-card-kpi-value">{formatCompact(post.comments)}</div>
          <div className="post-card-kpi-label">Comms</div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>
          {post.campaign ? `${truncate(post.campaign, 20)}` : ""}
          {post.topics && post.topics.length > 0 ? `${post.campaign ? " \u00b7 " : ""}${post.topics.length} topic${post.topics.length > 1 ? "s" : ""}` : ""}
        </span>
        <a
          href={post.post_url}
          target="_blank"
          rel="noreferrer"
          className="text-red-700 font-semibold hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          Ver post \u2197
        </a>
      </div>
    </div>
  );
};

export default PostCard;
