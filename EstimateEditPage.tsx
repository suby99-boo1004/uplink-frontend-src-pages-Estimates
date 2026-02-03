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
          unit_price:
            l?.unit_price === null || l?.unit_price === undefined ? null : Number(l.unit_price),
          amount: l?.amount === null || l?.amount === undefined ? null : Number(l.amount),
          remark: l?.remark ?? null,
          calc_mode: l?.calc_mode ?? "NORMAL",
          base_section_type: l?.base_section_type ?? null,
          formula: l?.formula ?? null,
          source_type: l?.source_type ?? "NONE",
          source_id:
            l?.source_id === null || l?.source_id === undefined ? null : Number(l.source_id),
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
  const params = useParams();
  // ✅ 라우트 파라미터 이름이 환경에 따라 다를 수 있어(id / estimateId / estimate_id 모두 지원)
  const idParam =
    (params as any)?.id ?? (params as any)?.estimateId ?? (params as any)?.estimate_id ?? null;

  const estimateId = useMemo(() => Number(idParam || 0), [idParam]);

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
        e?.response?.data?.detail || e?.response?.data?.message || e?.message || "수정 저장에 실패했습니다.";
      alert(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ padding: 18 }}>
      <div style={{ fontSize: 18, fontWeight: 900, color: "#F8FAFC", marginBottom: 10 }}>
        견적서 수정
      </div>

      <div style={{ color: "#94A3B8", fontSize: 12, marginBottom: 12 }}>ID: {estimateId}</div>

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
          marginBottom: 12,
        }}
      >
        돌아가기
      </button>

      {state.status === "loading" && (
        <div style={{ color: "#E2E8F0", padding: 12 }}>불러오는 중...</div>
      )}

      {state.status === "error" && (
        <div style={{ color: "#FCA5A5", padding: 12, fontWeight: 900 }}>{state.message}</div>
      )}

      {state.status === "ready" && (
        <EstimateRegisterModal
          mode="edit"
          initial={state.initial}
          saving={saving}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  );
}
