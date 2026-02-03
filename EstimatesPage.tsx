import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../lib/auth";
import { http } from "../../api/http";

export type EstimateStatus = "ongoing" | "done" | "canceled";

type DraftEstimate = {
  project?: { id: number; name: string } | null;
  manualTitle?: string;
  receiver?: string;
  manager?: string;
  totalAmount?: number;
};

export type EstimateRow = {
  id: number;
  status: EstimateStatus;
  projectId: number | null;
  title: string;
  receiver: string;
  manager: string;
  createdAt: string;
  updatedAt: string;
  totalAmount: number;
};

function statusLabel(s: EstimateStatus) {
  if (s === "ongoing") return "현재 진행중";
  if (s === "done") return "사업완료";
  return "사업취소";
}

function fmtParts(iso?: string) {
  if (!iso) return { date: "", time: "" };
  // iso could be 'YYYY-MM-DDTHH:MM:SS...' or 'YYYY-MM-DD HH:MM:SS...+09:00'
  const safe = String(iso).replace(" ", "T");
  const [dRaw, tRaw] = safe.split("T");
  const d = dRaw || "";
  const hhmm = (tRaw || "").slice(0, 5);
  const parts = d.split("-");
  const date = parts.length === 3 ? `${parts[0]}-${parts[1]}-${parts[2]}` : d;
  return { date, time: hhmm };
}

export default function EstimatesPage() {
  const { user } = useAuth() as any;
  const roleId: number | null = (user as any)?.role_id ?? null;

  const canManage = Boolean(user);
  const isAdmin = Number(roleId) === 6;

  const navigate = useNavigate();
  const location = useLocation();

  // 1) 상태는 Select 하나로
  const [status, setStatus] = useState<EstimateStatus>("ongoing");
  // 2) 사업완료/취소 선택 시에만 년도 선택
  const [year, setYear] = useState<number | "">("");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<EstimateRow[]>([]);
  const debounceRef = useRef<number | null>(null);

  // 서버에서 을 불러와서(영구 저장) 화면에 표시
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await http.get("/estimates");
        const data = (res as any)?.data ?? res;
        const list: any[] = Array.isArray(data) ? data : data?.items ?? data?.rows ?? [];
        const mapped: EstimateRow[] = list
          .map((r: any) => {
            const bs = String(r?.business_state ?? r?.status ?? "ONGOING").toUpperCase();
            const st: EstimateStatus =
              bs === "DONE" ? "done" : bs === "CANCELED" ? "canceled" : "ongoing";

            const createdAt =
              r?.issue_date ??
              r?.created_at ??
              r?.createdAt ??
              r?.updated_at ??
              new Date().toISOString();

            const updatedAt = r?.updated_at ?? r?.updatedAt ?? createdAt;

            const title = r?.title ?? r?.title ?? r?.name ?? "견적서";
            const receiver = r?.receiver_name ?? r?.receiver ?? "-";
            const manager = r?.author_name ?? r?.manager ?? r?.created_by_name ?? "-";
            const totalAmount = Number(r?.total ?? r?.total_amount ?? r?.totalAmount ?? 0);

            return {
              id: Number(r?.id ?? 0),
              status: st,
              projectId: r?.project_id ?? r?.projectId ?? null,
              title,
              receiver,
              manager,
              createdAt,
              updatedAt,
              totalAmount,
            };
          })
          .filter((r) => Number.isFinite(r.id) && r.id > 0);

        if (!mounted) return;
        setRows(mapped);
      } catch (e) {
        // 목록 로딩 실패 시에는 기존 로컬 rows 유지(빈 화면 방지)
        console.error(e);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const availableYears = useMemo(() => {
    if (status === "ongoing") return [] as number[];
    const ys = new Set<number>();
    for (const r of rows) {
      if (r.status !== status) continue;
      const y = new Date(r.updatedAt).getFullYear();
      if (Number.isFinite(y)) ys.add(y);
    }
    const arr = Array.from(ys).sort((a, b) => b - a);
    const cy = new Date().getFullYear();
    if (!arr.includes(cy)) arr.unshift(cy);
    return arr;
  }, [rows, status]);

  useEffect(() => {
    if (status === "ongoing") {
      if (year !== "") setYear("");
      return;
    }
    if (year === "" && availableYears.length > 0) setYear(availableYears[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, availableYears]);

  const filtered = useMemo(() => {
    const qq = (q || "").trim().toLowerCase();
    return rows
      .filter((r) => r.status === status)
      .filter((r) => {
        if (status === "ongoing") return true;
        if (year === "" || year === null) return true;
        const y = new Date(r.updatedAt).getFullYear();
        return y === Number(year);
      })
      .filter((r) => {
        if (!qq) return true;
        return (
          (r.title || "").toLowerCase().includes(qq) ||
          (r.receiver || "").toLowerCase().includes(qq) ||
          (r.manager || "").toLowerCase().includes(qq)
        );
      })
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  }, [q, rows, status, year]);

  function onQChange(v: string) {
    setQ(v);
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => setQ((prev) => prev), 200);
  }

  const onCreateDraft = React.useCallback(
    (draft: DraftEstimate) => {
      const now = new Date().toISOString();
      const newRow: EstimateRow = {
        id: Math.max(0, ...rows.map((r) => r.id)) + 1,
        status: "ongoing",
        projectId: draft.project?.id ?? null,
        title: draft.project?.name || draft.manualTitle || "견적서",
        receiver: draft.receiver || "-",
        manager: draft.manager || (user?.name ?? "-"),
        createdAt: now,
        updatedAt: now,
        totalAmount: Number(draft.totalAmount || 0),
      };
      setRows((prev) => [newRow, ...prev]);
    },
    [rows, user]
  );

  // 신규 등록 페이지에서 돌아올 때 state로 draftEstimate 전달받아 로컬 추가
  useEffect(() => {
    const st: any = location.state as any;
    const draftFromNew = st?.draftEstimate as DraftEstimate | undefined;
    if (draftFromNew) {
      onCreateDraft(draftFromNew);
      // 뒤로가기 중복 추가 방지
      navigate(location.pathname, { replace: true, state: {} });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onDeleteRow(e: React.MouseEvent, id: number) {
    e.stopPropagation();
    if (!isAdmin) return;
    const ok = window.confirm("정말 삭제하시겠습니까?\n(구견적서 포함 전체 삭제, 복구 불가)");
    if (!ok) return;

    try {
      await http.delete(`/estimates/${id}`);
      setRows((prev) => prev.filter((r) => r.id !== id));
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err?.message || "삭제에 실패했습니다.";
      alert(msg);
    }
  }

  // ✅ 관리자만 '삭제' 컬럼을 보여줌(비관리자는 '-' 표시도 없앰)
  const gridTemplateColumns = isAdmin
    ? "120px 1fr 220px 160px 160px 90px"
    : "120px 1fr 220px 160px 160px";

  return (
    <div style={{ padding: 18 }}>
      <div style={{ fontSize: 18, fontWeight: 900, color: "#F8FAFC", marginBottom: 14 }}>견적서</div>

      <div
        style={{
          display: "flex",
          gap: 10,
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ color: "#CBD5E1", fontWeight: 800 }}>견적서 리스트</div>

          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as EstimateStatus)}
            style={{
              fontSize: 12,
              padding: "8px 10px",
              borderRadius: 10,
              border: "1px solid #334155",
              background: "rgba(15,23,42,0.35)",
              color: "#F8FAFC",
              outline: "none",
              cursor: "pointer",
            }}
          >
            {(["ongoing", "done", "canceled"] as EstimateStatus[]).map((s) => (
              <option key={s} value={s}>
                {statusLabel(s)}
              </option>
            ))}
          </select>

          {status !== "ongoing" && (
            <select
              value={year}
              onChange={(e) => setYear(e.target.value ? Number(e.target.value) : "")}
              style={{
                fontSize: 12,
                padding: "8px 10px",
                borderRadius: 10,
                border: "1px solid #334155",
                background: "rgba(15,23,42,0.35)",
                color: "#F8FAFC",
                outline: "none",
                cursor: "pointer",
                minWidth: 110,
              }}
            >
              {availableYears.map((y) => (
                <option key={y} value={y}>
                  {y}년
                </option>
              ))}
            </select>
          )}

          <input
            value={q}
            onChange={(e) => onQChange(e.target.value)}
            placeholder="검색 (건명/수신/담당자)"
            style={{
              padding: "10px 12px",
              minWidth: 320,
              borderRadius: 12,
              border: "1px solid #334155",
              background: "rgba(15,23,42,0.4)",
              color: "#F8FAFC",
              outline: "none",
            }}
          />
        </div>

        {canManage && (
          <button
            onClick={() => navigate("/estimates/new")}
            style={{
				width: 130,
              height: 40,
              fontSize: 16,
              padding: "10px 12px",
              borderRadius: 12,
			  fontWeight: 900,
              border: "1px solid #1D4ED8",
              background: "linear-gradient(180deg, #2563EB 0%, #1D4ED8 100%)",
              color: "#F8FAFC",
              cursor: "pointer",
            }}
          >
            + 신규 등록
          </button>
        )}
      </div>

      <div style={{ color: "#94A3B8", fontSize: 12, marginBottom: 10 }}></div>

      <div style={{ color: "#F8FAFC", fontWeight: 900, marginBottom: 10 }}></div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns,
          gap: 0,
          padding: "10px 12px",
          borderRadius: 12,
          border: "1px solid rgba(148,163,184,0.18)",
          background: "rgba(15,23,42,0.35)",
          color: "#E2E8F0",
          fontWeight: 900,
        }}
      >
        <div>날짜</div>
        <div>건명</div>
        <div>수신(발주처)</div>
        <div>견적 담당자</div>
        <div style={{ textAlign: "right" }}>합계(원)</div>
        {isAdmin && <div style={{ textAlign: "center" }}>삭제</div>}
      </div>

      {filtered.length === 0 ? (
        <div style={{ padding: 18, color: "#CBD5E1" }}>
          <div style={{ fontWeight: 900, marginBottom: 6 }}>표시할 견적서가 없습니다.</div>
          <div style={{ fontSize: 12 }}>
            {canManage ? "상단의 ‘신규 등록’으로 견적서를 만들어보세요." : "권한이 없어 신규 등록이 불가합니다."}
          </div>
        </div>
      ) : (
        filtered.map((r) => {
          const parts = fmtParts(r.createdAt || r.updatedAt);
          return (
            <div
              key={r.id}
              onClick={() => navigate(`/estimates/${r.id}`)}
              style={{
                display: "grid",
                gridTemplateColumns,
                gap: 0,
                padding: "10px 12px",
                borderTop: "1px solid rgba(148,163,184,0.15)",
                cursor: "pointer",
                alignItems: "center",
              }}
            >
              <div>
                <div>{parts.date}</div>
                <div style={{ fontSize: 12, color: "#94A3B8" }}>{parts.time}</div>
              </div>

              <div style={{ fontWeight: 900, color: "#F8FAFC" }}>{r.title}</div>
              <div>{r.receiver}</div>
              <div>{r.manager}</div>
              <div style={{ textAlign: "right", fontWeight: 900 }}>
                {Number(r.totalAmount || 0).toLocaleString()}
              </div>

              {isAdmin && (
                <div style={{ textAlign: "center" }}>
                  <button
                    onClick={(e) => onDeleteRow(e, r.id)}
                    style={{
                      fontSize: 12,
                      padding: "8px 10px",
                      borderRadius: 10,
                      border: "1px solid rgba(239,68,68,0.55)",
                      background: "rgba(239,68,68,0.12)",
                      color: "#FCA5A5",
                      fontWeight: 900,
                      cursor: "pointer",
                    }}
                  >
                    삭제
                  </button>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
