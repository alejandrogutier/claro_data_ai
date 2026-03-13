import React, { useState } from "react";
import { Modal, Typography, Flex, Image, Statistic, Tag, Divider, Row, Col, Space } from "antd";
import type { PostRow } from "./postsTypes";
import {
  channelColorStyles,
  channelIcon,
  toChannelLabel,
  formatDateTime,
  formatNumber,
  formatPercent,
  formatScore,
  computeER,
  erLabel,
} from "./postsUtils";
import { SentimentTag } from "../shared/SentimentTag";
import SentimentBalanceBar from "./SentimentBalanceBar";
import PostDetailComments from "./PostDetailComments";
import type { ApiClient } from "../../api/client";

const { Text, Title, Paragraph, Link } = Typography;

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

  const colors = channelColorStyles[post.channel] ?? channelColorStyles.facebook;
  const er = computeER(post);
  const erLbl = erLabel(post);
  const showReach = post.reach > 0;
  const hasImage = post.image_url && !imgError;

  return (
    <Modal
      open
      onCancel={onClose}
      footer={null}
      width={1024}
      centered
      destroyOnClose
      title={
        <div>
          {/* Channel color bar */}
          <div style={{ height: 6, width: "100%", background: `linear-gradient(90deg, ${colors.accent}, ${colors.accent}60)`, borderRadius: "16px 16px 0 0", margin: "-20px -24px 16px -24px" }} />
          <Flex align="center" gap={8} wrap="wrap">
            <span style={{ fontSize: 18 }}>{channelIcon[post.channel] ?? ""}</span>
            <Text strong style={{ color: colors.text, fontSize: 14 }}>{toChannelLabel(post.channel)}</Text>
            <Text type="secondary">&middot;</Text>
            <Text type="secondary" style={{ fontSize: 14 }}>{post.account_name}</Text>
            {post.post_type && <Tag style={{ fontSize: 10, lineHeight: "16px", margin: 0 }}>{post.post_type}</Tag>}
            <Text type="secondary">&middot;</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>{formatDateTime(post.published_at)}</Text>
          </Flex>
          <Title
            level={4}
            style={{ margin: "4px 0 0", fontFamily: "'Barlow Condensed', sans-serif" }}
          >
            {post.title}
          </Title>
          <Link
            href={post.post_url}
            target="_blank"
            style={{ fontSize: 12, color: "#b91c1c", fontWeight: 600 }}
          >
            Ver post original &#x2197;
          </Link>
        </div>
      }
    >
      {/* Image + Text section */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        {hasImage && (
          <Col span={8}>
            <Image
              src={post.image_url!}
              alt=""
              style={{ width: "100%", maxHeight: 320, objectFit: "cover", borderRadius: 12 }}
              loading="lazy"
              onError={() => setImgError(true)}
            />
          </Col>
        )}
        <Col span={hasImage ? 16 : 24}>
          {post.text && (
            <Paragraph style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 12 }}>
              {post.text}
            </Paragraph>
          )}
          {post.hashtags && post.hashtags.length > 0 && (
            <div style={{ fontSize: 12, fontWeight: 500, color: colors.text, marginBottom: 12 }}>
              {post.hashtags.map((h) => `#${h}`).join(" ")}
            </div>
          )}
          {!post.text && !hasImage && (
            <Text type="secondary" italic>Sin texto disponible.</Text>
          )}
        </Col>
      </Row>

      {/* Metrics Grid */}
      <Divider style={{ margin: "12px 0" }} />
      <Title level={5} type="secondary" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12, borderLeft: "3px solid #e30613", paddingLeft: 8 }}>
        M&eacute;tricas
      </Title>
      <div style={{ background: "#fafbfc", borderRadius: 10, padding: 16, border: "1px solid #f0f2f5" }}>
        <Row gutter={[16, 16]} style={{ marginBottom: 0 }}>
          <Col span={4}>
            <Statistic
              title={showReach ? "Reach" : "Impressions"}
              value={formatNumber(showReach ? post.reach : post.impressions)}
              valueStyle={{ fontSize: 16, fontFamily: "'Barlow Condensed', sans-serif" }}
            />
          </Col>
          <Col span={4}>
            <Statistic title="Engagement" value={formatNumber(post.engagement_total)} valueStyle={{ fontSize: 16, fontFamily: "'Barlow Condensed', sans-serif" }} />
          </Col>
          <Col span={4}>
            <Statistic title={erLbl} value={formatPercent(er)} valueStyle={{ fontSize: 16, fontFamily: "'Barlow Condensed', sans-serif" }} />
          </Col>
          <Col span={3}>
            <Statistic title="Likes" value={formatNumber(post.likes)} valueStyle={{ fontSize: 16, fontFamily: "'Barlow Condensed', sans-serif" }} />
          </Col>
          <Col span={4}>
            <div>
              <Statistic title="Comentarios" value={formatNumber(post.comments)} valueStyle={{ fontSize: 16, fontFamily: "'Barlow Condensed', sans-serif" }} />
              {post.awario_comments_count > 0 && (
                <Text type="secondary" style={{ fontSize: 10 }}>{formatNumber(post.awario_comments_count)} capt.</Text>
              )}
            </div>
          </Col>
          <Col span={3}>
            <Statistic title="Shares" value={formatNumber(post.shares)} valueStyle={{ fontSize: 16, fontFamily: "'Barlow Condensed', sans-serif" }} />
          </Col>
          <Col span={3}>
            <Statistic title="Views" value={formatNumber(post.views)} valueStyle={{ fontSize: 16, fontFamily: "'Barlow Condensed', sans-serif" }} />
          </Col>
          <Col span={4}>
            <Statistic title="Impressions" value={formatNumber(post.impressions)} valueStyle={{ fontSize: 16, fontFamily: "'Barlow Condensed', sans-serif" }} />
          </Col>
          <Col span={3}>
            <Statistic title="Clicks" value={formatNumber(post.clicks)} valueStyle={{ fontSize: 16, fontFamily: "'Barlow Condensed', sans-serif" }} />
          </Col>
          <Col span={3}>
            <Statistic title="Saves" value={formatNumber(post.saves)} valueStyle={{ fontSize: 16, fontFamily: "'Barlow Condensed', sans-serif" }} />
          </Col>
        </Row>
      </div>

      {/* Classification */}
      <Divider style={{ margin: "12px 0" }} />
      <Title level={5} type="secondary" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12, borderLeft: "3px solid #e30613", paddingLeft: 8 }}>
        Clasificaci&oacute;n
      </Title>
      <Flex wrap="wrap" align="center" gap={12} style={{ marginBottom: 8 }}>
        <Space size={4}>
          <Text type="secondary" style={{ fontSize: 12 }}>Sentimiento:</Text>
          <SentimentTag sentiment={post.sentiment} />
        </Space>
        {post.sentiment_confidence !== null && (
          <Space size={4}>
            <Text type="secondary" style={{ fontSize: 12 }}>Confianza:</Text>
            <Text strong style={{ fontSize: 12 }}>{formatScore(post.sentiment_confidence)}</Text>
          </Space>
        )}
        <Space size={4}>
          <Text type="secondary" style={{ fontSize: 12 }}>Source:</Text>
          <Text strong style={{ fontSize: 12 }}>{formatScore(post.source_score)}</Text>
        </Space>
      </Flex>

      {post.campaign && (
        <div style={{ marginTop: 8, fontSize: 12 }}>
          <Text type="secondary">Campa&ntilde;a:</Text>{" "}
          <Text strong>{post.campaign}</Text>
        </div>
      )}

      {post.strategies && post.strategies.length > 0 && (
        <Flex wrap="wrap" gap={4} style={{ marginTop: 8 }} align="center">
          <Text type="secondary" style={{ fontSize: 12, marginRight: 4 }}>Estrategias:</Text>
          {post.strategies.map((s) => (
            <Tag key={s}>{s}</Tag>
          ))}
        </Flex>
      )}

      {post.topics && post.topics.length > 0 && (
        <Flex wrap="wrap" gap={4} style={{ marginTop: 8 }} align="center">
          <Text type="secondary" style={{ fontSize: 12, marginRight: 4 }}>Topics:</Text>
          {post.topics.map((t) => (
            <Tag key={t.key} color="blue">
              {t.label} <Text type="secondary" style={{ fontSize: 9 }}>{formatScore(t.confidence)}</Text>
            </Tag>
          ))}
        </Flex>
      )}

      {/* Sentiment Balance (from comments) */}
      {commentSentimentCounts && (commentSentimentCounts.positive + commentSentimentCounts.neutral + commentSentimentCounts.negative + commentSentimentCounts.unknown) > 0 && (
        <>
          <Divider style={{ margin: "12px 0" }} />
          <Title level={5} type="secondary" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12, borderLeft: "3px solid #e30613", paddingLeft: 8 }}>
            Balance de sentimiento (comentarios)
          </Title>
          <SentimentBalanceBar {...commentSentimentCounts} />
        </>
      )}

      {/* Comments section */}
      {post.awario_comments_count > 0 && (
        <>
          <Divider style={{ margin: "12px 0" }} />
          <PostDetailComments
            post={post}
            client={client}
            canOverride={canOverrideComments}
            onError={onError}
            onSentimentCounts={setCommentSentimentCounts}
          />
        </>
      )}
    </Modal>
  );
};

export default PostDetailModal;
