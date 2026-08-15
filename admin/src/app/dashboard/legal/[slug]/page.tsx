"use client";

import { useRouter } from "next/navigation";
import { useEffect, use } from "react";
import LegalDocumentEditor from "@/components/LegalDocumentEditor";
import { getLegalMetaBySlug } from "@/lib/legalTypes";

export default function LegalTypePage({ params }: { params: Promise<{ slug: string }> }) {
  const router = useRouter();
  const { slug } = use(params);
  const meta = getLegalMetaBySlug(slug);

  useEffect(() => {
    if (!meta) router.replace("/dashboard/legal");
  }, [meta, router]);

  if (!meta) return null;

  return <LegalDocumentEditor type={meta.type} label={meta.label} description={meta.description} />;
}
