// 백엔드 background 작업 진행 상황 표시.
// - 진행 중일 때: 진행 stage + detail + progress bar
// - 완료 후: 5초간 결과 표시 후 사라짐
// - 폴링 주기: 진행 중 1.5초, 대기 중 6초 (부하 절감)
import { useEffect, useRef, useState } from "react";
import { Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { fetchRunStatus, type RunStatus } from "../api/admin";
import { useRole, isPrivileged } from "../../contexts/RoleContext";

function elapsed(started: string | null): string {
  if (!started) return "";
  try {
    const ms = Date.now() - new Date(started).getTime();
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60_000) return `${Math.floor(ms / 1000)}초`;
    if (ms < 3_600_000) {
      const m = Math.floor(ms / 60_000);
      const s = Math.floor((ms % 60_000) / 1000);
      return `${m}분 ${s}초`;
    }
    return `${Math.floor(ms / 3_600_000)}시간 ${Math.floor((ms % 3_600_000) / 60_000)}분`;
  } catch {
    return "";
  }
}

export default function RunStatusBar() {
  const { currentRole } = useRole();
  const canSeeRun = isPrivileged(currentRole);  // admin / professor 만 admin endpoint polling
  const [status, setStatus] = useState<RunStatus | null>(null);
  const [hideAfterDone, setHideAfterDone] = useState(false);
  const timerRef = useRef<number | null>(null);
  const hideTimerRef = useRef<number | null>(null);

  // 폴링 — 진행 중이면 빠르게(1.5s), 아니면 느리게(6s). admin/professor 만.
  useEffect(() => {
    if (!canSeeRun) return;  // student/external 은 admin endpoint 403 — skip
    let cancelled = false;

    const tick = async () => {
      try {
        const s = await fetchRunStatus();
        if (cancelled) return;
        setStatus((prev) => {
          // 새로 시작 됨 → 'hideAfterDone' 리셋
          if (s.is_running && (!prev || !prev.is_running)) {
            setHideAfterDone(false);
            if (hideTimerRef.current) {
              clearTimeout(hideTimerRef.current);
              hideTimerRef.current = null;
            }
          }
          // 막 끝난 순간 (이전엔 running, 지금 not running) → 5초 후 hide
          if (prev?.is_running && !s.is_running) {
            if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
            hideTimerRef.current = window.setTimeout(() => setHideAfterDone(true), 5000);
          }
          return s;
        });
      } catch {
        // 401/네트워크 — 그냥 무시
      }
    };

    tick();
    const schedule = () => {
      const next = status?.is_running ? 1500 : 6000;
      timerRef.current = window.setTimeout(async () => {
        await tick();
        schedule();
      }, next);
    };
    schedule();

    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
    // intentional: status?.is_running 만 의존 — 다른 필드 변경 시 polling 재시작 X
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status?.is_running, canSeeRun]);

  // 권한 없으면 컴포넌트 자체 미렌더
  if (!canSeeRun) return null;

  // 표시 여부 결정
  if (!status) return null;
  // 처음부터 idle (한 번도 실행 안 됨) → 안 보여줌
  if (!status.is_running && !status.started_at) return null;
  // 완료 후 5초 지났으면 사라짐
  if (!status.is_running && hideAfterDone) return null;

  const isError = !!status.error;
  const isDone = !status.is_running && !isError;
  const accent = isError ? "#dc2626" : isDone ? "#059669" : "#4f46e5";
  const accentLight = isError ? "#fee2e2" : isDone ? "#d1fae5" : "#e0e7ff";
  const Icon = isError ? AlertTriangle : isDone ? CheckCircle2 : Loader2;

  const labelText = status.label || status.action || "작업 중";
  const stageText = status.error
    ? `에러: ${status.error}`
    : status.stage || (isDone ? "완료" : "진행 중...");
  const detailText = status.detail;
  const progress = status.progress ?? null;

  return (
    <div style={{
      position: "sticky",
      top: 0,
      zIndex: 30,
      marginBottom: 16,
      padding: "10px 16px",
      borderRadius: 12,
      background: "var(--color-card)",
      border: `1px solid ${accent}`,
      boxShadow: "0 2px 8px rgba(15,23,42,0.06)",
      display: "flex",
      alignItems: "center",
      gap: 12,
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: 8,
        background: accentLight, color: accent,
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0,
      }}>
        <Icon style={{
          width: 16, height: 16,
          ...(status.is_running ? { animation: "spin 1s linear infinite" } : {}),
        }} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)" }}>
            {labelText}
          </span>
          <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
            {stageText}
          </span>
          {status.started_at && (
            <span style={{ fontSize: 11, color: "var(--color-text-muted)", fontVariantNumeric: "tabular-nums" }}>
              · {elapsed(status.is_running ? status.started_at : status.started_at)}
              {status.finished_at && !status.is_running && (
                <> 만에 완료</>
              )}
            </span>
          )}
        </div>
        {detailText && (
          <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 2 }}>
            {detailText}
          </div>
        )}
        {/* progress bar */}
        {status.is_running && progress !== null && (
          <div style={{
            marginTop: 6,
            width: "100%",
            height: 4,
            borderRadius: 99,
            background: "#f1f5f9",
            overflow: "hidden",
          }}>
            <div style={{
              width: `${Math.round(progress * 100)}%`,
              height: "100%",
              background: accent,
              transition: "width 0.4s ease",
            }} />
          </div>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
