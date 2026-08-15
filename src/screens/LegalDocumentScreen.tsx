import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Pal } from '../design/DesignSystem';
import { useTheme } from '../context/ThemeContext';
import { SimpleMarkdown } from '../components/ui/SimpleMarkdown';
import { getLegalDocument } from '../services/legalCacheService';
import type { LegalDocumentType, LegalDocumentPayload } from '../services/api/legal';
import { useHeaderSafePadding, useBottomSafePadding } from '../design/responsive';

interface LegalDocumentScreenProps {
  type: LegalDocumentType;
  fallbackTitle?: string;
  onBack?: () => void;
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    return null;
  }
}

export default function LegalDocumentScreen({ type, fallbackTitle, onBack }: LegalDocumentScreenProps) {
  const { theme } = useTheme();
  const headerPadTop = useHeaderSafePadding(12);
  const scrollPadBottom = useBottomSafePadding(24);
  const [loading, setLoading] = useState(true);
  const [document, setDocument] = useState<LegalDocumentPayload | null>(null);
  const [source, setSource] = useState<'network' | 'cache' | 'none'>('none');
  const [notPublished, setNotPublished] = useState(false);
  const [cachedAt, setCachedAt] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getLegalDocument(type);
      setDocument(result.document);
      setSource(result.source);
      setNotPublished(result.notPublished);
      setCachedAt(result.cachedAt);
    } finally {
      setLoading(false);
    }
  }, [type]);

  useEffect(() => {
    load();
  }, [load]);

  const title = document?.title || fallbackTitle || 'Legal Document';
  const effectiveDate = formatDate(document?.effectiveDate ?? null);

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <View style={{ paddingTop: headerPadTop, paddingHorizontal: Pal.spacing[5], paddingBottom: Pal.spacing[4], flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <TouchableOpacity onPress={onBack} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: theme.glass, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ color: theme.text, fontSize: 20 }}>←</Text>
        </TouchableOpacity>
        <Text style={{ flex: 1, fontFamily: Pal.typography.fontFamily.bold, fontSize: 19, color: theme.text }} numberOfLines={1}>
          {title}
        </Text>
      </View>

      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator color={theme.primary} />
        </View>
      ) : !document ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: Pal.spacing[6], gap: Pal.spacing[3] }}>
          <Text style={{ fontSize: 40 }}>📄</Text>
          <Text style={{ fontFamily: Pal.typography.fontFamily.semibold, fontSize: 16, color: theme.text, textAlign: 'center' }}>
            {notPublished ? 'Not published yet' : 'Unable to load this document'}
          </Text>
          <Text style={{ fontFamily: Pal.typography.fontFamily.regular, fontSize: 14, color: theme.textMuted, textAlign: 'center' }}>
            {notPublished
              ? 'This document has not been published yet. Please check back later.'
              : 'Check your internet connection and try again.'}
          </Text>
          <TouchableOpacity onPress={load} style={{ marginTop: Pal.spacing[2], paddingHorizontal: Pal.spacing[5], paddingVertical: Pal.spacing[3], borderRadius: Pal.borderRadius.xl, backgroundColor: theme.primary }}>
            <Text style={{ fontFamily: Pal.typography.fontFamily.semibold, fontSize: 14, color: theme.buttonText }}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: Pal.spacing[5], paddingBottom: scrollPadBottom }}>
          {source === 'cache' && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: theme.warning + '18', borderRadius: Pal.borderRadius.lg, padding: Pal.spacing[3], marginBottom: Pal.spacing[4] }}>
              <Text style={{ fontSize: 14 }}>📡</Text>
              <Text style={{ flex: 1, fontFamily: Pal.typography.fontFamily.medium, fontSize: 12, color: theme.text }}>
                Showing a saved offline copy{cachedAt ? ` from ${formatDate(new Date(cachedAt).toISOString())}` : ''}. Connect to the internet for the latest version.
              </Text>
            </View>
          )}
          {effectiveDate && (
            <Text style={{ fontFamily: Pal.typography.fontFamily.medium, fontSize: 12, color: theme.textMuted, marginBottom: Pal.spacing[4] }}>
              Effective {effectiveDate} · Version {document.versionNumber}
            </Text>
          )}
          <SimpleMarkdown content={document.content} />
        </ScrollView>
      )}
    </View>
  );
}
