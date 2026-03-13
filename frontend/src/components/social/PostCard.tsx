import React, { useState } from "react";
import { Card, Tag, Typography, Flex, Image, Space, Statistic } from "antd";
import type { PostRow } from "./postsTypes";
import { channelColorStyles, channelIcon, toChannelLabel, truncate, formatShortDate, formatCompact, formatPercent, computeER, erLabel } from "./postsUtils";
import { SentimentTag } from "../shared/SentimentTag";
import SentimentBalanceBar from "./SentimentBalanceBar";
import { CLARO_SHADOWS } from "../../theme/claroTheme";

const { Text, Paragraph, Link } = Typography;

type Props = {
  post: PostRow;
  onSelect: (post: PostRow) => void;
  sentimentCounts?: { positive: number; neutral: number; negative: number; unknown: number } | null;
};

const PostCard: React.FC<Props> = ({ post, onSelect, sentimentCounts }) => {
  const [imgError, setImgError] = useState(false);
  const colors = channelColorStyles[post.channel] ?? channelColorStyles.facebook;
  const er = computeER(post);
  const erLbl = erLabel(post);

  return (
    <Card
      hoverable
      onClick={() => onSelect(post)}
      style={{ boxShadow: CLARO_SHADOWS.card, height: "100%" }}
      styles={{ body: { padding: 16 } }}
    >
      {/* Top accent bar */}
      <div
        style={{
          height: 3,
          background: `linear-gradient(90deg, ${colors.accent}, ${colors.accent}88)`,
          borderRadius: "14px 14px 0 0",
          margin: "-16px -16px 12px -16px",
        }}
      />

      {/* Header */}
      <Flex align="center" justify="space-between" style={{ marginBottom: 8, fontSize: 12 }}>
        <Flex align="center" gap={6}>
          <span style={{ fontSize: 16 }}>{channelIcon[post.channel] ?? ""}</span>
          <Text strong style={{ color: colors.text, fontSize: 12 }}>{toChannelLabel(post.channel)}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>&middot;</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>{post.account_name}</Text>
          {post.post_type && (
            <Tag style={{ fontSize: 10, lineHeight: "16px", margin: 0 }}>{post.post_type}</Tag>
          )}
        </Flex>
        <Text type="secondary" style={{ fontSize: 12 }}>{formatShortDate(post.published_at)}</Text>
      </Flex>

      {/* Image or Placeholder */}
      {post.image_url && !imgError ? (
        <Image
          src={post.image_url}
          alt=""
          preview={false}
          style={{ width: "100%", aspectRatio: "16/9", maxHeight: 176, objectFit: "cover", borderRadius: 8, marginBottom: 12 }}
          loading="lazy"
          onError={() => setImgError(true)}
        />
      ) : (
        <Flex
          align="center"
          justify="center"
          style={{
            width: "100%",
            aspectRatio: "16/9",
            maxHeight: 176,
            borderRadius: 8,
            marginBottom: 12,
            backgroundColor: colors.bg,
          }}
        >
          <span style={{ fontSize: 48, opacity: 0.3 }}>{channelIcon[post.channel] ?? "?"}</span>
        </Flex>
      )}

      {/* Title */}
      <Paragraph
        strong
        ellipsis={{ rows: 2 }}
        style={{
          marginBottom: 4,
          fontFamily: "'Barlow Condensed', sans-serif",
          fontSize: "1.05rem",
          lineHeight: 1.4,
        }}
      >
        {post.title}
      </Paragraph>

      {/* Text preview */}
      {post.text && (
        <Paragraph
          type="secondary"
          ellipsis={{ rows: 2 }}
          style={{ marginBottom: 8, fontSize: 14, lineHeight: 1.6 }}
        >
          {post.text}
        </Paragraph>
      )}

      {/* Hashtags */}
      {post.hashtags && post.hashtags.length > 0 && (
        <div style={{ marginBottom: 8, fontSize: 12, fontWeight: 500, color: colors.text }}>
          {post.hashtags.slice(0, 5).map((h) => `#${h}`).join(" ")}
          {post.hashtags.length > 5 && <Text type="secondary"> +{post.hashtags.length - 5}</Text>}
        </div>
      )}

      {/* Sentiment + Balance Bar */}
      <Flex align="center" gap={8} style={{ marginBottom: 12 }}>
        <SentimentTag sentiment={post.sentiment} />
        {sentimentCounts && (sentimentCounts.positive + sentimentCounts.neutral + sentimentCounts.negative + sentimentCounts.unknown) > 0 ? (
          <div style={{ flex: 1 }}>
            <SentimentBalanceBar {...sentimentCounts} compact />
          </div>
        ) : post.awario_comments_count > 0 ? (
          <Text type="secondary" italic style={{ fontSize: 10 }}>Balance al abrir detalle</Text>
        ) : null}
      </Flex>

      {/* Mini-KPIs */}
      <Flex justify="space-between" style={{ borderTop: "1px solid #f0f2f5", paddingTop: 10, marginTop: 8 }}>
        <Statistic
          title={post.reach > 0 ? "Reach" : "Impr"}
          value={formatCompact(post.reach > 0 ? post.reach : post.impressions)}
          valueStyle={{ fontSize: 14, fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif" }}
          style={{ textAlign: "center", flex: 1 }}
        />
        <Statistic
          title="Eng"
          value={formatCompact(post.engagement_total)}
          valueStyle={{ fontSize: 14, fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif" }}
          style={{ textAlign: "center", flex: 1 }}
        />
        <Statistic
          title={erLbl}
          value={formatPercent(er)}
          valueStyle={{ fontSize: 14, fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif" }}
          style={{ textAlign: "center", flex: 1 }}
        />
        <Statistic
          title="Comms"
          value={formatCompact(post.comments)}
          valueStyle={{ fontSize: 14, fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif" }}
          style={{ textAlign: "center", flex: 1 }}
        />
      </Flex>

      {/* Footer */}
      <Flex align="center" justify="space-between" style={{ fontSize: 12 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          {post.campaign ? `${truncate(post.campaign, 20)}` : ""}
          {post.topics && post.topics.length > 0 ? `${post.campaign ? " \u00b7 " : ""}${post.topics.length} topic${post.topics.length > 1 ? "s" : ""}` : ""}
        </Text>
        <Link
          href={post.post_url}
          target="_blank"
          style={{
            padding: "2px 10px",
            borderRadius: 999,
            background: "rgba(227, 6, 19, 0.06)",
            color: "#b91c1c",
            fontWeight: 600,
            fontSize: 11,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          Ver post &#x2197;
        </Link>
      </Flex>
    </Card>
  );
};

export default PostCard;
