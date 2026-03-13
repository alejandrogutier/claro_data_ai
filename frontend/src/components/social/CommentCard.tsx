import React from "react";
import { Card, Tag, Button, Select, Typography, Flex, Space } from "antd";
import type { AwarioCommentRow } from "./postsTypes";
import { formatDateTime, formatScore } from "./postsUtils";
import { SentimentTag } from "../shared/SentimentTag";

const { Text, Link } = Typography;

type Props = {
  comment: AwarioCommentRow;
  canOverride: boolean;
  updating: boolean;
  onPatch: (commentId: string, payload: { is_spam?: boolean; related_to_post_text?: boolean; sentiment?: "positive" | "negative" | "neutral" | "unknown" }) => void;
};

const CommentCard: React.FC<Props> = ({ comment, canOverride, updating, onPatch }) => {
  return (
    <Card size="small" style={{ marginBottom: 8 }}>
      {/* Header */}
      <Flex align="center" wrap="wrap" gap={8} style={{ marginBottom: 4 }}>
        <Text strong style={{ fontSize: 12 }}>{comment.author_name ?? "Autor desconocido"}</Text>
        <Text type="secondary" style={{ fontSize: 12 }}>{formatDateTime(comment.published_at)}</Text>
        <SentimentTag sentiment={comment.sentiment} />
        <Tag color={comment.is_spam ? "error" : "default"}>
          {comment.is_spam ? "spam" : "no spam"}
        </Tag>
        <Tag color={comment.related_to_post_text ? "success" : "warning"}>
          {comment.related_to_post_text ? "relacionado" : "no relacionado"}
        </Tag>
        {comment.needs_review && <Tag color="orange">needs_review</Tag>}
      </Flex>

      {/* Body */}
      <Text style={{ fontSize: 13 }}>{comment.text || "(sin texto)"}</Text>

      {/* Meta */}
      <Flex align="center" wrap="wrap" gap={8} style={{ marginTop: 8 }}>
        {comment.comment_url && (
          <Link
            href={comment.comment_url}
            target="_blank"
            style={{ fontSize: 12, color: "#b91c1c" }}
          >
            Ver comentario original
          </Link>
        )}
        <Text type="secondary" style={{ fontSize: 12 }}>confianza: {comment.confidence === null ? "n/a" : formatScore(comment.confidence)}</Text>
      </Flex>

      {/* Override actions */}
      {canOverride && (
        <Flex align="center" wrap="wrap" gap={8} style={{ marginTop: 12 }}>
          <Button
            size="small"
            disabled={updating}
            onClick={() => onPatch(comment.id, { is_spam: !comment.is_spam })}
          >
            Marcar {comment.is_spam ? "no spam" : "spam"}
          </Button>
          <Button
            size="small"
            disabled={updating}
            onClick={() => onPatch(comment.id, { related_to_post_text: !comment.related_to_post_text })}
          >
            Marcar {comment.related_to_post_text ? "no relacionado" : "relacionado"}
          </Button>
          <Space size={4}>
            <Text style={{ fontSize: 12 }}>Sentimiento</Text>
            <Select
              size="small"
              value={comment.sentiment}
              disabled={updating}
              onChange={(val) => onPatch(comment.id, { sentiment: val as "positive" | "negative" | "neutral" | "unknown" })}
              style={{ width: 110 }}
              options={[
                { value: "positive", label: "positive" },
                { value: "negative", label: "negative" },
                { value: "neutral", label: "neutral" },
                { value: "unknown", label: "unknown" },
              ]}
            />
          </Space>
        </Flex>
      )}
    </Card>
  );
};

export default CommentCard;
