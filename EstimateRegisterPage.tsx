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

  async function onSubmit(payload: DraftEstimateCreatePayload) {
    setSaving(true);
    try {
      const res = await api<{ id: number; estimate_id?: number }>(`/api/estimates`, {
        method: "POST",
        body: JSON.stringify(payload),
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
