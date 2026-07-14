/**
 * Renders a model reply as formatted text: headings, lists, emphasis, and —
 * the reason this exists — real code blocks with a language label, horizontal
 * scrolling instead of wrapping, and a copy button.
 */
import React, { useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { radius, spacing, Theme, type } from '../theme';
import { CheckIcon, CopyIcon } from './icons';
import { copyToClipboard } from '../lib/clipboard';
import { InlineSpan, MdBlock, parseMarkdown } from '../lib/markdown';

const MONO = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

function Inline({
  theme,
  spans,
  color,
  base,
}: {
  theme: Theme;
  spans: InlineSpan[];
  color: string;
  base: object;
}) {
  return (
    <Text style={[base, { color }]}>
      {spans.map((s, i) =>
        s.code ? (
          <Text
            key={i}
            style={{
              fontFamily: MONO,
              fontSize: 13.5,
              color: theme.accent,
              backgroundColor: theme.accentSoft,
            }}>
            {` ${s.text} `}
          </Text>
        ) : (
          <Text
            key={i}
            style={{
              fontWeight: s.bold ? '700' : undefined,
              fontStyle: s.italic ? 'italic' : undefined,
            }}>
            {s.text}
          </Text>
        ),
      )}
    </Text>
  );
}

function CodeBlock({
  theme,
  lang,
  code,
  open,
}: {
  theme: Theme;
  lang: string;
  code: string;
  open: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    copyToClipboard(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };
  return (
    <View
      style={{
        marginVertical: spacing.s,
        borderRadius: radius.control,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.hairline,
        backgroundColor: theme.dark ? '#17140f' : '#f6f2ea',
        overflow: 'hidden',
      }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingLeft: 12,
          paddingRight: 6,
          paddingVertical: 5,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: theme.hairline,
        }}>
        <Text style={[type.caption, { color: theme.inkMuted }]}>
          {(lang || 'code').toUpperCase()}
        </Text>
        {/* No copy button until the block is closed — copying a half-written
            snippet is worse than waiting a second for it to finish. */}
        {open ? (
          <Text style={[type.caption, { color: theme.inkMuted, paddingRight: 6 }]}>writing…</Text>
        ) : (
          <Pressable
            onPress={copy}
            hitSlop={8}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 5,
              paddingHorizontal: 8,
              paddingVertical: 4,
              opacity: pressed ? 0.6 : 1,
            })}>
            {copied ? (
              <CheckIcon color={theme.goodText} size={14} />
            ) : (
              <CopyIcon color={theme.inkMuted} size={14} />
            )}
            <Text
              style={[
                type.caption,
                { color: copied ? theme.goodText : theme.inkMuted },
              ]}>
              {copied ? 'COPIED' : 'COPY'}
            </Text>
          </Pressable>
        )}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <Text
          selectable
          style={{
            fontFamily: MONO,
            fontSize: 13,
            lineHeight: 19,
            color: theme.inkPrimary,
            padding: 12,
          }}>
          {code}
        </Text>
      </ScrollView>
    </View>
  );
}

function Block({ theme, block, color }: { theme: Theme; block: MdBlock; color: string }) {
  switch (block.kind) {
    case 'code':
      return <CodeBlock theme={theme} lang={block.lang} code={block.code} open={block.open} />;

    case 'heading':
      return (
        <View style={{ marginTop: spacing.s, marginBottom: 2 }}>
          <Inline
            theme={theme}
            spans={block.spans}
            color={color}
            base={block.level <= 2 ? type.headline : { ...type.body, fontWeight: '600' }}
          />
        </View>
      );

    case 'list':
      return (
        <View style={{ marginVertical: 2, gap: 3 }}>
          {block.items.map((spans, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: 8 }}>
              <Text style={[type.body, { color: theme.inkMuted, minWidth: block.ordered ? 18 : 10 }]}>
                {block.ordered ? `${i + 1}.` : '•'}
              </Text>
              <View style={{ flex: 1 }}>
                <Inline theme={theme} spans={spans} color={color} base={type.body} />
              </View>
            </View>
          ))}
        </View>
      );

    case 'quote':
      return (
        <View
          style={{
            borderLeftWidth: 3,
            borderLeftColor: theme.fillStrong,
            paddingLeft: 10,
            marginVertical: 4,
          }}>
          <Inline theme={theme} spans={block.spans} color={theme.inkSecondary} base={type.body} />
        </View>
      );

    case 'rule':
      return (
        <View
          style={{
            height: StyleSheet.hairlineWidth,
            backgroundColor: theme.hairline,
            marginVertical: spacing.s,
          }}
        />
      );

    default:
      return (
        <View style={{ marginVertical: 3 }}>
          <Inline theme={theme} spans={block.spans} color={color} base={type.body} />
        </View>
      );
  }
}

export function Markdown({
  theme,
  text,
  color,
  streaming = false,
}: {
  theme: Theme;
  text: string;
  color: string;
  /** true while the reply is still being generated */
  streaming?: boolean;
}) {
  const blocks = useMemo(() => {
    let parsed = parseMarkdown(text);
    if (!streaming) {
      // A finished reply can still end in an unterminated fence (small models
      // drop the closing ``` all the time). Once the stream is over, "open"
      // only means the model forgot to close it — render it as normal code.
      // Empty fences (another small-model tic: ```python``` with nothing in
      // between) get dropped rather than drawn as empty boxes.
      parsed = parsed.filter(b => b.kind !== 'code' || b.code.trim().length > 0);
      for (const b of parsed) {
        if (b.kind === 'code') b.open = false;
      }
    }
    return parsed;
  }, [text, streaming]);
  return (
    <View>
      {blocks.map((b, i) => (
        <Block key={i} theme={theme} block={b} color={color} />
      ))}
    </View>
  );
}
