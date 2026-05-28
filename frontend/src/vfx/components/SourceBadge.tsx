// 이슈 #15 P2-6: design.ts 의 SOURCE_COLORS 를 source-of-truth 로 사용 +
// 미등록 source fallback. dark Tailwind 클래스 → Hub light 테마 inline style.
import { sourceBadge } from "../design";

export default function SourceBadge({
  source,
  muted,
}: {
  source: string;
  muted?: boolean;
}) {
  const { bg, color, label } = sourceBadge(source);
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        borderRadius: 6,
        padding: "1px 6px",
        fontSize: 10,
        fontWeight: 600,
        background: bg,
        color,
        border: muted ? `1px dashed ${color}55` : `1px solid ${color}33`,
        opacity: muted ? 0.6 : 1,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}
