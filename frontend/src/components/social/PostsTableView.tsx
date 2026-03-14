import React, { useState, useMemo } from "react";
import { Table, Typography, Tag, Image, Flex } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { PostRow } from "./postsTypes";
import { channelColorStyles, channelIcon, toChannelLabel, truncate, formatDate, formatNumber, formatPercent, computeER, erLabel } from "./postsUtils";
import { SentimentTag } from "../shared/SentimentTag";

const { Text, Link } = Typography;

const metricFont = { fontSize: 13, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700 } as const;

type Props = {
  posts: PostRow[];
  onSelectPost: (post: PostRow) => void;
};

/**
 * Smart metric visibility per channel:
 * - TikTok: views (no reach, no impressions)
 * - X / LinkedIn: impressions (no reach)
 * - Facebook / Instagram: reach (no impressions)
 * - Clicks: only where > 0 in the dataset
 * - Saves: only where > 0 in the dataset
 */
const hasMetricForChannel = (channel: string, metric: "reach" | "impressions" | "views") => {
  if (metric === "views") return channel === "tiktok";
  if (metric === "reach") return channel === "facebook" || channel === "instagram";
  if (metric === "impressions") return channel === "x" || channel === "linkedin";
  return false;
};

const PostsTableView: React.FC<Props> = ({ posts, onSelectPost }) => {
  const [imgErrors, setImgErrors] = useState<Set<string>>(new Set());

  const handleImgError = (postId: string) => {
    setImgErrors((prev) => new Set(prev).add(postId));
  };

  /* Determine which optional columns to show based on actual data */
  const visibleMetrics = useMemo(() => {
    let hasReach = false;
    let hasImpressions = false;
    let hasViews = false;
    let hasClicks = false;
    let hasSaves = false;
    for (const post of posts) {
      if (hasMetricForChannel(post.channel, "reach") && post.reach > 0) hasReach = true;
      if (hasMetricForChannel(post.channel, "impressions") && post.impressions > 0) hasImpressions = true;
      if (hasMetricForChannel(post.channel, "views") && post.views > 0) hasViews = true;
      if (post.clicks > 0) hasClicks = true;
      if (post.saves > 0) hasSaves = true;
    }
    return { hasReach, hasImpressions, hasViews, hasClicks, hasSaves };
  }, [posts]);

  const columns = useMemo<ColumnsType<PostRow>>(() => {
    const cols: ColumnsType<PostRow> = [
      {
        title: "",
        dataIndex: "image_url",
        key: "thumbnail",
        width: 60,
        render: (_: unknown, post: PostRow) => {
          const colors = channelColorStyles[post.channel] ?? channelColorStyles.facebook;
          const hasImage = post.image_url && !imgErrors.has(post.id);
          if (hasImage) {
            return (
              <Image
                src={post.image_url!}
                alt=""
                preview={false}
                width={48}
                height={48}
                style={{ borderRadius: 8, objectFit: "cover", boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}
                loading="lazy"
                onError={() => handleImgError(post.id)}
              />
            );
          }
          return (
            <Flex
              align="center"
              justify="center"
              style={{
                width: 48,
                height: 48,
                borderRadius: 8,
                backgroundColor: colors.bg,
                fontSize: 18,
                boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
              }}
            >
              {channelIcon[post.channel] ?? "?"}
            </Flex>
          );
        },
      },
      {
        title: "Fecha",
        dataIndex: "published_at",
        key: "published_at",
        width: 100,
        render: (val: string | null) => <Text type="secondary" style={{ fontSize: 13 }}>{formatDate(val)}</Text>,
      },
      {
        title: "Canal",
        dataIndex: "channel",
        key: "channel",
        width: 110,
        render: (_: unknown, post: PostRow) => {
          const colors = channelColorStyles[post.channel] ?? channelColorStyles.facebook;
          return (
            <Flex align="center" gap={4}>
              <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", backgroundColor: colors.accent, marginRight: 4 }} />
              <span>{channelIcon[post.channel]}</span>
              <Text style={{ color: colors.text, fontWeight: 500, fontSize: 13 }}>{toChannelLabel(post.channel)}</Text>
            </Flex>
          );
        },
      },
      {
        title: "Cuenta",
        dataIndex: "account_name",
        key: "account_name",
        width: 120,
        render: (val: string) => <Text style={{ fontSize: 13 }}>{val}</Text>,
      },
      {
        title: "Post",
        dataIndex: "title",
        key: "title",
        ellipsis: true,
        render: (_: unknown, post: PostRow) => (
          <div>
            <Flex align="center" gap={6}>
              <Text strong style={{ fontSize: 13 }}>{truncate(post.title, 50)}</Text>
              {post.post_type && <Tag style={{ fontSize: 10, lineHeight: "16px", margin: 0 }}>{post.post_type}</Tag>}
            </Flex>
            <Link
              href={post.post_url}
              target="_blank"
              style={{ padding: "2px 10px", borderRadius: 999, background: "rgba(227, 6, 19, 0.06)", color: "#b91c1c", fontWeight: 600, fontSize: 11, display: "inline-block" }}
              onClick={(e) => e.stopPropagation()}
            >
              Ver post
            </Link>
          </div>
        ),
      },
      {
        title: "Sentimiento",
        dataIndex: "sentiment",
        key: "sentiment",
        width: 110,
        render: (sentiment: string) => <SentimentTag sentiment={sentiment} />,
      },
    ];

    /* ── Exposure: show the correct metric per channel ── */
    if (visibleMetrics.hasReach) {
      cols.push({
        title: "Reach",
        key: "reach",
        width: 90,
        render: (_: unknown, post: PostRow) => {
          if (!hasMetricForChannel(post.channel, "reach")) return <Text type="secondary" style={{ fontSize: 12 }}>—</Text>;
          return <Text strong style={metricFont}>{formatNumber(post.reach)}</Text>;
        },
      });
    }

    if (visibleMetrics.hasImpressions) {
      cols.push({
        title: "Impresiones",
        key: "impressions",
        width: 100,
        render: (_: unknown, post: PostRow) => {
          if (!hasMetricForChannel(post.channel, "impressions")) return <Text type="secondary" style={{ fontSize: 12 }}>—</Text>;
          return <Text strong style={metricFont}>{formatNumber(post.impressions)}</Text>;
        },
      });
    }

    if (visibleMetrics.hasViews) {
      cols.push({
        title: "Views",
        key: "views",
        width: 90,
        render: (_: unknown, post: PostRow) => {
          if (!hasMetricForChannel(post.channel, "views")) return <Text type="secondary" style={{ fontSize: 12 }}>—</Text>;
          return <Text strong style={metricFont}>{formatNumber(post.views)}</Text>;
        },
      });
    }

    /* ── Engagement (always shown) ── */
    cols.push({
      title: "Engagement",
      dataIndex: "engagement_total",
      key: "engagement_total",
      width: 100,
      render: (val: number) => <Text strong style={metricFont}>{formatNumber(val)}</Text>,
    });

    /* ── ER Global (smart per channel) ── */
    cols.push({
      title: "ER",
      key: "er",
      width: 80,
      render: (_: unknown, post: PostRow) => {
        const er = computeER(post);
        const erColor = er > 3 ? "#177a3f" : er < 1 ? "#94a3b8" : undefined;
        return (
          <div>
            <Text strong style={{ ...metricFont, color: erColor }}>{formatPercent(er)}</Text>
            <Text type="secondary" style={{ fontSize: 9, display: "block", lineHeight: 1, marginTop: 1 }}>{erLabel(post)}</Text>
          </div>
        );
      },
    });

    /* ── Likes ── */
    cols.push({
      title: "Likes",
      key: "likes",
      width: 80,
      render: (_: unknown, post: PostRow) => <Text strong style={metricFont}>{formatNumber(post.likes)}</Text>,
    });

    /* ── Comentarios ── */
    cols.push({
      title: "Comentarios",
      key: "comments",
      width: 110,
      render: (_: unknown, post: PostRow) => (
        <div>
          <Text strong style={metricFont}>{formatNumber(post.comments)}</Text>
          {post.awario_comments_count > 0 && (
            <Text type="secondary" style={{ fontSize: 10, marginLeft: 4 }}>
              ({formatNumber(post.awario_comments_count)} capt.)
            </Text>
          )}
        </div>
      ),
    });

    /* ── Shares ── */
    cols.push({
      title: "Shares",
      key: "shares",
      width: 80,
      render: (_: unknown, post: PostRow) => <Text strong style={metricFont}>{formatNumber(post.shares)}</Text>,
    });

    /* ── Clicks (only if any posts have clicks) ── */
    if (visibleMetrics.hasClicks) {
      cols.push({
        title: "Clicks",
        key: "clicks",
        width: 80,
        render: (_: unknown, post: PostRow) => <Text strong style={metricFont}>{formatNumber(post.clicks)}</Text>,
      });
    }

    /* ── Saves (only if any posts have saves) ── */
    if (visibleMetrics.hasSaves) {
      cols.push({
        title: "Saves",
        key: "saves",
        width: 80,
        render: (_: unknown, post: PostRow) => <Text strong style={metricFont}>{formatNumber(post.saves)}</Text>,
      });
    }

    return cols;
  }, [imgErrors, visibleMetrics]);

  /* Dynamic scroll width based on visible columns */
  const scrollX = useMemo(() => {
    let base = 900; // thumbnail + fecha + canal + cuenta + post + sentimiento + engagement + er + likes + comments + shares
    if (visibleMetrics.hasReach) base += 90;
    if (visibleMetrics.hasImpressions) base += 100;
    if (visibleMetrics.hasViews) base += 90;
    if (visibleMetrics.hasClicks) base += 80;
    if (visibleMetrics.hasSaves) base += 80;
    return base;
  }, [visibleMetrics]);

  return (
    <Table<PostRow>
      columns={columns}
      dataSource={posts}
      rowKey="id"
      pagination={false}
      size="small"
      scroll={{ x: scrollX }}
      onRow={(post) => ({
        onClick: () => onSelectPost(post),
        style: { cursor: "pointer" },
      })}
    />
  );
};

export default PostsTableView;
