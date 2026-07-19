"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Camera, Edit3, Trash2, AlertTriangle, CalendarX, Pill } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { Banner, Card, GhostButton, ModalDialog, PrimaryButton, Spinner } from "@/components/ui";
import { useI18n } from "@/lib/i18n/provider";
import { apiGet, apiJson, ApiError } from "@/lib/api-client";
import type { SerializedMedication } from "@/lib/medications";
import type { MedForm } from "@/types/domain";

type EditableFields = {
  brandName: string;
  form: MedForm;
  packSize: number | null;
  mrpInr: number | null;
  expiryDate: string | null;
  batchNumber: string | null;
  manufacturer: string | null;
  notes: string | null;
};

const FORMS: MedForm[] = ["tablet", "capsule", "syrup", "drops", "injection", "cream", "other"];

export function MedicationsClient({ initialMedications }: { initialMedications: SerializedMedication[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const [meds, setMeds] = useState(initialMedications);
  const [editing, setEditing] = useState<SerializedMedication | null>(null);
  const [archiving, setArchiving] = useState<SerializedMedication | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await apiGet<{ medications: SerializedMedication[] }>("/api/medications");
      setMeds(res.medications);
    } catch {
      setLoadError(t("profile.loadError"));
    }
  }, [t]);

  if (loadError) {
    return (
      <div>
        <Header />
        <Banner tone="warn">
          <p>{loadError}</p>
          <GhostButton className="mt-3" onClick={load}>{t("common.tryAgain")}</GhostButton>
        </Banner>
      </div>
    );
  }

  if (meds.length === 0) {
    return (
      <div>
        <Header />
        <EmptyState
          icon={Pill}
          title=""
          description=""
          action={
            <Link href="/scan" className="w-full">
              <PrimaryButton><Camera size={18} /> {t("home.scanCta")}</PrimaryButton>
            </Link>
          }
        />
      </div>
    );
  }

  const beginEdit = (med: SerializedMedication) => {
    setEditing(med);
    setError(null);
  };

  const saveEdit = async () => {
    if (!editing) return;
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {};
      if (editing.brandName !== initialMedications.find((m) => m.id === editing.id)?.brandName) body.brandName = editing.brandName;
      if (editing.form !== initialMedications.find((m) => m.id === editing.id)?.form) body.form = editing.form;
      if (editing.packSize !== initialMedications.find((m) => m.id === editing.id)?.packSize) body.packSize = editing.packSize;
      if (editing.mrpInr !== initialMedications.find((m) => m.id === editing.id)?.mrpInr) body.mrpInr = editing.mrpInr;
      if (editing.expiryDate !== initialMedications.find((m) => m.id === editing.id)?.expiryDate) body.expiryDate = editing.expiryDate;
      if (editing.batchNumber !== initialMedications.find((m) => m.id === editing.id)?.batchNumber) body.batchNumber = editing.batchNumber;
      if (editing.manufacturer !== initialMedications.find((m) => m.id === editing.id)?.manufacturer) body.manufacturer = editing.manufacturer;

      if (Object.keys(body).length === 0) {
        setEditing(null);
        setSaving(false);
        return;
      }

      const res = await apiJson<{ medication: SerializedMedication }>(`/api/medications/${editing.id}`, "PATCH", body);
      setMeds((prev) => prev.map((m) => (m.id === editing.id ? res.medication : m)));
      setEditing(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("profile.saveError"));
    } finally {
      setSaving(false);
    }
  };

  const confirmArchive = async () => {
    if (!archiving) return;
    setSaving(true);
    setError(null);
    try {
      await apiJson(`/api/medications/${archiving.id}`, "DELETE");
      setMeds((prev) => prev.filter((m) => m.id !== archiving.id));
      setArchiving(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("profile.saveError"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <Header />
      <div className="flex flex-col gap-3">
        {meds.map((med) => (
          <MedicationCard key={med.id} med={med} onEdit={() => beginEdit(med)} onArchive={() => setArchiving(med)} />
        ))}
      </div>
      {error && <div className="mt-3"><Banner tone="warn"><span role="alert">{error}</span></Banner></div>}

      {editing && (
        <ModalDialog
          title={`${t("common.edit")} ${editing.brandName}`}
          onClose={saving ? undefined : () => setEditing(null)}
        >
          <div className="flex flex-col gap-4">
            <EditField label={t("review.brand")}>
              <input
                value={editing.brandName}
                onChange={(e) => setEditing({ ...editing, brandName: e.target.value })}
                className="min-h-[44px] w-full rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-base outline-none focus:border-[var(--color-primary)]"
              />
            </EditField>
            <EditField label={t("review.form")}>
              <select
                value={editing.form}
                onChange={(e) => setEditing({ ...editing, form: e.target.value as MedForm })}
                className="min-h-[44px] w-full rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-base outline-none"
              >
                {FORMS.map((f) => (<option key={f} value={f}>{f}</option>))}
              </select>
            </EditField>
            <div className="grid grid-cols-2 gap-3">
              <EditField label={t("review.pack")}>
                <input
                  type="number" min={1} step={1}
                  value={editing.packSize ?? ""}
                  onChange={(e) => setEditing({ ...editing, packSize: e.target.value ? parseInt(e.target.value, 10) : null })}
                  className="min-h-[44px] w-full rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-base outline-none focus:border-[var(--color-primary)]"
                />
              </EditField>
              <EditField label={t("review.mrp")}>
                <input
                  type="number" min={0} step="0.01"
                  value={editing.mrpInr ?? ""}
                  onChange={(e) => setEditing({ ...editing, mrpInr: e.target.value ? parseFloat(e.target.value) : null })}
                  className="min-h-[44px] w-full rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-base outline-none focus:border-[var(--color-primary)]"
                />
              </EditField>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <EditField label={t("review.expiry")}>
                <input
                  type="month"
                  value={editing.expiryDate ?? ""}
                  onChange={(e) => setEditing({ ...editing, expiryDate: e.target.value || null })}
                  className="min-h-[44px] w-full rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-base outline-none focus:border-[var(--color-primary)]"
                />
              </EditField>
              <EditField label={t("review.batch")}>
                <input
                  value={editing.batchNumber ?? ""}
                  onChange={(e) => setEditing({ ...editing, batchNumber: e.target.value || null })}
                  className="min-h-[44px] w-full rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-base outline-none focus:border-[var(--color-primary)]"
                />
              </EditField>
            </div>
            <EditField label={t("review.manufacturer")}>
              <input
                value={editing.manufacturer ?? ""}
                onChange={(e) => setEditing({ ...editing, manufacturer: e.target.value || null })}
                className="min-h-[44px] w-full rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-base outline-none focus:border-[var(--color-primary)]"
                placeholder="Cipla Ltd"
              />
            </EditField>

          </div>
          <div className="mt-5 flex gap-3">
            <GhostButton className="flex-1" disabled={saving} onClick={() => setEditing(null)}>{t("common.cancel")}</GhostButton>
            <PrimaryButton className="flex-1" disabled={saving} onClick={() => void saveEdit()}>{t("common.save")}</PrimaryButton>
          </div>
        </ModalDialog>
      )}

      {archiving && (
        <ModalDialog
          title={t("common.remove")}
          onClose={saving ? undefined : () => setArchiving(null)}
        >
          <p className="text-sm leading-6 text-[var(--color-text-muted)]">
            {t("schedule.stopRemindersBody")}
            {" "}
            <span className="font-semibold text-[var(--color-text)]">{archiving.brandName}</span> {t("schedule.stopRemindersTitle").toLowerCase()}
          </p>
          {error && <div className="mt-3"><Banner tone="danger"><span role="alert">{error}</span></Banner></div>}
          <div className="mt-5 flex gap-3">
            <GhostButton className="flex-1" disabled={saving} onClick={() => setArchiving(null)}>{t("common.cancel")}</GhostButton>
            <PrimaryButton className="!bg-[var(--color-danger)] flex-1" disabled={saving} onClick={() => void confirmArchive()}>{t("common.remove")}</PrimaryButton>
          </div>
        </ModalDialog>
      )}
    </div>
  );
}

function Header() {
  const { t } = useI18n();
  return (
    <div className="mb-6 flex items-center gap-3">
      <Link href="/" aria-label={t("common.back")} className="pressable flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-bg)] transition-[transform,background-color] duration-150 ease-[var(--ease-out)] active:bg-[var(--color-border)]">
        <ArrowLeft size={20} />
      </Link>
      <h1 className="text-2xl font-bold">Medications</h1>
    </div>
  );
}

function MedicationCard({ med, onEdit, onArchive }: { med: SerializedMedication; onEdit: () => void; onArchive: () => void }) {
  const { t } = useI18n();
  return (
    <Card className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-[var(--color-text)]">{med.brandName}</p>
          <p className="text-sm text-[var(--color-text-muted)]">{med.displayGeneric}</p>
        </div>
        <div className="flex shrink-0 gap-1">
          <button onClick={onEdit} aria-label={t("common.edit")} className="pressable flex h-9 w-9 items-center justify-center rounded-lg text-[var(--color-text-muted)] hover:bg-[var(--color-border)] transition-colors">
            <Edit3 size={16} />
          </button>
          <button onClick={onArchive} aria-label={t("common.remove")} className="pressable flex h-9 w-9 items-center justify-center rounded-lg text-[var(--color-danger)] hover:bg-[var(--color-danger-soft)] transition-colors">
            <Trash2 size={16} />
          </button>
        </div>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--color-text-muted)]">
        {med.form && <span>{med.form}</span>}
        {med.packSize && <span>{t("review.pack")}: {med.packSize}</span>}
        {med.mrpInr && <span>₹{med.mrpInr}</span>}
        {med.expiryDate && <span>{t("review.expiry")}: {med.expiryDate}</span>}
        {med.manufacturer && <span>{med.manufacturer}</span>}
      </div>
      {med.highRisk && (
        <div className="flex items-center gap-1.5 rounded-lg bg-[var(--color-unverified-soft)] px-2 py-1 text-xs font-medium text-[var(--color-unverified)]">
          <AlertTriangle size={12} />
          {t("review.highRisk")}{med.highRiskReason ? `: ${med.highRiskReason}` : ""}
        </div>
      )}
      {med.expiryStatus === "expired" && (
        <div className="flex items-center gap-1.5 rounded-lg bg-[var(--color-danger-soft)] px-2 py-1 text-xs font-medium text-[var(--color-danger)]">
          <CalendarX size={12} />
          {t("review.expired", { date: med.expiryDate ?? "" })}
        </div>
      )}
      {med.expiryStatus === "expiring" && (
        <div className="flex items-center gap-1.5 rounded-lg bg-[var(--color-warn-soft)] px-2 py-1 text-xs font-medium text-[var(--color-warn)]">
          <CalendarX size={12} />
          {t("review.expiring", { date: med.expiryDate ?? "" })}
        </div>
      )}
    </Card>
  );
}

function EditField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">{label}</span>
      {children}
    </label>
  );
}
