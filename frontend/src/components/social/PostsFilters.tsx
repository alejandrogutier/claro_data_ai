import React from "react";
import { Tag, Input, Flex } from "antd";
import type { SocialChannel } from "./postsTypes";
import { channelColorStyles, channelIcon, toChannelLabel } from "./postsUtils";

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
          style={
            isActive
              ? {
                  borderRadius: 999,
                  padding: "4px 12px",
                  fontWeight: 600,
                  fontSize: 13,
                  background: channelColorStyles[ch]?.bg ?? "#eff6ff",
                  color: channelColorStyles[ch]?.text ?? "#1d4ed8",
                  border: "1px solid " + (channelColorStyles[ch]?.border ?? "#93c5fd"),
                }
              : {
                  borderRadius: 999,
                  padding: "4px 12px",
                  fontWeight: 400,
                  fontSize: 13,
                  background: "#f8fafc",
                  color: "#64748b",
                  border: "1px solid #e7e9ed",
                }
          }
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
        style={{ width: 224, borderRadius: 999 }}
        size="small"
      />
    </div>
  </Flex>
);

export default PostsFilters;
