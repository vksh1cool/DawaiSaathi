"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { PhotoDropzone } from "@/components/PhotoDropzone";
import { ExtractionProgress } from "@/components/ExtractionProgress";
import { PrimaryButton, Banner } from "@/components/ui";
import { useI18n } from "@/lib/i18n/provider";
import { apiUpload, ApiError } from "@/lib/api-client";
import type { DraftMedication } from "@/types/domain";

type ScanResult = { scanBatchId: string; medications: DraftMedication[]; imageIssues: string[] };

export default function ScanPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const extract = async () => {
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      files.forEach((f) => form.append("photos", f));
      const result = await apiUpload<ScanResult>("/api/scan", form);
      sessionStorage.setItem("dawaisaathi.scan", JSON.stringify(result));
      router.push("/scan/review");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("scan.error_retry"));
      setBusy(false);
    }
  };

  return (
    <AppShell>
      <h1 className="mb-1 text-2xl font-bold">{t("scan.title")}</h1>
      {!busy && (
        <p className="mb-4 text-sm text-[var(--color-text-muted)]">{t("scan.tips")}</p>
      )}

      {busy ? (
        <ExtractionProgress />
      ) : (
        <div className="flex flex-col gap-4">
          <PhotoDropzone files={files} onChange={setFiles} max={5} />
          {error && (
            <Banner tone="danger">{error}</Banner>
          )}
          <PrimaryButton disabled={files.length === 0} onClick={extract}>
            {t("scan.extract")}
            <ArrowRight size={18} />
          </PrimaryButton>
        </div>
      )}
    </AppShell>
  );
}
