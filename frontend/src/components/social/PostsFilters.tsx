import React from "react";
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
  <div className="posts-filter-bar">
    {ALL_CHANNELS.map((ch) => {
      const isActive = activeChannels.length === 0 || activeChannels.includes(ch);
      return (
        <button
          key={ch}
          type="button"
          className={`posts-filter-chip ${isActive ? "active" : ""}`}
          onClick={() => onToggleChannel(ch)}
        >
          <span>{channelIcon[ch]}</span>
          <span>{toChannelLabel(ch)}</span>
        </button>
      );
    })}
    <div className="ml-auto relative">
      <input
        type="text"
        placeholder="Buscar por t\u00edtulo o texto..."
        value={textSearch}
        onChange={(e) => onTextSearchChange(e.target.value)}
        className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none w-56"
      />
      {textSearch && (
        <button
          type="button"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
          onClick={() => onTextSearchChange("")}
        >
          &#x2715;
        </button>
      )}
    </div>
  </div>
);

export default PostsFilters;
