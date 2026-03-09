import React, { useEffect, useMemo, useState , useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { http } from "../../api/http";
import companyInfoImg from "../../assets/company_info.png";

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
  memo?: string | null;
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

// 작성일(프린트) - 시간 제외
function ymdOnly(iso?: string) {
  if (!iso) return "-";
  const safe = String(iso).replace(" ", "T");
  const [dRaw] = safe.split("T");
  const d = dRaw || "";
  const parts = d.split("-");
  return parts.length === 3 ? `${parts[0]}-${parts[1]}-${parts[2]}` : d;
}

function money(n?: number | null) {
  const v = Number(n ?? 0);
  const safe = Number.isFinite(v) ? v : 0;
  return Math.floor(safe).toLocaleString();
}

function moneyFloat(n?: number | null) {
  const v = Number(n ?? 0);
  const safe = Number.isFinite(v) ? v : 0;
  return safe.toLocaleString();
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

  const printRef = useRef<HTMLDivElement | null>(null);

  function sanitizeFilenamePart(s: string) {
    return String(s || "")
      .trim()
      .replace(/[\/:*?"<>|]/g, "") // Windows forbidden
      .replace(/\s+/g, "_")
      .slice(0, 60);
  }

  async function downloadPdf() {
    if (!data) return;

    const dateStr = ymdOnly((data as any).issue_date || (data as any).created_at || (data as any).createdAt || (data as any).updated_at || (data as any).updatedAt).replace(/-/g, "");
    const receiver = sanitizeFilenamePart((data as any).receiver_name || "");
    const proj = sanitizeFilenamePart((data as any).project_name || "");
    const filename = `${dateStr}${receiver ? "_" + receiver : ""}${proj ? "_" + proj : ""}.pdf`;

    const el = printRef.current;
    if (!el) {
      alert("PDF 생성 영역을 찾을 수 없습니다.");
      return;
    }

    // 화면을 건드리지 않고 출력 스타일만 적용하기 위해 클래스 토글
    document.body.classList.add("pdf-export");
    try {
      const mod: any = await import("html2pdf.js");
      const html2pdf = mod?.default ?? mod;
      await html2pdf()
        .set({
          margin: [10, 10, 12, 10], // top, left, bottom, right (mm)
          filename,
          image: { type: "jpeg", quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true },
          jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
          pagebreak: { mode: ["css", "legacy"] },
        })
        .from(el)
        .save();
    } finally {
      document.body.classList.remove("pdf-export");
    }
  }


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
<div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 12 }}>
        <div />

        {/* ✅ 오른쪽 상단 버튼 순서: 목록으로 → 견적서 수정 → PDF/프린트 (인쇄 시 숨김) */}
        <div className="no-print" style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
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
            onClick={downloadPdf}
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
          <div ref={printRef} className="estimate-print">
            {/* ✅ PDF/출력에도 포함되는 문서 타이틀 */}
            <div style={{ textAlign: "center", fontSize: 35, fontWeight: 900, letterSpacing: 2, marginTop: 4, marginBottom: 10 }}>견  적  서</div>
            <div className="print-header-row" style={{ display: "flex", gap: 24, alignItems: "flex-start", justifyContent: "space-between" }}>
              <div className="print-header-left" style={{ flex: "0 0 58%", maxWidth: "58%" }}>
                {/* ✅ 문서 헤더: 견적서 명 */}
            <div style={{ marginTop: 14, marginBottom: 10, fontSize: 15 }}>
              <span style={{ fontWeight: 900 }}>🧾 견적서 명 :</span>{" "}<span style={{ fontWeight: 700 }}>{data.project_name || "-"}</span>
            </div>

            {/* ✅ 수신/작성자/작성일 + 합계/부가세/총계: 표 형식 */}
            <div style={{ border: "1px solid #D1D5DB", borderRadius: 8, overflow: "hidden", marginBottom: 16 }}>
            <table className="print-info-table" style={{ width: "100%", borderCollapse: "collapse" }}>
              <tbody>
                <tr>
                  <th style={{ border: "1px solid #D1D5DB", background: "#F3F4F6", padding: "10px 12px",  fontSize: 12, color: "#111827", fontWeight: 900, textAlign: "center", whiteSpace: "nowrap" }}>수 신</th>
                  <td style={{ border: "1px solid #D1D5DB", padding: "10px 12px", fontSize: 12 }}>{data.receiver_name || "-"}</td>
                  <th style={{ border: "1px solid #D1D5DB", background: "#F3F4F6", padding: "10px 12px", fontSize: 12, color: "#111827", fontWeight: 900, textAlign: "center", whiteSpace: "nowrap" }}>작성자</th>
                  <td style={{ border: "1px solid #D1D5DB", padding: "10px 12px", fontSize: 12 }}>{data.author_name || "-"}</td>
                </tr>
                <tr>
                  <th style={{ border: "1px solid #D1D5DB", background: "#F3F4F6", padding: "10px 12px", fontSize: 12, color: "#111827", fontWeight: 900, textAlign: "center", whiteSpace: "nowrap" }}>작 성 일</th>
                  <td colSpan={3} style={{ border: "1px solid #D1D5DB", padding: "10px 12px", fontSize: 12 }}>{ymdOnly((data as any).issue_date || (data as any).created_at || (data as any).createdAt || (data as any).updated_at || (data as any).updatedAt)}</td>
                </tr>
                <tr>
                  <th style={{ border: "1px solid #D1D5DB", background: "#F3F4F6", padding: "10px 12px", fontSize: 12, color: "#111827", fontWeight: 900, textAlign: "center", whiteSpace: "nowrap" }}>합 계</th>
                  <td style={{ border: "1px solid #D1D5DB", padding: "10px 12px", fontSize: 12 }}>{money(data.subtotal)}원</td>
                  <th style={{ border: "1px solid #D1D5DB", background: "#F3F4F6", padding: "10px 12px", fontSize: 12, color: "#111827", fontWeight: 900, textAlign: "center", whiteSpace: "nowrap" }}>부 가 세</th>
                  <td style={{ border: "1px solid #D1D5DB", padding: "10px 12px", fontSize: 12 }}>{money(data.tax)}원</td>
                </tr>
                <tr>
                  <th style={{ border: "1px solid #D1D5DB", background: "#F3F4F6", padding: "10px 12px", fontSize: 12, color: "#111827", fontWeight: 900, textAlign: "center", whiteSpace: "nowrap" }}>총 계</th>
                  <td colSpan={3} style={{ border: "1px solid #D1D5DB", padding: "10px 12px", fontSize: 12 }}>{money(data.total)}원</td>
                </tr>
              </tbody>
            </table>
            </div>

            <div style={{ marginTop: -8, marginBottom: 14, fontSize: 12, fontWeight: 700 }}>
              * 견적 유효 기간 : 30일
            </div>
              </div>
              {/* ✅ 회사 정보 이미지(프린트 전용) - 표 오른쪽 */}
              <div className="print-only print-header-right" style={{ flex: "0 0 40%", maxWidth: "45%", display: "flex", justifyContent: "flex-end", paddingRight: 24, paddingLeft: 8, boxSizing: "border-box", overflow: "visible" }}>
                <img src={companyInfoImg} alt="회사 정보" style={{ maxWidth: "100%", height: "auto", objectFit: "contain", display: "block" }} />
              </div>
            </div>

            {sections.length === 0 ? (
              <div style={{ color: "#CBD5E1", padding: 12 }}>섹션/항목이 없습니다.</div>
            ) : (
              sections.map((sec: any, idx: number) => (
                <div className="print-avoid-break" key={`${sec.section_type}-${sec.section_order}-${idx}`} style={{ marginBottom: 16 }}>
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
			
			<div className="print-memo-title" style={{ fontSize: 12, fontWeight: 900, marginBottom: 6 }}>비고 내용</div>
			
			{/* ✅ 비고(헤더 메모) – 저장 후 하단 표시 */}
            {((data as any)?.memo ?? "").trim() ? (
              <div
                className="print-memo-box"
                style={{
                  marginTop: 18,
                  padding: 12,
                  borderRadius: 12,
                  border: "1px solid #cccccc",
                  background: "#ffffff",
                }}
              >
                
                <div style={{ fontSize: 13, color: "#000000", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                  {(data as any).memo}
                </div>
              </div>
            ) : null}
			
			
			
			

            {/* ✅ 이전 견적서(최근 10개) – 하단 표시 */}
            {prevChain.length > 0 && (
              <div className="no-print" style={{ marginTop: 18, paddingTop: 12, borderTop: "1px solid #1F2937" }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    marginBottom: 8,
                  }}
                >
                  <div style={{ fontWeight: 900 }}>이전 견적서({prevChain.length}/10)</div>
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
                            구버전 - {ymd((p as any)?.issue_date || (p as any)?.created_at || (p as any)?.createdAt || (p as any)?.updated_at || (p as any)?.updatedAt)}{" "}
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
