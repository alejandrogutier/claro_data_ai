import React, { useCallback, useEffect, useState } from "react";
import { List, Select, Button, Typography, Flex, Spin, Empty, Space, Divider } from "antd";
import type { PostRow, AwarioCommentRow, CommentSentimentFilter, CommentSpamFilter, CommentRelatedFilter } from "./postsTypes";
import { formatNumber } from "./postsUtils";
import CommentCard from "./CommentCard";
import SentimentBalanceBar from "./SentimentBalanceBar";
import type { ApiClient } from "../../api/client";

const { Text, Title } = Typography;

type Props = {
  post: PostRow;
  client: ApiClient;
  canOverride: boolean;
  onError: (error: unknown) => void;
  onSentimentCounts?: (counts: { positive: number; neutral: number; negative: number; unknown: number }) => void;
};

const PostDetailComments: React.FC<Props> = ({ post, client, canOverride, onError, onSentimentCounts }) => {
  const [comments, setComments] = useState<AwarioCommentRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [sentimentFilter, setSentimentFilter] = useState<CommentSentimentFilter>("all");
  const [spamFilter, setSpamFilter] = useState<CommentSpamFilter>("all");
  const [relatedFilter, setRelatedFilter] = useState<CommentRelatedFilter>("all");

  const buildQuery = useCallback(
    (c?: string) => ({
      limit: 25,
      cursor: c,
      sentiment: sentimentFilter === "all" ? undefined : sentimentFilter,
      is_spam: spamFilter === "all" ? undefined : spamFilter === "spam",
      related_to_post_text: relatedFilter === "all" ? undefined : relatedFilter === "related"
    }),
    [sentimentFilter, spamFilter, relatedFilter]
  );

  const load = useCallback(
    async (append = false, c?: string) => {
      setLoading(true);
      try {
        const response = await client.listMonitorSocialPostComments(post.id, buildQuery(c));
        const incoming = response.items ?? [];
        setComments((prev) => (append ? [...prev, ...incoming] : incoming));
        setCursor(response.page_info.next_cursor ?? null);
        setHasNext(Boolean(response.page_info.has_next));
      } catch (err) {
        onError(err);
        if (!append) {
          setComments([]);
          setCursor(null);
          setHasNext(false);
        }
      } finally {
        setLoading(false);
      }
    },
    [client, post.id, buildQuery, onError]
  );

  useEffect(() => {
    void load();
  }, [sentimentFilter, spamFilter, relatedFilter, post.id]);

  // Emit sentiment counts to parent
  useEffect(() => {
    if (!onSentimentCounts || comments.length === 0) return;
    const counts = { positive: 0, neutral: 0, negative: 0, unknown: 0 };
    for (const c of comments) {
      if (c.sentiment === "positive") counts.positive++;
      else if (c.sentiment === "negative") counts.negative++;
      else if (c.sentiment === "neutral") counts.neutral++;
      else counts.unknown++;
    }
    onSentimentCounts(counts);
  }, [comments, onSentimentCounts]);

  const patchComment = async (
    commentId: string,
    payload: { is_spam?: boolean; related_to_post_text?: boolean; sentiment?: "positive" | "negative" | "neutral" | "unknown" }
  ) => {
    if (!canOverride || updatingId) return;
    setUpdatingId(commentId);
    try {
      const updated = await client.patchMonitorSocialComment(commentId, payload);
      setComments((prev) => prev.map((item) => (item.id === commentId ? updated : item)));
    } catch (err) {
      onError(err);
    } finally {
      setUpdatingId(null);
    }
  };

  // Compute sentiment balance from loaded comments
  const sentimentCounts = comments.reduce(
    (acc, c) => {
      if (c.sentiment === "positive") acc.positive++;
      else if (c.sentiment === "negative") acc.negative++;
      else if (c.sentiment === "neutral") acc.neutral++;
      else acc.unknown++;
      return acc;
    },
    { positive: 0, neutral: 0, negative: 0, unknown: 0 }
  );

  return (
    <div>
      {/* Header */}
      <Flex align="center" justify="space-between" wrap="wrap" gap={8} style={{ marginBottom: 12 }}>
        <Title level={5} style={{ margin: 0, fontSize: 14 }}>Comentarios</Title>
        <Flex align="center" gap={12}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Plataforma: <Text strong style={{ fontSize: 12 }}>{formatNumber(post.comments)}</Text>
          </Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Capturados: <Text strong style={{ fontSize: 12 }}>{formatNumber(post.awario_comments_count)}</Text>
          </Text>
        </Flex>
      </Flex>

      {/* Sentiment Balance */}
      {comments.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <SentimentBalanceBar
            {...sentimentCounts}
            label={`Basado en ${comments.length} comentario${comments.length !== 1 ? "s" : ""} cargado${comments.length !== 1 ? "s" : ""}`}
          />
        </div>
      )}

      {/* Filters */}
      <Flex wrap="wrap" gap={8} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: "1px solid #f0f0f0" }}>
        <Space size={4}>
          <Text strong style={{ fontSize: 12 }}>Sentimiento</Text>
          <Select
            size="small"
            value={sentimentFilter}
            onChange={(val) => setSentimentFilter(val as CommentSentimentFilter)}
            style={{ width: 110 }}
            options={[
              { value: "all", label: "Todos" },
              { value: "positive", label: "Positivo" },
              { value: "negative", label: "Negativo" },
              { value: "neutral", label: "Neutro" },
              { value: "unknown", label: "Unknown" },
            ]}
          />
        </Space>
        <Space size={4}>
          <Text strong style={{ fontSize: 12 }}>Spam</Text>
          <Select
            size="small"
            value={spamFilter}
            onChange={(val) => setSpamFilter(val as CommentSpamFilter)}
            style={{ width: 110 }}
            options={[
              { value: "all", label: "Todos" },
              { value: "not_spam", label: "No spam" },
              { value: "spam", label: "Spam" },
            ]}
          />
        </Space>
        <Space size={4}>
          <Text strong style={{ fontSize: 12 }}>Relaci&oacute;n</Text>
          <Select
            size="small"
            value={relatedFilter}
            onChange={(val) => setRelatedFilter(val as CommentRelatedFilter)}
            style={{ width: 140 }}
            options={[
              { value: "all", label: "Todos" },
              { value: "related", label: "Relacionados" },
              { value: "not_related", label: "No relacionados" },
            ]}
          />
        </Space>
      </Flex>

      {/* List */}
      {loading && comments.length === 0 && (
        <Flex justify="center" style={{ padding: 24 }}>
          <Spin tip="Cargando comentarios..." />
        </Flex>
      )}
      {!loading && comments.length === 0 && (
        <Empty description="No hay comentarios para estos filtros." />
      )}

      {comments.length > 0 && (
        <List
          dataSource={comments}
          renderItem={(comment) => (
            <CommentCard
              key={comment.id}
              comment={comment}
              canOverride={canOverride}
              updating={updatingId === comment.id}
              onPatch={patchComment}
            />
          )}
          loadMore={
            hasNext ? (
              <Flex justify="center" style={{ marginTop: 12 }}>
                <Button
                  onClick={() => void load(true, cursor ?? undefined)}
                  loading={loading}
                >
                  Cargar m&aacute;s comentarios
                </Button>
              </Flex>
            ) : null
          }
        />
      )}
    </div>
  );
};

export default PostDetailComments;
