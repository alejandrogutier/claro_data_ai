import React from "react";
import { Flex, Select, Segmented, Typography } from "antd";
import type { PostsViewMode, SocialPostSort } from "./postsTypes";
import { POST_SORT_OPTIONS, toPostSortLabel } from "./postsUtils";

const { Text } = Typography;

type Props = {
  totalVisible: number;
  viewMode: PostsViewMode;
  onViewModeChange: (mode: PostsViewMode) => void;
  sort: SocialPostSort;
  onSortChange: (sort: SocialPostSort) => void;
  loading?: boolean;
};

const PostsToolbar: React.FC<Props> = ({ totalVisible, viewMode, onViewModeChange, sort, onSortChange, loading }) => (
  <div style={{ background: "#fafbfc", borderRadius: 10, padding: "8px 14px", border: "1px solid #f0f2f5" }}>
    <Flex align="center" justify="space-between" wrap="wrap" gap={8}>
      <Flex align="center" gap={12}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700 }}>{totalVisible}</span>{" "}
          post{totalVisible !== 1 ? "s" : ""}
        </Text>
        {loading && <Text type="secondary" style={{ fontSize: 12 }}>Actualizando...</Text>}
      </Flex>

      <Flex align="center" gap={8}>
        <Text strong style={{ fontSize: 12 }}>Orden</Text>
        <Select
          value={sort}
          onChange={onSortChange}
          size="small"
          style={{ width: 170 }}
          options={POST_SORT_OPTIONS.map((opt) => ({
            value: opt,
            label: toPostSortLabel(opt),
          }))}
        />

        <Segmented
          value={viewMode}
          onChange={(val) => onViewModeChange(val as PostsViewMode)}
          size="small"
          options={[
            { value: "table", label: "Tabla" },
            { value: "cards", label: "Cards" },
          ]}
        />
      </Flex>
    </Flex>
  </div>
);

export default PostsToolbar;
