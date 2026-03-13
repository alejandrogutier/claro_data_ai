import React from "react";
import { Tag, Input, Flex } from "antd";
import type { SocialChannel } from "./postsTypes";
import { channelIcon, toChannelLabel } from "./postsUtils";

const ALL_CHANNELS: SocialChannel[] = ["facebook", "instagram", "x", "linkedin", "tiktok"];

type Props = {
  textSearch: string;
  onTextSearchChange: (value: string) => void;
  activeChannels: SocialChannel[];
  onToggleChannel: (channel: SocialChannel) => void;
};

const PostsFilters: React.FC<Props> = ({ textSearch, onTextSearchChange, activeChannels, onToggleChannel }) => (
  <Flex align="center" wrap="wrap" gap={8}>
    {ALL_CHANNELS.map((ch) => {
      const isActive = activeChannels.length === 0 || activeChannels.includes(ch);
      return (
        <Tag.CheckableTag
          key={ch}
          checked={isActive}
          onChange={() => onToggleChannel(ch)}
        >
          <span>{channelIcon[ch]}</span>{" "}
          <span>{toChannelLabel(ch)}</span>
        </Tag.CheckableTag>
      );
    })}
    <div style={{ marginLeft: "auto" }}>
      <Input.Search
        placeholder="Buscar por t\u00edtulo o texto..."
        value={textSearch}
        onChange={(e) => onTextSearchChange(e.target.value)}
        onSearch={onTextSearchChange}
        allowClear
        style={{ width: 224 }}
        size="small"
      />
    </div>
  </Flex>
);

export default PostsFilters;
