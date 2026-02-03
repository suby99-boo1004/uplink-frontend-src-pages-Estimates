import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../lib/auth";
import { api } from "../../lib/api";
import EstimateRegisterModal, { DraftEstimateCreatePayload } from "./components/EstimateRegisterModal";

export default function EstimateRegisterPage() {
  const { user } = useAuth() as any;
  const roleId: number | null = (user as any)?.role_id ?? null;
  const canManage = Boolean(user);

  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);



function normalizePayload(payload: any) {
  // 견적서 라인에서 제품 선택 모드일 때 source_type/source_id가 빠지는 경우 보정
  const cloned = { ...payload };
  if (Array.isArray(cloned.sections)) {
    cloned.sections = cloned.sections.map((sec: any) => {
      const s2 = { ...sec };
      if (Array.isArray(s2.lines)) {
        s2.lines = s2.lines.map((ln: any) => {
          const l2 = { ...ln };
          const pid = l2.product_id ?? l2.productId ?? l2.source_id ?? l2.sourceId ?? null;
          if ((l2.source_type == null || l2.source_type === "NONE") && pid != null) {
            l2.source_type = "PRODUCT";
            l2.source_id = pid;
          }
          // 백엔드가 기대하는 키 이름 정리
          if (l2.sourceId != null && l2.source_id == null) l2.source_id = l2.sourceId;
          if (l2.sourceType != null && l2.source_type == null) l2.source_type = l2.sourceType;
          return l2;
        });
      }
      return s2;
    });
  }
  return cloned;
}

  async function onSubmit(payload: DraftEstimateCreatePayload) {
    setSaving(true);
    try {
      const res = await api<{ id: number; estimate_id?: number }>(`/api/estimates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(normalizePayload(payload)),
      });
      const newId = Number((res as any)?.estimate_id ?? (res as any)?.id ?? 0);
      alert("견적서가 생성되었습니다.");
      if (newId) {
        navigate(`/estimates/${newId}`);
      } else {
        navigate("/estimates");
      }
    } catch (e: any) {
      alert("견적서 생성 실패\n" + (e?.message || String(e)));
    } finally {
      setSaving(false);
    }
  }

  if (!canManage) {
    return (
      <div style={{ padding: 16 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: "#F8FAFC" }}>견적서 신규 등록</h2>
        <div style={{ marginTop: 10, color: "#94A3B8" }}>권한이 없어 신규 등록이 불가합니다. (관리자/운영자만)</div>
        <button
          type="button"
          onClick={() => navigate("/estimates")}
          style={{
            marginTop: 14,
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
      </div>
    );
  }

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: "#F8FAFC" }}>견적서 신규 등록</h2>
        <span style={{ fontSize: 12, color: "#94A3B8" }}>섹션 선택형</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button
            type="button"
            disabled={saving}
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
              opacity: saving ? 0.6 : 1,
            }}
          >
            취소
          </button>
        </div>
      </div>

      <EstimateRegisterModal saving={saving} onSubmit={onSubmit} />
    </div>
  );
}