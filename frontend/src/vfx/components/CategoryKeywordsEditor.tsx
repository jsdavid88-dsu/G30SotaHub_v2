// 카테고리 검색 키워드 편집 (admin/professor) — 야간배치 크롤 sweep 대상.
// keywords / github_topics / hf_tags / subreddits / x_accounts 5그룹 chip 편집.
import { useState } from "react";
import { Plus, X, Pencil, Save, RotateCcw, Loader2 } from "lucide-react";
import { useRole } from "../../contexts/RoleContext";
import { updateCategory, type CategoryUpdatePayload } from "../api/categories";
import type { Category } from "../types";
import { cardStyle, sectionHeaderStyle, sectionTitleStyle, btnPrimary, btnGhost } from "../design";

type GroupKey = "keywords" | "github_topics" | "hf_tags" | "subreddits" | "x_accounts";

const GROUPS: { key: GroupKey; label: string; hint: string }[] = [
  { key: "keywords", label: "검색 키워드", hint: "제목·초록 매칭 + arxiv cs.* 프리픽스" },
  { key: "github_topics", label: "GitHub 토픽", hint: "GitHub topic: 검색" },
  { key: "hf_tags", label: "HuggingFace 태그", hint: "HF 모델/스페이스 태그" },
  { key: "subreddits", label: "서브레딧", hint: "Reddit 크롤 대상 (자격증명 필요)" },
  { key: "x_accounts", label: "X 계정", hint: "X(트위터) 모니터 계정" },
];

function KeywordGroup({
  label, hint, values, editable, onChange,
}: {
  label: string; hint: string; values: string[]; editable: boolean;
  onChange: (next: string[]) => void;
}) {
  const [input, setInput] = useState("");
  const add = () => {
    const v = input.trim();
    if (v && !values.includes(v)) onChange([...values, v]);
    setInput("");
  };
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-secondary)", marginBottom: 6 }}>
        {label} <span style={{ fontWeight: 400, color: "var(--color-text-muted)" }}>· {hint}</span>
        <span style={{ marginLeft: 6, color: "var(--color-text-muted)" }}>({values.length})</span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
        {values.map((v) => (
          <span key={v} style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            padding: "3px 8px", borderRadius: 6, fontSize: 12,
            background: "#f1f5f9", color: "var(--color-text-secondary)",
          }}>
            {v}
            {editable && (
              <button onClick={() => onChange(values.filter((x) => x !== v))}
                title="삭제" style={{ border: "none", background: "none", cursor: "pointer", color: "#94a3b8", padding: 0, display: "flex" }}>
                <X style={{ width: 12, height: 12 }} />
              </button>
            )}
          </span>
        ))}
        {editable && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
            <input value={input} onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
              placeholder="+ 추가"
              style={{ width: 110, padding: "3px 8px", borderRadius: 6, border: "1px solid var(--color-border)", fontSize: 12 }} />
            <button onClick={add} title="추가"
              style={{ border: "none", background: "none", cursor: "pointer", color: "var(--color-accent)", display: "flex", padding: 2 }}>
              <Plus style={{ width: 14, height: 14 }} />
            </button>
          </span>
        )}
        {!editable && values.length === 0 && (
          <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>—</span>
        )}
      </div>
    </div>
  );
}

export default function CategoryKeywordsEditor({
  category, onSaved,
}: {
  category: Category;
  onSaved: () => void;
}) {
  const { currentRole } = useRole();
  const canEdit = currentRole === "admin" || currentRole === "professor";

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Record<GroupKey, string[]>>({
    keywords: category.keywords ?? [],
    github_topics: category.github_topics ?? [],
    hf_tags: category.hf_tags ?? [],
    subreddits: category.subreddits ?? [],
    x_accounts: category.x_accounts ?? [],
  });

  const reset = () => {
    setDraft({
      keywords: category.keywords ?? [],
      github_topics: category.github_topics ?? [],
      hf_tags: category.hf_tags ?? [],
      subreddits: category.subreddits ?? [],
      x_accounts: category.x_accounts ?? [],
    });
    setEditing(false);
  };

  const save = async () => {
    setSaving(true);
    try {
      await updateCategory(category.slug, draft as CategoryUpdatePayload);
      setEditing(false);
      onSaved();
    } catch (e) {
      alert(`저장 실패: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section style={{ ...cardStyle, marginBottom: 24, overflow: "hidden" }}>
      <div style={{ ...sectionHeaderStyle, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={sectionTitleStyle}>
          검색 키워드 <span style={{ fontSize: 12, fontWeight: 400, color: "var(--color-text-muted)" }}>야간배치 크롤 대상</span>
        </div>
        {canEdit && (
          editing ? (
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={save} disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }}>
                {saving ? <Loader2 style={{ width: 13, height: 13, animation: "spin 0.8s linear infinite" }} /> : <Save style={{ width: 13, height: 13 }} />}
                저장
              </button>
              <button onClick={reset} disabled={saving} style={btnGhost}>
                <RotateCcw style={{ width: 13, height: 13 }} /> 취소
              </button>
            </div>
          ) : (
            <button onClick={() => setEditing(true)} style={btnGhost}>
              <Pencil style={{ width: 13, height: 13 }} /> 편집
            </button>
          )
        )}
      </div>
      <div style={{ padding: 20 }}>
        {GROUPS.map((g) => (
          <KeywordGroup
            key={g.key}
            label={g.label}
            hint={g.hint}
            values={draft[g.key]}
            editable={editing}
            onChange={(next) => setDraft((d) => ({ ...d, [g.key]: next }))}
          />
        ))}
        {editing && (
          <p style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 4 }}>
            저장 후 다음 야간배치(또는 수동 크롤)부터 갱신된 키워드로 수집합니다.
          </p>
        )}
      </div>
    </section>
  );
}
