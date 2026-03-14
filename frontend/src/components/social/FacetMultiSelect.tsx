import React from "react";
import { Select, Tag } from "antd";

export type FacetItem = { value: string; count: number };

type FacetMultiSelectProps = {
  label: string;
  placeholder: string;
  value: string[];
  facetItems: FacetItem[];
  loading?: boolean;
  onChange: (values: string[]) => void;
  toLabel?: (value: string) => string;
};

const FacetMultiSelect: React.FC<FacetMultiSelectProps> = ({
  label,
  placeholder,
  value,
  facetItems,
  loading = false,
  onChange,
  toLabel,
}) => {
  const options = facetItems.map((item) => {
    const displayText = toLabel ? toLabel(item.value) : item.value;
    return {
      label: (
        <span style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{displayText}</span>
          <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 500, flexShrink: 0, marginLeft: 8 }}>
            {item.count.toLocaleString("es-CO")}
          </span>
        </span>
      ),
      value: item.value,
      searchLabel: displayText,
      title: displayText,
    };
  });

  return (
    <div>
      <div style={{
        fontSize: 10,
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: 0.5,
        color: "#94a3b8",
        marginBottom: 2,
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}>
        {label}
      </div>
      <Select
        mode="multiple"
        size="small"
        style={{ width: "100%" }}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        options={options}
        showSearch
        allowClear
        maxTagCount="responsive"
        maxTagPlaceholder={(omitted) => (
          <span style={{ fontSize: 11, color: "#e30613", fontWeight: 600 }}>+{omitted.length}</span>
        )}
        optionFilterProp="searchLabel"
        popupMatchSelectWidth={false}
        dropdownStyle={{ minWidth: 260 }}
        loading={loading}
        notFoundContent={loading ? "Cargando..." : "Sin resultados"}
        variant="filled"
        tagRender={({ value: tagValue, closable, onClose }) => {
          const displayText = toLabel ? toLabel(tagValue as string) : (tagValue as string);
          return (
            <Tag
              closable={closable}
              onClose={onClose}
              color="red"
              style={{ borderRadius: 999, fontSize: 10, lineHeight: "18px", margin: "1px 2px 1px 0", maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis" }}
            >
              {displayText}
            </Tag>
          );
        }}
      />
    </div>
  );
};

export default FacetMultiSelect;
