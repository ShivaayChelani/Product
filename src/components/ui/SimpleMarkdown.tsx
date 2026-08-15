import React from 'react';
import { View, Text } from 'react-native';
import { Pal } from '../../design/DesignSystem';
import { useTheme } from '../../context/ThemeContext';

interface SimpleMarkdownProps {
  content: string;
}

/**
 * Minimal, dependency-free Markdown renderer for legal/policy documents.
 * Supports the subset legal copy actually needs: #/##/### headers, **bold**,
 * unordered lists (- / *), horizontal rules (---), and paragraphs.
 * Intentionally does not pull in a full markdown library — this content is
 * plain, server-authored prose, not arbitrary user markdown.
 */
function renderInline(text: string, color: string, key: string | number) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return (
    <Text key={key} style={{ fontFamily: Pal.typography.fontFamily.regular, fontSize: 15, lineHeight: 23, color }}>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return (
            <Text key={i} style={{ fontFamily: Pal.typography.fontFamily.bold }}>
              {part.slice(2, -2)}
            </Text>
          );
        }
        return part;
      })}
    </Text>
  );
}

export function SimpleMarkdown({ content }: SimpleMarkdownProps) {
  const { theme } = useTheme();
  const lines = content.replace(/\r\n/g, '\n').split('\n');

  const blocks: React.ReactNode[] = [];
  let listBuffer: string[] = [];

  const flushList = () => {
    if (listBuffer.length === 0) return;
    blocks.push(
      <View key={`list-${blocks.length}`} style={{ marginBottom: Pal.spacing[3], gap: 8 }}>
        {listBuffer.map((item, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: 8, paddingLeft: 4 }}>
            <Text style={{ color: theme.primary, fontSize: 15, lineHeight: 23 }}>•</Text>
            <View style={{ flex: 1 }}>{renderInline(item, theme.textSecondary, `li-${i}`)}</View>
          </View>
        ))}
      </View>,
    );
    listBuffer = [];
  };

  lines.forEach((rawLine, idx) => {
    const line = rawLine.trim();

    if (line.startsWith('- ') || line.startsWith('* ')) {
      listBuffer.push(line.slice(2));
      return;
    }
    flushList();

    if (!line) {
      return;
    }

    if (line.startsWith('### ')) {
      blocks.push(
        <Text key={idx} style={{ fontFamily: Pal.typography.fontFamily.bold, fontSize: 16, color: theme.text, marginTop: Pal.spacing[3], marginBottom: Pal.spacing[2] }}>
          {line.slice(4)}
        </Text>,
      );
      return;
    }

    if (line.startsWith('## ')) {
      blocks.push(
        <Text key={idx} style={{ fontFamily: Pal.typography.fontFamily.bold, fontSize: 18, color: theme.text, marginTop: Pal.spacing[4], marginBottom: Pal.spacing[2] }}>
          {line.slice(3)}
        </Text>,
      );
      return;
    }

    if (line.startsWith('# ')) {
      blocks.push(
        <Text key={idx} style={{ fontFamily: Pal.typography.fontFamily.bold, fontSize: 22, color: theme.text, marginTop: Pal.spacing[2], marginBottom: Pal.spacing[3] }}>
          {line.slice(2)}
        </Text>,
      );
      return;
    }

    if (/^-{3,}$/.test(line)) {
      blocks.push(<View key={idx} style={{ height: 1, backgroundColor: theme.border, marginVertical: Pal.spacing[4] }} />);
      return;
    }

    blocks.push(
      <View key={idx} style={{ marginBottom: Pal.spacing[3] }}>
        {renderInline(line, theme.textSecondary, idx)}
      </View>,
    );
  });
  flushList();

  return <View>{blocks}</View>;
}
