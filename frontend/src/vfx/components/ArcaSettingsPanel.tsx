// Arca 운영자 커스텀 지침 (admin/professor 전용 — self-gate).
// 자연어 지침이 score/wiki 프롬프트 끝에 '운영자 추가 지침'으로 append.
// 프롬프트 골격(JSON 스키마)은 코드 고정 → 여기선 지침만.
import { useState, useEffect } from "react";
import { Brain, Save, Loader2 } from "lucide-react";
import { useRole } from "../../contexts/RoleContext";
import { getArcaSettings, putArcaSettings } from "../api/admin";
import { cardStyle, sectionHeaderStyle, sectionTitleStyle, btnPrimary } from "../design";

export default function ArcaSettingsPanel() {
  const { currentRole } = useRole();
  const isAdmin = currentRole === "admin" || currentRole === "professor";

  const [value, setValue] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    getArcaSettings()
      .then((s) => { setValue(s.custom_instructions || ""); setSavedAt(s.updated_at); })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [isAdmin]);

  if (!isAdmin) return null;

  const save = async () => {
    setSaving(true);
    try {
      const s = await putArcaSettings(value.trim() || null);
      setValue(s.custom_instructions || "");
      setSavedAt(s.updated_at);
    } catch (e) {
      alert(`저장 실패: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section style={{ ...cardStyle, marginBottom: 24, overflow: "hidden" }}>
      <div style={{ ...sectionHeaderStyle, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ ...sectionTitleStyle, display: "flex", alignItems: "center", gap: 8 }}>
          <Brain style={{ width: 16, height: 16, color: "var(--color-accent)" }} />
          Arca 지침 <span style={{ fontSize: 12, fontWeight: 400, color: "var(--color-text-muted)" }}>스코어링·위키 프롬프트에 반영</span>
        </div>
        <button onClick={save} disabled={saving || !loaded}
          style={{ ...btnPrimary, opacity: saving || !loaded ? 0.6 : 1 }}>
          {saving ? <Loader2 style={{ width: 13, height: 13, animation: "spin 0.8s linear infinite" }} /> : <Save style={{ width: 13, height: 13 }} />}
          저장
        </button>
      </div>
      <div style={{ padding: 20 }}>
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          rows={5}
          placeholder={"예) 영상생성·이미지생성 계열을 최우선 평가\n데모만 있고 코드 없으면 P3 이하\n한국어 VFX 실무 관점 강조"}
          style={{ width: "100%", padding: 12, borderRadius: 10, border: "1px solid var(--color-border)", fontSize: 13, resize: "vertical", lineHeight: 1.6, fontFamily: "inherit" }}
        />
        <p style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 8, lineHeight: 1.6 }}>
          자연어 지침이 Gemma 프롬프트 끝에 '운영자 추가 지침'으로 들어갑니다. JSON 형식/스키마는 자동 관리되니 지침만 쓰세요.
          {savedAt ? ` · 마지막 저장 ${new Date(savedAt).toLocaleString("ko-KR")}` : ""}
        </p>
      </div>
    </section>
  );
}
