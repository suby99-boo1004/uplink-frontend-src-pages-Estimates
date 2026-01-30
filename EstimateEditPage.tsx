import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import EstimateRegisterModal, { DraftEstimateCreatePayload } from "./Components/EstimateRegisterModal";
import { http } from "../../api/http";

type LoadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; initial: DraftEstimateCreatePayload };

function normalizeInitial(raw: any): DraftEstimateCreatePayload {
  const sections = Array.isArray(raw?.sections) ? raw.sections : [];
  return {
    project_id: Number(raw?.project_id || raw?.project?.id || 0),
    title: raw?.title ?? null,
    receiver_name: raw?.receiver_name ?? null,
    memo: raw?.memo ?? null,
    sections: sections
      .map((s: any) => ({
        section_order: Number(s?.section_order ?? 0),
        section_type: s?.section_type,
        title: s?.title ?? "",
        lines: (Array.isArray(s?.lines) ? s.lines : []).map((l: any) => ({
          line_order: Number(l?.line_order ?? 0),
          name: l?.name ?? "",
          spec: l?.spec ?? null,
          unit: l?.unit ?? "",
          qty: Number(l?.qty ?? 0),
          unit_price: l?.unit_price === null || l?.unit_price === undefined ? null : Number(l.unit_price),
          amount: l?.amount === null || l?.amount === undefined ? null : Number(l.amount),
          remark: l?.remark ?? null,
          calc_mode: l?.calc_mode ?? "NORMAL",
          base_section_type: l?.base_section_type ?? null,
          formula: l?.formula ?? null,
          source_type: l?.source_type ?? "NONE",
          source_id: l?.source_id === null || l?.source_id === undefined ? null : Number(l.source_id),
          price_type: l?.price_type ?? null,
        })),
      }))
      .sort((a: any, b: any) => (a.section_order || 0) - (b.section_order || 0))
      .map((s: any) => ({
        ...s,
        lines: (s.lines || []).sort((a: any, b: any) => (a.line_order || 0) - (b.line_order || 0)),
      })),
  };
}

function readChain(id: number): any[] {
  try {
    const raw = sessionStorage.getItem(`estimate_prev_chain_${id}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeChain(id: number, chain: any[]) {
  try {
    sessionStorage.setItem(`estimate_prev_chain_${id}`, JSON.stringify(chain.slice(0, 10)));
  } catch {
    // ignore
  }
}

export default function EstimateEditPage() {
  const { id } = useParams();
  const estimateId = useMemo(() => Number(id || 0), [id]);
  const nav = useNavigate();

  const [saving, setSaving] = useState(false);
  const [state, setState] = useState<LoadState>({ status: "idle" });
  const [rawDetail, setRawDetail] = useState<any>(null);

  useEffect(() => {
    if (!estimateId) {
      setState({ status: "error", message: "견적서 ID가 올바르지 않습니다." });
      return;
    }
    let alive = true;
    (async () => {
      try {
        setState({ status: "loading" });
        const res = await http.get(`/estimates/${estimateId}`);
        const initial = normalizeInitial(res.data);
        if (!alive) return;
        setRawDetail(res.data);
        setState({ status: "ready", initial });
      } catch (e: any) {
        if (!alive) return;
        const msg =
          e?.response?.data?.detail ||
          e?.response?.data?.message ||
          e?.message ||
          "견적서 불러오기에 실패했습니다.";
        setState({ status: "error", message: msg });
      }
    })();
    return () => {
      alive = false;
    };
  }, [estimateId]);

  async function handleSubmit(payload: DraftEstimateCreatePayload) {
    if (!estimateId) return;
    setSaving(true);
    try {
      const res = await http.put(`/estimates/${estimateId}`, payload);
      const body = res.data;
      const newId = Number(body?.estimate_id || body?.id || body?.estimateId || 0) || estimateId;

      // ✅ 수정 전 견적서(구버전) 저장: 신규 id에 매핑해서 상세에서 바로 보이게
      const base = readChain(newId);
      const snapshot = rawDetail || { id: estimateId, ...payload };
      const merged = [snapshot, ...base].slice(0, 10);
      writeChain(newId, merged);

      nav(`/estimates/${newId}`);
    } catch (e: any) {
      const msg =
        e?.response?.data?.detail ||
        e?.response?.data?.message ||
        e?.message ||
        "수정 저장에 실패했습니다.";
      alert(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <div style={{ fontSize: 18, fontWeight: 900 }}>견적서 수정</div>
          <div style={{ fontSize: 12, color: "#94A3B8" }}>ID: {estimateId}</div>
        </div>

        <button
          onClick={() => nav(`/estimates/${estimateId}`)}
          style={{
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid #334155",
            background: "rgba(15,23,42,0.4)",
            color: "#E2E8F0",
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          돌아가기
        </button>
      </div>

      {state.status === "loading" && <div style={{ color: "#CBD5E1", padding: 12 }}>불러오는 중...</div>}
      {state.status === "error" && <div style={{ color: "#FCA5A5", padding: 12 }}>{state.message}</div>}

      {state.status === "ready" && (
        <EstimateRegisterModal
          saving={saving}
          mode="update"
          initial={state.initial}
          submitLabel="수정 저장(신규 버전 생성)"
          onSubmit={handleSubmit}
        />
      )}
    </div>
  );
}
