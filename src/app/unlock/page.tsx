import { UnlockForm } from "./UnlockForm";
import { safeInternalPath } from "@/lib/safe-redirect";

export const dynamic = "force-dynamic";

export default async function UnlockPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const nextPath = safeInternalPath(next);
  return (
    <main className="flex min-h-dvh items-center justify-center bg-gradient-to-b from-teal-50 to-white px-5 py-10">
      <section className="w-full max-w-md rounded-3xl border border-teal-100 bg-white p-7 text-center shadow-xl shadow-teal-950/10 sm:p-9">
        <p className="text-sm font-bold uppercase tracking-[0.16em] text-teal-700">DawaiSaathi</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950">Private family access</h1>
        <p className="mt-3 text-base leading-7 text-slate-700">This medicine record is protected. Enter the family access code to continue.</p>
        <p className="mt-2 text-sm leading-6 text-slate-600">यह दवा रिकॉर्ड सुरक्षित है। आगे बढ़ने के लिए परिवार का प्रवेश कोड डालें।</p>
        <UnlockForm nextPath={nextPath} />
      </section>
    </main>
  );
}
