import { Sparkles, AlertTriangle, GitBranch, Wrench, Languages } from "lucide-react";

export type ArcaAnalysis = {
  verdict?: string;
  practical_value?: string;
  lineage_thought?: string;
  translation?: string;
  warning?: string;
  category?: string;
};

type Props = {
  analysis: ArcaAnalysis | null;
};

function Section({
  icon: Icon,
  label,
  children,
  tone = "default",
}: {
  icon: React.ElementType;
  label: string;
  children: React.ReactNode;
  tone?: "default" | "warning";
}) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-4">
      <div
        className={`flex items-center gap-2 text-[10px] font-semibold uppercase mb-2 ${
          tone === "warning" ? "text-amber-400" : "text-brand-400"
        }`}
      >
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="text-sm text-neutral-200 leading-relaxed whitespace-pre-wrap">
        {children}
      </div>
    </div>
  );
}

export default function ArcaPanel({ analysis }: Props) {
  if (!analysis) return null;

  const {
    verdict,
    practical_value,
    lineage_thought,
    translation,
    warning,
  } = analysis;

  const hasAny =
    verdict || practical_value || lineage_thought || translation || warning;
  if (!hasAny) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 rounded-full border border-brand-500/40 bg-brand-500/10 px-3 py-1">
          <Sparkles className="h-3.5 w-3.5 text-brand-300" />
          <span className="text-xs font-semibold text-brand-200">
            아르카의 분석
          </span>
        </div>
        <span className="text-[10px] text-neutral-500">
          Gemma 4 26B · 천재미소녀 연구원 페르소나
        </span>
      </div>

      {verdict && (
        <div className="rounded-xl border border-brand-500/30 bg-gradient-to-br from-brand-500/10 to-transparent p-5">
          <p className="text-base font-semibold text-neutral-100 leading-snug">
            {verdict}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {practical_value && (
          <Section icon={Wrench} label="실무 가치">
            {practical_value}
          </Section>
        )}

        {lineage_thought && (
          <Section icon={GitBranch} label="기술 계보">
            {lineage_thought}
          </Section>
        )}
      </div>

      {translation && (
        <Section icon={Languages} label="초록 번역">
          {translation}
        </Section>
      )}

      {warning && (
        <Section icon={AlertTriangle} label="경고" tone="warning">
          {warning}
        </Section>
      )}
    </section>
  );
}
