import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { http } from "../../api/http";

type SectionType = "MATERIAL" | "LABOR" | "EXPENSE" | "OVERHEAD" | "PROFIT" | "MANUAL";

type EstimateLine = {
  id?: number;
  line_order?: number | null;
  name: string;
  spec?: string | null;
  unit?: string | null;
  qty?: number | null;
  unit_price?: number | null;
  amount?: number | null;
  memo?: string | null;
  calc_mode?: string | null;
  base_section_type?: SectionType | null;
};

type EstimateSection = {
  id?: number;
  section_type: SectionType;
  section_order: number;
  title?: string | null;
  subtotal?: number | null;
  lines: EstimateLine[];
};

type EstimateDetail = {
  id: number;
  business_state: "ONGOING" | "DONE" | "CANCELED";
  project_id: number;
  project_name: string;
  receiver_name: string;
  author_name: string;
  issue_date: string; // ISO
  subtotal: number;
  tax: number;
  total: number;
  sections: EstimateSection[];
  version_no?: number;
};

function sectionLabel(t: SectionType) {
  if (t === "MATERIAL") return "재료비";
  if (t === "LABOR") return "노무비";
  if (t === "EXPENSE") return "경비";
  if (t === "OVERHEAD") return "일반관리비";
  if (t === "PROFIT") return "이윤";
  return "수동";
}
function ymd(iso?: string) {
  if (!iso) return "-";
  const safe = String(iso).replace(" ", "T");
  const [dRaw, tRaw] = safe.split("T");
  const d = dRaw || "";
  const hhmm = (tRaw || "").slice(0, 5);
  const parts = d.split("-");
  const ymdOnly = parts.length === 3 ? `${parts[0]}-${parts[1]}-${parts[2]}` : d;
  return hhmm ? `${ymdOnly} ${hhmm}` : ymdOnly;
}
function money(n?: number | null) {
  return Number(n || 0).toLocaleString();
}

function readPrevChain(id: number): any[] {
  try {
    const raw = sessionStorage.getItem(`estimate_prev_chain_${id}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function EstimateDetailPage() {
  const { estimateId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<EstimateDetail | null>(null);

  // ✅ 구버전(최근 10개) – sessionStorage 기반
  const [prevChain, setPrevChain] = useState<any[]>([]);
  const [prevOpen, setPrevOpen] = useState(false);

  useEffect(() => {
    const id = Number(estimateId);
    if (!Number.isFinite(id) || id <= 0) {
      setError("잘못된 견적서 ID입니다.");
      setLoading(false);
      return;
    }

    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        setError(null);

        // ✅ 공통 http(axios) 사용: Authorization / credentials 처리가 프로젝트 표준대로 적용됨
        const res = await http.get(`/estimates/${id}`);
        if (!mounted) return;

        setData(res.data);
        // ✅ 상세 로드 후, 해당 id에 매핑된 구버전 체인 읽기
        try {
          const h = await http.get(`/estimates/${id}/history-details`, { params: { limit: 10 } });
          setPrevChain(Array.isArray(h.data) ? h.data : []);
        } catch {
          setPrevChain([]);
        }
      } catch (e: any) {
        if (!mounted) return;
        const status = e?.response?.status;
        const detailMsg = e?.response?.data?.detail;
        if (status === 401) {
          setError(
            `상세 조회 실패: 401 ${
              detailMsg ? JSON.stringify(e.response.data) : "인증이 필요합니다."
            }`
          );
        } else {
          setError(e?.message ?? "알 수 없는 오류");
        }
      } finally {
        if (!mounted) return;
        setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [estimateId]);

  const sections = useMemo(() => {
    const s = (data as any)?.sections ?? [];
    return [...s].sort((a: any, b: any) => (a.section_order ?? 0) - (b.section_order ?? 0));
  }, [data]);

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 900 }}>견적서 상세</div>
          <div style={{ fontSize: 12, color: "#94A3B8" }}>{data ? `#${data.id}` : ""}</div>
        </div>

        {/* ✅ 오른쪽 상단 버튼 순서: 목록으로 → 견적서 수정 → PDF/프린트 */}
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => navigate("/estimates")}
            style={{
              fontSize: 12,
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid #334155",
              background: "rgba(15,23,42,0.4)",
              color: "#F8FAFC",
              fontWeight: 900,
              cursor: "pointer",
            }}
          >
            목록으로
          </button>

          <button
            onClick={() => {
              if (!data?.id) return;
              navigate(`/estimates/${data.id}/edit`);
            }}
            disabled={!data?.id}
            style={{
              fontSize: 12,
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid #334155",
              background: "rgba(15,23,42,0.4)",
              color: "#F8FAFC",
              fontWeight: 900,
              cursor: data?.id ? "pointer" : "not-allowed",
              opacity: data?.id ? 1 : 0.6,
            }}
          >
            견적서 수정
          </button>

          <button
            onClick={() => window.print()}
            style={{
              fontSize: 12,
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid #1D4ED8",
              background: "linear-gradient(180deg, #2563EB 0%, #1D4ED8 100%)",
              color: "#F8FAFC",
              fontWeight: 900,
              cursor: "pointer",
            }}
          >
            PDF/프린트
          </button>
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        {loading ? (
          <div style={{ color: "#CBD5E1", padding: 12 }}>불러오는 중...</div>
        ) : error ? (
          <div style={{ color: "#FCA5A5", padding: 12 }}>{error}</div>
        ) : !data ? (
          <div style={{ color: "#CBD5E1", padding: 12 }}>데이터가 없습니다.</div>
        ) : (
          <div>
            <div style={{ marginBottom: 12, padding: 12, borderRadius: 14, border: "1px solid #1F2937" }}>
              <div style={{ fontWeight: 900, marginBottom: 6 }}>{data.project_name || "프로젝트"}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12, fontSize: 13, color: "#E2E8F0" }}>
                <div>수신: {data.receiver_name || "-"}</div>
                <div>작성자: {data.author_name || "-"}</div>
                <div>작성일: {ymd((data as any).issue_date || (data as any).created_at || (data as any).createdAt || (data as any).updated_at || (data as any).updatedAt)}</div>
              </div>
              <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 12, fontSize: 13 }}>
                <div>합계(공급가): <b>{money(data.subtotal)}원</b></div>
                <div>부가세: <b>{money(data.tax)}원</b></div>
                <div>총계: <b>{money(data.total)}원</b></div>
              </div>
            </div>

            {sections.length === 0 ? (
              <div style={{ color: "#CBD5E1", padding: 12 }}>섹션/항목이 없습니다.</div>
            ) : (
              sections.map((sec: any, idx: number) => (
                <div key={`${sec.section_type}-${sec.section_order}-${idx}`} style={{ marginBottom: 16 }}>
                  <div style={{ fontWeight: 900, marginBottom: 8 }}>
                    {idx + 1}. {sectionLabel(sec.section_type)}
                  </div>

                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "rgba(148,163,184,0.12)" }}>
                        <th style={{ textAlign: "left", padding: 8, fontSize: 12, color: "#E2E8F0" }}>번호</th>
                        <th style={{ textAlign: "left", padding: 8, fontSize: 12, color: "#E2E8F0" }}>항목</th>
                        <th style={{ textAlign: "left", padding: 8, fontSize: 12, color: "#E2E8F0" }}>규격</th>
                        <th style={{ textAlign: "left", padding: 8, fontSize: 12, color: "#E2E8F0" }}>단위</th>
                        <th style={{ textAlign: "right", padding: 8, fontSize: 12, color: "#E2E8F0" }}>수량</th>
                        <th style={{ textAlign: "right", padding: 8, fontSize: 12, color: "#E2E8F0" }}>단가</th>
                        <th style={{ textAlign: "right", padding: 8, fontSize: 12, color: "#E2E8F0" }}>금액</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(sec.lines || [])
                        .slice()
                        .sort((a: any, b: any) => (a.line_order ?? 0) - (b.line_order ?? 0))
                        .map((ln: any, i: number) => (
                          <tr key={`${ln.id ?? i}`} style={{ borderBottom: "1px solid #1F2937" }}>
                            <td style={{ padding: 8, fontSize: 12, color: "#CBD5E1" }}>{ln.line_order ?? i + 1}</td>
                            <td style={{ padding: 8, fontSize: 12, color: "#F8FAFC" }}>{ln.name}</td>
                            <td style={{ padding: 8, fontSize: 12, color: "#CBD5E1" }}>{ln.spec || ""}</td>
                            <td style={{ padding: 8, fontSize: 12, color: "#CBD5E1" }}>{ln.unit || ""}</td>
                            <td style={{ padding: 8, fontSize: 12, color: "#CBD5E1", textAlign: "right" }}>{ln.qty ?? ""}</td>
                            <td style={{ padding: 8, fontSize: 12, color: "#CBD5E1", textAlign: "right" }}>
                              {ln.unit_price != null ? money(ln.unit_price) : ""}
                            </td>
                            <td style={{ padding: 8, fontSize: 12, color: "#F8FAFC", textAlign: "right" }}>
                              {money(ln.amount)}
                            </td>
                          </tr>
                        ))}
                      <tr>
                        <td colSpan={6} style={{ padding: 8, fontSize: 12, color: "#CBD5E1", textAlign: "right" }}>
                          소계
                        </td>
                        <td style={{ padding: 8, fontSize: 12, color: "#F8FAFC", textAlign: "right", fontWeight: 900 }}>
                          {money(sec.subtotal ?? 0)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              ))
            )}

            {/* ✅ 이전 견적서(최근 10개) – 하단 표시 */}
            {prevChain.length > 0 && (
              <div style={{ marginTop: 18, paddingTop: 12, borderTop: "1px solid #1F2937" }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    marginBottom: 8,
                  }}
                >
                  <div style={{ fontWeight: 900 }}>이전 견적서(최근 10개)</div>
                  <button
                    onClick={() => setPrevOpen((v) => !v)}
                    style={{
                      fontSize: 12,
                      padding: "8px 10px",
                      borderRadius: 10,
                      border: "1px solid #334155",
                      background: "rgba(15,23,42,0.35)",
                      color: "#E2E8F0",
                      fontWeight: 900,
                      cursor: "pointer",
                    }}
                  >
                    {prevOpen ? "접기 ▲" : "보기 ▼"}
                  </button>
                </div>

                {prevOpen && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {prevChain.map((p: any, idx: number) => (
                      <details key={idx} style={{ border: "1px solid #334155", borderRadius: 14, overflow: "hidden" }}>
                        <summary
                          style={{
                            listStyle: "none",
                            cursor: "pointer",
                            padding: 12,
                            background: "rgba(251,191,36,0.08)",
                            color: "#F8FAFC",
                            fontWeight: 900,
                            display: "flex",
                            justifyContent: "space-between",
                            gap: 10,
                          }}
                        >
                          <span>
                            구버전 #{p?.id ?? "-"}{" "}
                            <span
                              style={{
                                marginLeft: 8,
                                fontSize: 11,
                                padding: "2px 8px",
                                borderRadius: 999,
                                border: "1px solid rgba(251,191,36,0.35)",
                                background: "rgba(251,191,36,0.10)",
                                color: "#FDE68A",
                              }}
                            >
                              읽기 전용
                            </span>
                          </span>
                          <span style={{ fontSize: 12, color: "#E2E8F0" }}>
                            {p?.total != null ? `${money(p.total)}원` : ""}
                          </span>
                        </summary>

                        <div style={{ padding: 12, background: "rgba(15,23,42,0.25)" }}>
                          <div style={{ fontSize: 12, color: "#CBD5E1", display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 10 }}>
                            <div>프로젝트: {p?.project_name || "-"}</div>
                            <div>수신: {p?.receiver_name || "-"}</div>
                            <div>작성자: {p?.author_name || "-"}</div>
                            <div>작성일: {ymd((p as any)?.issue_date || (p as any)?.created_at || (p as any)?.createdAt || (p as any)?.updated_at || (p as any)?.updatedAt)}</div>
                            <div>합계: <b style={{ color: "#F8FAFC" }}>{money(p?.subtotal)}원</b></div>
                            <div>부가세: <b style={{ color: "#F8FAFC" }}>{money(p?.tax)}원</b></div>
                            <div>총계: <b style={{ color: "#F8FAFC" }}>{money(p?.total)}원</b></div>
                          </div>

                          {Array.isArray(p?.sections) && p.sections.length > 0 ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                              {[...p.sections]
                                .sort((a: any, b: any) => (a.section_order ?? 0) - (b.section_order ?? 0))
                                .map((sec: any, sidx: number) => (
                                  <div key={`${sec.section_type}-${sec.section_order}-${sidx}`}>
                                    <div style={{ fontWeight: 900, marginBottom: 6, color: "#F8FAFC" }}>
                                      {sidx + 1}. {sectionLabel(sec.section_type)}
                                      <span style={{ marginLeft: 8, fontSize: 12, color: "#CBD5E1" }}>
                                        (소계 {money(sec?.subtotal)}원)
                                      </span>
                                    </div>

                                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                                      <thead>
                                        <tr style={{ background: "rgba(148,163,184,0.10)" }}>
                                          <th style={{ textAlign: "left", padding: 8, fontSize: 12, color: "#E2E8F0" }}>번호</th>
                                          <th style={{ textAlign: "left", padding: 8, fontSize: 12, color: "#E2E8F0" }}>항목</th>
                                          <th style={{ textAlign: "left", padding: 8, fontSize: 12, color: "#E2E8F0" }}>규격</th>
                                          <th style={{ textAlign: "left", padding: 8, fontSize: 12, color: "#E2E8F0" }}>단위</th>
                                          <th style={{ textAlign: "right", padding: 8, fontSize: 12, color: "#E2E8F0" }}>수량</th>
                                          <th style={{ textAlign: "right", padding: 8, fontSize: 12, color: "#E2E8F0" }}>단가</th>
                                          <th style={{ textAlign: "right", padding: 8, fontSize: 12, color: "#E2E8F0" }}>금액</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {([...((sec?.lines) || [])] as any[])
                                          .sort((a: any, b: any) => (a.line_order ?? 0) - (b.line_order ?? 0))
                                          .map((ln: any, i: number) => (
                                            <tr key={`${ln.id ?? i}`} style={{ borderBottom: "1px solid #1F2937" }}>
                                              <td style={{ padding: 8, fontSize: 12, color: "#CBD5E1" }}>{ln.line_order ?? i + 1}</td>
                                              <td style={{ padding: 8, fontSize: 12, color: "#F8FAFC" }}>{ln.name}</td>
                                              <td style={{ padding: 8, fontSize: 12, color: "#CBD5E1" }}>{ln.spec || ""}</td>
                                              <td style={{ padding: 8, fontSize: 12, color: "#CBD5E1" }}>{ln.unit || ""}</td>
                                              <td style={{ padding: 8, fontSize: 12, color: "#CBD5E1", textAlign: "right" }}>{ln.qty ?? ""}</td>
                                              <td style={{ padding: 8, fontSize: 12, color: "#CBD5E1", textAlign: "right" }}>
                                                {ln.unit_price != null ? money(ln.unit_price) : ""}
                                              </td>
                                              <td style={{ padding: 8, fontSize: 12, color: "#F8FAFC", textAlign: "right" }}>
                                                {money(ln.amount)}
                                              </td>
                                            </tr>
                                          ))}
                                      </tbody>
                                    </table>
                                  </div>
                                ))}
                            </div>
                          ) : (
                            <div style={{ fontSize: 12, color: "#CBD5E1" }}>구버전 내역(섹션/라인)이 없습니다.</div>
                          )}
                        </div>
                      </details>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
