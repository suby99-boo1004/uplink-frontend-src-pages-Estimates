import React, { useEffect, useMemo, useRef, useState } from "react";
import { fetchProducts } from "../../../api/products.api";
import { fetchDepartments, fetchProjects, type ProjectStatus } from "../../../api/projects.api";
import { http } from "../../../api/http";
import { Product } from "../../../types/products";

export type SectionType = "MATERIAL" | "LABOR" | "EXPENSE" | "OVERHEAD" | "PROFIT" | "MANUAL";
export type CalcMode = "NORMAL" | "PERCENT_OF_SUBTOTAL" | "FORMULA";
export type PriceType = "DESIGN" | "CONSUMER" | "SUPPLY" | "MANUAL";

export type DraftLine = {
  id: string;
  line_order: number;
  name: string;
  spec?: string;
  unit: string;
  qty: number;
  unit_price?: number | null;
  amount?: number | null;
  remark?: string;

  calc_mode: CalcMode;
  base_section_type?: SectionType | null;
  formula?: string | null;

  source_type?: "PRODUCT" | "LABOR_ITEM" | "NONE";
  source_id?: number | null;
  // 제품 선택 시 원본 제품 데이터를 보관(단가종류 변경 시 단가 재계산용). payload에는 포함되지 않음
  source_product?: any;
  price_type?: PriceType | null;
};

export type DraftSection = {
  id: string;
  section_order: number;
  section_type: SectionType;
  title: string;
  lines: DraftLine[];
};

export type DraftEstimateCreatePayload = {
  project_id: number;
  title?: string | null;
  receiver_name?: string | null;
  memo?: string | null;
  sections: Array<{
    section_order: number;
    section_type: SectionType;
    title: string;
    lines: Array<{
      line_order: number;
      name: string;
      spec?: string | null;
      unit: string;
      qty: number;
      unit_price?: number | null;
      amount?: number | null;
      remark?: string | null;
      calc_mode: CalcMode;
      base_section_type?: SectionType | null;
      formula?: string | null;
      source_type?: "PRODUCT" | "LABOR_ITEM" | "NONE";
      source_id?: number | null;
      price_type?: PriceType | null;
    }>;
  }>;
};

type DraftProject = { id: number; name: string; clientName?: string };
const DISPLAY_STATUSES: ProjectStatus[] = ["PLANNING", "IN_PROGRESS", "ON_HOLD"];

function nextId(prefix: string) {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}
function money(n: number) {
  return Number(n || 0).toLocaleString();
}
function titleOfSection(t: SectionType) {
  if (t === "MATERIAL") return "재료비";
  if (t === "LABOR") return "노무비";
  if (t === "EXPENSE") return "경비";
  if (t === "OVERHEAD") return "일반관리비";
  if (t === "PROFIT") return "이윤";
  return "수동";
}
function priceLabel(p: PriceType) {
  if (p === "DESIGN") return "설계가";
  if (p === "CONSUMER") return "소보수가";
  if (p === "SUPPLY") return "납품가";
  return "수동";
}
function getProductPrice(prod: any, pt: PriceType) {
  // 제품(자재관리)의 실제 컬럼명은 프로젝트에 따라 다를 수 있어 여러 후보를 순서대로 탐색
  const pick = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0);

  if (pt === "DESIGN") {
    return pick(
      prod?.price_design ??
        prod?.design_price ??
        prod?.price_plan ??
        prod?.plan_price ??
        prod?.price1 ??
        0
    );
  }

  if (pt === "CONSUMER") {
	  return pick(
  prod?.price_small ?? 
  prod?.price_smal ?? 
  prod?.price_consumer ?? 
  prod?.price_repair ?? 
  prod?.price2 ?? 0);
  }

  if (pt === "SUPPLY") {
    return pick(
      prod?.price_supply ??
        prod?.supply_price ??
        prod?.price_delivery ??
        prod?.delivery_price ??
        prod?.price3 ??
        0
    );
  }

  return 0;
}
type ProductPickModalProps = {
  open: boolean;
  onClose: () => void;
  onPick: (p: Product) => void;
};

function ProductPickModal({ open, onClose, onPick }: ProductPickModalProps) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<number | null>(null);

  async function load(search: string) {
    setLoading(true);
    try {
      const data = await fetchProducts({ q: (search || "").trim() });
      setRows(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    setQ("");
    load("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      load(q);
    }, 250);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, open]);

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        zIndex: 50,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 980,
          maxWidth: "100%",
          background: "linear-gradient(180deg, #0B1220 0%, #050814 100%)",
          borderRadius: 16,
          padding: 16,
          color: "#F9FAFB",
          border: "1px solid #334155",
          boxShadow: "0 18px 60px rgba(0,0,0,0.55)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 900 }}>제품 선택(자재관리)</h3>
          <button
            onClick={onClose}
            style={{
              marginLeft: "auto",
              fontSize: 12,
              padding: "8px 10px",
              borderRadius: 10,
              border: "1px solid #374151",
              background: "#0B1220",
              color: "#E5E7EB",
              cursor: "pointer",
            }}
          >
            닫기
          </button>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="제품 검색(항목/구분/모델명/규격/비고)"
            style={{
              flex: 1,
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid #334155",
              background: "rgba(15,23,42,0.4)",
              color: "#F8FAFC",
              outline: "none",
            }}
          />
          <div style={{ fontSize: 12, color: "#94A3B8" }}>{loading ? "로딩중..." : `${rows.length}건`}</div>
        </div>

        <div style={{ border: "1px solid #1F2937", borderRadius: 12, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "rgba(15,23,42,0.8)", color: "#F8FAFC" }}>
                <th style={{ padding: "10px 12px", textAlign: "left" }}>항목</th>
                <th style={{ padding: "10px 12px", textAlign: "left" }}>구분</th>
                <th style={{ padding: "10px 12px", textAlign: "left" }}>모델명</th>
                <th style={{ padding: "10px 12px", textAlign: "left" }}>규격</th>
                <th style={{ padding: "10px 12px", textAlign: "right" }}>납품가(참고)</th>
                <th style={{ padding: "10px 12px" }} />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={(r as any).id} style={{ borderTop: "1px solid rgba(148,163,184,0.15)" }}>
                  <td style={{ padding: "10px 12px" }}>{(r as any).item_name || ""}</td>
                  <td style={{ padding: "10px 12px" }}>{(r as any).category_name || ""}</td>
                  <td style={{ padding: "10px 12px", fontWeight: 800 }}>{(r as any).name || ""}</td>
                  <td style={{ padding: "10px 12px" }}>{(r as any).spec || ""}</td>
                  <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 900 }}>
                    {money(Number((r as any).price_delivery || (r as any).price_supply || 0))}
                  </td>
                  <td style={{ padding: "10px 12px", textAlign: "right" }}>
                    <button
                      type="button"
                      onClick={() => onPick(r)}
                      style={{
                        fontSize: 12,
                        padding: "8px 10px",
                        borderRadius: 10,
                        border: "1px solid #1D4ED8",
                        background: "linear-gradient(180deg, #2563EB 0%, #1D4ED8 100%)",
                        color: "#F8FAFC",
                        fontWeight: 900,
                        cursor: "pointer",
                      }}
                    >
                      추가
                    </button>
                  </td>
                </tr>
              ))}

              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding: 14, color: "#94A3B8" }}>
                    데이터가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 10, fontSize: 11, color: "#93C5FD" }}>
          ※ 제품 추가 후, 견적서에서 단가(설계가/소보수가/납품가)를 선택할 수 있습니다.
        </div>
      </div>
    </div>
  );
}

type Props = {
  saving: boolean;
  onSubmit: (payload: DraftEstimateCreatePayload) => void;
  mode?: "create" | "update";
  initial?: DraftEstimateCreatePayload | null;
  submitLabel?: string;
};

function compute(sections: DraftSection[]) {
  // 1) 정상 라인 금액
  const clone: DraftSection[] = sections.map((s) => ({
    ...s,
    lines: s.lines.map((l) => ({ ...l })),
  }));

  const subtotalByType: Record<SectionType, number> = {
    MATERIAL: 0,
    LABOR: 0,
    EXPENSE: 0,
    OVERHEAD: 0,
    PROFIT: 0,
    MANUAL: 0,
  };

  // NORMAL 먼저
  for (const sec of clone) {
    for (const line of sec.lines) {
      if (line.calc_mode !== "NORMAL") continue;
      const qty = Number(line.qty || 0);
      const up = Number(line.unit_price || 0);
      line.amount = Math.round(qty * up);
    }
    const sub = sec.lines.reduce((a, b) => a + Number(b.amount || 0), 0);
    subtotalByType[sec.section_type] = Math.round(sub);
  }

  // PERCENT_OF_SUBTOTAL
  for (const sec of clone) {
    for (const line of sec.lines) {
      if (line.calc_mode !== "PERCENT_OF_SUBTOTAL") continue;
      const base = line.base_section_type ? subtotalByType[line.base_section_type] : 0;
      const pct = Number(line.qty || 0) / 100.0;
      line.unit_price = null;
      line.amount = Math.round(base * pct);
    }
    subtotalByType[sec.section_type] = Math.round(sec.lines.reduce((a, b) => a + Number(b.amount || 0), 0));
  }

  // FORMULA (샘플 2종만 지원: (MATERIAL+LABOR)*0.06 / (LABOR+EXPENSE+OVERHEAD)*0.15)
  const sum = (types: SectionType[]) => types.reduce((a, t) => a + (subtotalByType[t] || 0), 0);

  for (const sec of clone) {
    for (const line of sec.lines) {
      if (line.calc_mode !== "FORMULA") continue;
      const f = (line.formula || "").replaceAll(" ", "");
      let val = 0;
      if (f.includes("MATERIAL+LABOR") && f.includes("*0.06")) {
        val = sum(["MATERIAL", "LABOR"]) * 0.06;
      } else if (f.includes("LABOR+EXPENSE+OVERHEAD") && f.includes("*0.15")) {
        val = sum(["LABOR", "EXPENSE", "OVERHEAD"]) * 0.15;
      } else {
        // fallback: base_section_type만 있으면 %로 처리
        const base = line.base_section_type ? subtotalByType[line.base_section_type] : 0;
        val = base * (Number(line.qty || 0) / 100.0);
      }
      line.unit_price = null;
      line.amount = Math.round(val);
    }
    subtotalByType[sec.section_type] = Math.round(sec.lines.reduce((a, b) => a + Number(b.amount || 0), 0));
  }

  const subtotal = Object.values(subtotalByType).reduce((a, b) => a + b, 0);
  const tax = Math.round(subtotal * 0.1);
  const total = subtotal + tax;

  return { sections: clone, subtotalByType, subtotal, tax, total };
}

export default function EstimateRegisterModal({ saving, onSubmit, mode = "create", initial = null, submitLabel }: Props) {
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [projectOptions, setProjectOptions] = useState<DraftProject[]>([]);
  const [project, setProject] = useState<DraftProject | null>(null);

  const [title, setTitle] = useState(() => (initial?.title ? String(initial.title) : ""));
  const [receiverName, setReceiverName] = useState(() => (initial?.receiver_name ? String(initial.receiver_name) : ""));
  const [memo, setMemo] = useState(() => (initial?.memo ? String(initial.memo) : ""));

  const [sections, setSections] = useState<DraftSection[]>(() => {
    if (!initial?.sections?.length) return [];
    return initial.sections.map((s) => ({
      id: nextId("sec"),
      section_order: s.section_order,
      section_type: s.section_type,
      title: s.title,
      lines: (s.lines || []).map((ln) => ({
        id: nextId("ln"),
        line_order: Number(ln.line_order ?? 1),
        name: ln.name,
        spec: ln.spec ?? "",
        unit: ln.unit ?? "",
        qty: Number(ln.qty ?? 0),
        unit_price: ln.unit_price ?? null,
        amount: ln.amount ?? null,
        remark: ln.remark ?? "",
        calc_mode: ln.calc_mode,
        base_section_type: ln.base_section_type ?? null,
        formula: ln.formula ?? null,
        source_type: ln.source_type ?? "NONE",
        source_id: ln.source_id ?? null,
        price_type: ln.price_type ?? null,
      })),
    }));
  });
  const [productPickOpen, setProductPickOpen] = useState(false);
  const [targetSectionId, setTargetSectionId] = useState<string | null>(null);

  useEffect(() => {
    // 최초 1회: 프로젝트 불러오기
    loadProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (mode !== "update") return;
    const pid = Number(initial?.project_id || 0);
    if (!pid || !projectOptions.length) return;
    const found = projectOptions.find((p) => Number(p.id) === pid) || null;
    if (found) setProject(found);
  }, [mode, initial, projectOptions]);

  useEffect(() => {
    // 프로젝트 선택 시 기본값 채움(신규 등록에서만)
    if (mode !== "create") return;
    if (!project) return;
    if (!title.trim()) setTitle(project.name);
    if (!receiverName.trim()) setReceiverName(project.clientName || "");
  }, [project, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadProjects() {
    setLoadingProjects(true);
    try {
      const currentYear = new Date().getFullYear();
      const departments = await fetchDepartments({ year: currentYear });
      const ids = (departments || []).map((d: any) => Number(d?.id)).filter((n: number) => Number.isFinite(n) && n > 0);

      if (ids.length === 0) {
        setProjectOptions([]);
        alert("진행 프로젝트를 찾을 수 없습니다.\n프로젝트를 먼저 등록했는지 확인해주세요.");
        return;
      }

      const results = await Promise.all(ids.map((id: number) => fetchProjects({ year: currentYear, department_id: id }).catch(() => [])));
      const merged: any[] = results.flat();
      const filtered = merged.filter((p: any) => DISPLAY_STATUSES.includes(p?.status as any));
      filtered.sort((a: any, b: any) => {
        const ta = a?.created_at ? new Date(a.created_at).getTime() : 0;
        const tb = b?.created_at ? new Date(b.created_at).getTime() : 0;
        return tb - ta;
      });

      const mapped: DraftProject[] = filtered
        .map((p: any) => {
          const id = Number(p?.id ?? 0);
          const name = String(p?.name ?? "").trim();
          const clientName = String(p?.client_name ?? "").trim();
          if (!id || !name) return null;
          return { id, name, clientName } as DraftProject;
        })
        .filter(Boolean) as DraftProject[];

      // 1프로젝트=1견적: 이미 견적서가 생성된 프로젝트는 신규등록 '프로젝트 선택' 목록에서 제외
      // 단, 수정(mode=update)인 경우 현재 선택된 프로젝트는 유지
      const currentProjectId = Number(initial?.project_id ?? project?.id ?? 0);

      try {
        const res = await http.get("/estimates");
        const list: any[] = Array.isArray((res as any)?.data) ? (res as any).data : [];
        const used = new Set(list.map((e: any) => Number(e?.project_id ?? 0)).filter((n: number) => Number.isFinite(n) && n > 0));
        const available = mapped.filter((p) => !used.has(p.id) || p.id === currentProjectId);
        setProjectOptions(available);
        if (available.length === 0) alert("진행 프로젝트를 찾을 수 없습니다.\n프로젝트를 먼저 등록했는지 확인해주세요.");
      } catch {
        // 목록 조회 실패 시에는 기존 동작 유지(전체 표시)
        setProjectOptions(mapped);
        if (mapped.length === 0) alert("진행 프로젝트를 찾을 수 없습니다.\n프로젝트를 먼저 등록했는지 확인해주세요.");
      }
    } catch (e: any) {
      alert("프로젝트 불러오기 실패\n" + (e?.message || String(e)));
    } finally {
      setLoadingProjects(false);
    }
  }

  function hasSection(t: SectionType) {
    return sections.some((s) => s.section_type === t);
  }

  function addSection(t: SectionType) {
    if (hasSection(t)) {
      alert("이미 추가된 섹션입니다.");
      return;
    }
    const order = sections.length + 1;
    const sec: DraftSection = {
      id: nextId("sec"),
      section_order: order,
      section_type: t,
      title: titleOfSection(t),
      lines: [],
    };

    // 템플릿 자동 생성
    if (t === "EXPENSE") {
      sec.lines = [
        {
          id: nextId("line"),
          line_order: 1,
          name: "산재보험료",
          spec: "노무비의",
          unit: "%",
          qty: 3.7,
          unit_price: null,
          amount: 0,
          remark: "",
          calc_mode: "PERCENT_OF_SUBTOTAL",
          base_section_type: "LABOR",
          formula: null,
          source_type: "NONE",
        },
        {
          id: nextId("line"),
          line_order: 2,
          name: "고용보험료",
          spec: "노무비의",
          unit: "%",
          qty: 1.01,
          unit_price: null,
          amount: 0,
          remark: "",
          calc_mode: "PERCENT_OF_SUBTOTAL",
          base_section_type: "LABOR",
          formula: null,
          source_type: "NONE",
        },
        {
          id: nextId("line"),
          line_order: 3,
          name: "시민안전관리비",
          spec: "시민안전관리비",
          unit: "식",
          qty: 1,
          unit_price: 0,
          amount: 0,
          remark: "",
          calc_mode: "NORMAL",
          source_type: "NONE",
        },
      ];
    } else if (t === "OVERHEAD") {
      sec.lines = [
        {
          id: nextId("line"),
          line_order: 1,
          name: "일반관리비",
          spec: "재료비+노무비",
          unit: "%",
          qty: 6,
          unit_price: null,
          amount: 0,
          remark: "",
          calc_mode: "FORMULA",
          formula: "(MATERIAL+LABOR)*0.06",
          source_type: "NONE",
        },
      ];
    } else if (t === "PROFIT") {
      sec.lines = [
        {
          id: nextId("line"),
          line_order: 1,
          name: "이윤",
          spec: "노무비+경비+일반관리비",
          unit: "%",
          qty: 15,
          unit_price: null,
          amount: 0,
          remark: "",
          calc_mode: "FORMULA",
          formula: "(LABOR+EXPENSE+OVERHEAD)*0.15",
          source_type: "NONE",
        },
      ];
    }

    setSections((prev) => [...prev, sec].map((x, i) => ({ ...x, section_order: i + 1 })));
  }

  function removeSection(id: string) {
    setSections((prev) => prev.filter((s) => s.id !== id).map((x, i) => ({ ...x, section_order: i + 1 })));
  }

  function addLine(sectionId: string, preset?: Partial<DraftLine>) {
    setSections((prev) =>
      prev.map((s) => {
        if (s.id !== sectionId) return s;
        const nextOrder = (s.lines?.length || 0) + 1;
        const line: DraftLine = {
          id: nextId("line"),
          line_order: nextOrder,
          name: "",
          spec: "",
          unit: "EA",
          qty: 1,
          unit_price: 0,
          amount: 0,
          remark: "",
          calc_mode: "NORMAL",
          source_type: "NONE",
          ...preset,
        };
        return { ...s, lines: [...s.lines, line] };
      })
    );
  }

  function updateLine(sectionId: string, lineId: string, patch: Partial<DraftLine>) {
    setSections((prev) =>
      prev.map((s) => {
        if (s.id !== sectionId) return s;
        return { ...s, lines: s.lines.map((l) => (l.id === lineId ? { ...l, ...patch } : l)) };
      })
    );
  }

  function removeLine(sectionId: string, lineId: string) {
    setSections((prev) =>
      prev.map((s) => {
        if (s.id !== sectionId) return s;
        const lines = s.lines.filter((l) => l.id !== lineId).map((l, i) => ({ ...l, line_order: i + 1 }));
        return { ...s, lines };
      })
    );
  }

  function openPickProduct(sectionId: string) {
    setTargetSectionId(sectionId);
    setProductPickOpen(true);
  }

  function onPickProduct(p: Product) {
    const secId = targetSectionId;
    setProductPickOpen(false);
    setTargetSectionId(null);
    if (!secId) return;

    const pt: PriceType = "DESIGN"; // 기본: 설계가
    const price = getProductPrice(p as any, pt) || Number((p as any).price_delivery || 0);

    addLine(secId, {
      name: String((p as any).name || "").trim() || String((p as any).item_name || "").trim(),
      spec: String((p as any).spec || "").trim(),
      unit: "EA",
      qty: 1,
      unit_price: price,
      calc_mode: "NORMAL",
      source_type: "PRODUCT",
      source_id: Number((p as any).id || 0),
      source_product: p as any,
      price_type: pt,
    });
  }

  const computed = useMemo(() => compute(sections), [sections]);

  function submit() {
    if (!project) {
      alert("진행 프로젝트를 먼저 선택하세요.\n프로젝트가 없다면 프로젝트를 먼저 등록해야 합니다.");
      return;
    }
    if (sections.length === 0) {
      alert("견적서 섹션을 1개 이상 추가하세요.");
      return;
    }

    const payload: DraftEstimateCreatePayload = {
      project_id: project.id,
      title: title.trim() || null,
      receiver_name: receiverName.trim() || null,
      memo: memo.trim() || null,
      sections: computed.sections.map((s) => ({
        section_order: s.section_order,
        section_type: s.section_type,
        title: s.title,
        lines: s.lines.map((l) => ({
          line_order: l.line_order,
          name: l.name,
          spec: l.spec || null,
          unit: l.unit,
          qty: Number(l.qty || 0),
          unit_price: l.unit_price ?? null,
          amount: l.amount ?? null,
          remark: l.remark || null,
          calc_mode: l.calc_mode,
          base_section_type: l.base_section_type ?? null,
          formula: l.formula ?? null,
          source_type: (l.source_type ?? "NONE"),
          // PRODUCT 라인일 때만 source_id를 유지한다.
          // (products 테이블에 없는 id를 PRODUCT로 보내면 FK 오류/또는 서버에서 NULL 처리되어 NONE으로 내려올 수 있음)
          source_id: (l.source_type === "PRODUCT" ? (l.source_id ?? ((l as any).source_product?.id != null ? Number((l as any).source_product.id) : null)) : null),
          price_type: l.price_type ?? null,
        })),
      })),
    };

    onSubmit(payload);
  }

  return (
    <div
      style={{
        border: "1px solid #1F2937",
        borderRadius: 14,
        background: "linear-gradient(180deg, rgba(11,18,32,0.92) 0%, rgba(5,8,20,0.92) 100%)",
        boxShadow: "0 18px 60px rgba(0,0,0,0.35)",
        overflow: "hidden",
      }}
    >
      <div style={{ padding: 14, borderBottom: "1px solid #1F2937", display: "flex", alignItems: "center", gap: 10 }}>
        <div>
          <div style={{ fontSize: 12, color: "#93C5FD", fontWeight: 900 }}>기본 정보</div>
          <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 6 }}>※ 작성자(견적 담당자)는 로그인 사용자로 서버에서 고정 기록됩니다.</div>
        </div>
        <button
          type="button"
          onClick={loadProjects}
          disabled={loadingProjects || saving}
          style={{
            marginLeft: "auto",
            fontSize: 12,
            padding: "8px 10px",
            borderRadius: 10,
            border: "1px solid #334155",
            background: "rgba(15,23,42,0.4)",
            color: "#F8FAFC",
            fontWeight: 900,
            cursor: "pointer",
            opacity: loadingProjects || saving ? 0.6 : 1,
          }}
        >
          {loadingProjects ? "불러오는중..." : "프로젝트 새로고침"}
        </button>
      </div>

      <div style={{ padding: 14, display: "grid", gap: 12 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontSize: 12, color: "#CBD5E1", fontWeight: 800 }}>진행 프로젝트 선택(필수)</span>
          <select
            value={project?.id ?? ""}
            disabled={mode === "update"}
            onChange={(e) => {
              const id = Number(e.target.value || 0);
              const found = projectOptions.find((p) => p.id === id) || null;
              setProject(found);
            }}
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid #334155",
              background: "rgba(15,23,42,0.4)",
              color: "#F8FAFC",
              outline: "none",
            }}
          >
            <option value="">프로젝트 선택</option>
            {projectOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} {p.clientName ? `(${p.clientName})` : ""}
              </option>
            ))}
          </select>
        </label>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, color: "#CBD5E1", fontWeight: 800 }}>견적서 제목</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="미입력 시 프로젝트명으로 저장"
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid #334155",
                background: "rgba(15,23,42,0.4)",
                color: "#F8FAFC",
                outline: "none",
              }}
            />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, color: "#CBD5E1", fontWeight: 800 }}>수신(발주처)</span>
            <input
              value={receiverName}
              onChange={(e) => setReceiverName(e.target.value)}
              placeholder="프로젝트 발주처 기본값(수정 가능)"
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid #334155",
                background: "rgba(15,23,42,0.4)",
                color: "#F8FAFC",
                outline: "none",
              }}
            />
          </label>
        </div>

        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontSize: 12, color: "#CBD5E1", fontWeight: 800 }}>비고</span>
          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="사업 관련 메모(조건/납기/특이사항 등)"
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid #334155",
              background: "rgba(15,23,42,0.4)",
              color: "#F8FAFC",
              outline: "none",
              minHeight: 72,
              resize: "vertical",
            }}
          />
        </label>
      </div>

      <div style={{ padding: 14, borderTop: "1px solid #1F2937" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <div style={{ fontSize: 12, color: "#93C5FD", fontWeight: 900 }}>섹션 추가(선택 순서대로 들어감)</div>
          <div style={{ fontSize: 11, color: "#94A3B8" }}>※ 경비/일반관리비/이윤은 템플릿이 자동 생성됩니다.</div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
            {(["MATERIAL", "LABOR", "EXPENSE", "OVERHEAD", "PROFIT", "MANUAL"] as SectionType[]).map((t) => (
              <button
                key={t}
                type="button"
                disabled={saving}
                onClick={() => addSection(t)}
                style={{
                  fontSize: 12,
                  padding: "8px 10px",
                  borderRadius: 10,
                  border: "1px solid #334155",
                  background: hasSection(t) ? "rgba(148,163,184,0.15)" : "rgba(15,23,42,0.4)",
                  color: "#F8FAFC",
                  fontWeight: 900,
                  cursor: "pointer",
                  opacity: saving ? 0.6 : 1,
                }}
                title={hasSection(t) ? "이미 추가된 섹션" : "섹션 추가"}
              >
                {titleOfSection(t)}
              </button>
            ))}
          </div>
        </div>

        {computed.sections.length === 0 ? (
          <div style={{ padding: 12, color: "#94A3B8", border: "1px dashed #334155", borderRadius: 12 }}>
            섹션을 추가하세요. (예: 재료비 → 경비 → 이윤 순으로 선택하면 그 순서대로 견적서에 들어갑니다)
          </div>
        ) : (
          computed.sections.map((sec) => (
            <div key={sec.id} style={{ marginBottom: 14, border: "1px solid rgba(148,163,184,0.15)", borderRadius: 14, overflow: "hidden" }}>
              <div style={{ padding: 10, display: "flex", alignItems: "center", gap: 10, background: "rgba(15,23,42,0.55)" }}>
                <div style={{ fontWeight: 900 }}>
                  {sec.section_order}. {sec.title}
                </div>
                <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
                  <div style={{ fontSize: 12, color: "#94A3B8" }}>
                    소계: <span style={{ color: "#F8FAFC", fontWeight: 900 }}>{money(sec.lines.reduce((a, b) => a + Number(b.amount || 0), 0))}</span>
                  </div>
                  {sec.section_type === "MATERIAL" ? (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => openPickProduct(sec.id)}
                      style={{
                        fontSize: 12,
                        padding: "8px 10px",
                        borderRadius: 10,
                        border: "1px solid #1D4ED8",
                        background: "rgba(37,99,235,0.15)",
                        color: "#BFDBFE",
                        fontWeight: 900,
                        cursor: "pointer",
                        opacity: saving ? 0.6 : 1,
                      }}
                    >
                      + 제품 추가
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => addLine(sec.id)}
                      style={{
                        fontSize: 12,
                        padding: "8px 10px",
                        borderRadius: 10,
                        border: "1px solid #334155",
                        background: "rgba(15,23,42,0.35)",
                        color: "#F8FAFC",
                        fontWeight: 900,
                        cursor: "pointer",
                        opacity: saving ? 0.6 : 1,
                      }}
                    >
                      + 라인 추가
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => removeSection(sec.id)}
                    style={{
                      fontSize: 12,
                      padding: "8px 10px",
                      borderRadius: 10,
                      border: "1px solid #B91C1C",
                      background: "rgba(185,28,28,0.12)",
                      color: "#FCA5A5",
                      fontWeight: 900,
                      cursor: "pointer",
                      opacity: saving ? 0.6 : 1,
                    }}
                  >
                    섹션 삭제
                  </button>
                </div>
              </div>

              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, tableLayout: "fixed" }}>
                  <thead>
                    <tr style={{ background: "rgba(2,6,23,0.55)", color: "#F8FAFC" }}>
                      <th style={{ padding: "10px 10px", textAlign: "left", width: 56 }}>No</th>
                      <th style={{ padding: "10px 10px", textAlign: "left", width: 220 }}>제품명</th>
                      <th style={{ padding: "10px 10px", textAlign: "left", width: 220 }}>규격</th>
                      <th style={{ padding: "10px 10px", textAlign: "left", width: 70 }}>단위</th>
                      <th style={{ padding: "10px 10px", textAlign: "right", width: 90 }}>수량</th>
                      <th style={{ padding: "10px 10px", textAlign: "right", width: 130 }}>단가</th>
                      <th style={{ padding: "10px 10px", textAlign: "right", width: 140 }}>금액</th>
                      <th style={{ padding: "10px 10px", textAlign: "left", width: 160 }}>비고</th>
                      <th style={{ padding: "10px 10px", width: 120 }} />
                    </tr>
                  </thead>
                  <tbody>
                    {sec.lines.length === 0 ? (
                      <tr>
                        <td colSpan={9} style={{ padding: 12, color: "#94A3B8" }}>
                          라인이 없습니다. “라인 추가” 또는 “제품 추가”를 이용하세요.
                        </td>
                      </tr>
                    ) : (
                      sec.lines.map((l) => (
                        <tr key={l.id} style={{ borderTop: "1px solid rgba(148,163,184,0.12)" }}>
                          <td style={{ padding: "8px 10px", color: "#94A3B8" }}>{l.line_order}</td>
                          <td style={{ padding: "8px 10px" }}>
                            <input
                              value={l.name}
                              disabled={saving}
                              onChange={(e) => updateLine(sec.id, l.id, { name: e.target.value })}
                              style={{
                                width: "100%",
                                padding: "8px 10px",
                                borderRadius: 10,
                                border: "1px solid #334155",
                                background: "rgba(15,23,42,0.35)",
                                color: "#F8FAFC",
                                outline: "none",
                              }}
                            />
                            {sec.section_type === "MATERIAL" && l.source_type === "PRODUCT" && (
                              <div style={{ marginTop: 6, display: "flex", gap: 6, alignItems: "center" }}>
                                <span style={{ fontSize: 11, color: "#94A3B8" }}>단가종류</span>
                                <select
                                  value={l.price_type || "DESIGN"}
                                  disabled={saving}
                                  onChange={(e) => {
                                    const nextPt = e.target.value as PriceType;
                                    // MANUAL은 단가를 사용자가 직접 입력하므로 자동 변경하지 않음
                                    if (nextPt === "MANUAL") {
                                      updateLine(sec.id, l.id, { price_type: nextPt });
                                      return;
                                    }
                                    const nextPrice = getProductPrice((l as any).source_product, nextPt);
                                    updateLine(sec.id, l.id, { price_type: nextPt, unit_price: nextPrice });
                                  }}
                                  style={{
                                    fontSize: 11,
                                    padding: "6px 8px",
                                    borderRadius: 10,
                                    border: "1px solid #334155",
                                    background: "rgba(15,23,42,0.35)",
                                    color: "#F8FAFC",
                                    outline: "none",
                                  }}
                                >
                                  {(["DESIGN", "CONSUMER", "SUPPLY", "MANUAL"] as PriceType[]).map((pt) => (
                                    <option key={pt} value={pt}>
                                      {priceLabel(pt)}
                                    </option>
                                  ))}
                                </select>
                                <span style={{ fontSize: 11, color: "#94A3B8" }}>※ MANUAL 선택 시 단가 직접 입력</span>
                              </div>
                            )}
                          </td>
                          <td style={{ padding: "8px 10px" }}>
                            <input
                              value={l.spec || ""}
                              disabled={saving}
                              onChange={(e) => updateLine(sec.id, l.id, { spec: e.target.value })}
                              style={{
                                width: "100%",
                                padding: "8px 10px",
                                borderRadius: 10,
                                border: "1px solid #334155",
                                background: "rgba(15,23,42,0.35)",
                                color: "#F8FAFC",
                                outline: "none",
                              }}
                            />
                          </td>
                          <td style={{ padding: "8px 10px" }}>
                            <input
                              value={l.unit}
                              disabled={saving}
                              onChange={(e) => updateLine(sec.id, l.id, { unit: e.target.value })}
                              style={{
                                width: "100%",
                                padding: "8px 10px",
                                borderRadius: 10,
                                border: "1px solid #334155",
                                background: "rgba(15,23,42,0.35)",
                                color: "#F8FAFC",
                                outline: "none",
                              }}
                            />
                          </td>
                          <td style={{ padding: "8px 10px", textAlign: "right" }}>
                            <input
                              value={String(l.qty ?? 0)}
                              disabled={saving || l.calc_mode !== "NORMAL" ? false : false}
                              onChange={(e) => updateLine(sec.id, l.id, { qty: Number(e.target.value || 0) })}
                              style={{
                                width: "100%",
                                padding: "8px 10px",
                                borderRadius: 10,
                                border: "1px solid #334155",
                                background: "rgba(15,23,42,0.35)",
                                color: "#F8FAFC",
                                outline: "none",
                                textAlign: "right",
                              }}
                            />
                          </td>
                          <td style={{ padding: "8px 10px", textAlign: "right" }}>
                            {l.calc_mode !== "NORMAL" ? (
                              <div style={{ color: "#94A3B8", fontSize: 12 }}>자동</div>
                            ) : (
                              <input
                                value={String(Number(l.unit_price || 0))}
                                disabled={saving}
                                onChange={(e) => updateLine(sec.id, l.id, { unit_price: Number(e.target.value || 0) })}
                                style={{
                                  width: "100%",
                                  padding: "8px 10px",
                                  borderRadius: 10,
                                  border: "1px solid #334155",
                                  background: "rgba(15,23,42,0.35)",
                                  color: "#F8FAFC",
                                  outline: "none",
                                  textAlign: "right",
                                  opacity: 1,
                                }}
                              />
                            )}
                          </td>
                          <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 900, color: "#F8FAFC" }}>
                            {money(Number(l.amount || 0))}
                          </td>
                          <td style={{ padding: "8px 10px" }}>
                            <input
                              value={l.remark || ""}
                              disabled={saving}
                              onChange={(e) => updateLine(sec.id, l.id, { remark: e.target.value })}
                              style={{
                                width: "100%",
                                padding: "8px 10px",
                                borderRadius: 10,
                                border: "1px solid #334155",
                                background: "rgba(15,23,42,0.35)",
                                color: "#F8FAFC",
                                outline: "none",
                              }}
                            />
                          </td>
                          <td style={{ padding: "8px 10px", textAlign: "right" }}>
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() => removeLine(sec.id, l.id)}
                              style={{
                                fontSize: 12,
                                padding: "8px 10px",
                                borderRadius: 10,
                                border: "1px solid #B91C1C",
                                background: "rgba(185,28,28,0.12)",
                                color: "#FCA5A5",
                                fontWeight: 900,
                                cursor: "pointer",
                                opacity: saving ? 0.6 : 1,
                              }}
                            >
                              삭제
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ))
        )}
      </div>

      <div style={{ padding: 14, borderTop: "1px solid #1F2937", display: "flex", gap: 12, alignItems: "center" }}>
        <div style={{ display: "flex", gap: 14, alignItems: "baseline" }}>
          <div style={{ color: "#94A3B8", fontSize: 12 }}>
            합계(공급가): <span style={{ color: "#F8FAFC", fontWeight: 900 }}>{money(computed.subtotal)}</span>
          </div>
          <div style={{ color: "#94A3B8", fontSize: 12 }}>
            부가세(10%): <span style={{ color: "#F8FAFC", fontWeight: 900 }}>{money(computed.tax)}</span>
          </div>
          <div style={{ color: "#94A3B8", fontSize: 12 }}>
            총계: <span style={{ color: "#F8FAFC", fontWeight: 900 }}>{money(computed.total)}</span>
          </div>
        </div>

        <button
          type="button"
          onClick={submit}
          disabled={saving}
          style={{
            marginLeft: "auto",
            fontSize: 12,
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid #16A34A",
            background: "linear-gradient(180deg, #22C55E 0%, #16A34A 100%)",
            color: "#052E16",
            fontWeight: 900,
            cursor: "pointer",
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? "저장중..." : (submitLabel || (mode === "update" ? "수정 저장(신규 버전 생성)" : "저장(신규 견적서 생성)"))}
        </button>
      </div>

      <ProductPickModal open={productPickOpen} onClose={() => setProductPickOpen(false)} onPick={onPickProduct} />
    </div>
  );
}