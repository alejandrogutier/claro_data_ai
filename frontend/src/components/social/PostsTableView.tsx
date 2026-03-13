import React, { useState } from "react";
import { Table, Typography, Tag, Image, Flex } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { PostRow } from "./postsTypes";
import { channelColorStyles, channelIcon, toChannelLabel, truncate, formatDate, formatNumber, formatPercent, computeER } from "./postsUtils";
import { SentimentTag } from "../shared/SentimentTag";

const { Text, Link } = Typography;

type Props = {
  posts: PostRow[];
  onSelectPost: (post: PostRow) => void;
};

const PostsTableView: React.FC<Props> = ({ posts, onSelectPost }) => {
  const [imgErrors, setImgErrors] = useState<Set<string>>(new Set());

  const handleImgError = (postId: string) => {
    setImgErrors((prev) => new Set(prev).add(postId));
  };

  const columns: ColumnsType<PostRow> = [
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
              style={{ borderRadius: 8, objectFit: "cover" }}
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
            style={{ fontSize: 12, color: "#b91c1c" }}
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
    {
      title: "Reach",
      key: "reach",
      width: 100,
      render: (_: unknown, post: PostRow) => {
        const showReach = post.reach > 0;
        return (
          <div>
            <Text strong style={{ fontSize: 13 }}>{formatNumber(showReach ? post.reach : post.impressions)}</Text>
            {!showReach && post.impressions > 0 && (
              <Text type="secondary" style={{ fontSize: 10, marginLeft: 4 }}>(imp)</Text>
            )}
          </div>
        );
      },
    },
    {
      title: "Engagement",
      dataIndex: "engagement_total",
      key: "engagement_total",
      width: 100,
      render: (val: number) => <Text strong style={{ fontSize: 13 }}>{formatNumber(val)}</Text>,
    },
    {
      title: "ER",
      key: "er",
      width: 80,
      render: (_: unknown, post: PostRow) => {
        const er = computeER(post);
        return <Text strong style={{ fontSize: 13 }}>{formatPercent(er)}</Text>;
      },
    },
    {
      title: "Comentarios",
      key: "comments",
      width: 110,
      render: (_: unknown, post: PostRow) => (
        <div>
          <Text strong style={{ fontSize: 13 }}>{formatNumber(post.comments)}</Text>
          {post.awario_comments_count > 0 && (
            <Text type="secondary" style={{ fontSize: 10, marginLeft: 4 }}>
              ({formatNumber(post.awario_comments_count)} capt.)
            </Text>
          )}
        </div>
      ),
    },
  ];

  return (
    <Table<PostRow>
      columns={columns}
      dataSource={posts}
      rowKey="id"
      pagination={false}
      size="small"
      scroll={{ x: 1060 }}
      onRow={(post) => ({
        onClick: () => onSelectPost(post),
        style: { cursor: "pointer" },
      })}
    />
  );
};

export default PostsTableView;
