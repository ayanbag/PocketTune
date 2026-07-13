/**
 * Chat session persistence — every conversation is stored with the context
 * that produced it (model, engine config, per-reply speed/token metadata), so
 * the transcript doubles as evidence of what the tuned config feels like.
 *
 * Same best-effort discipline as tuner state: a storage failure must never
 * take the chat down with it.
 */
import * as RNFS from '@dr.pogodin/react-native-fs';
import type { ChatSession } from '../types';

const CHATS_FILE = `${RNFS.DocumentDirectoryPath}/pockettune-chats.json`;

/** Keep the archive bounded; oldest sessions fall off. */
const MAX_SESSIONS = 30;

export async function loadChats(): Promise<ChatSession[]> {
  try {
    const raw = await RNFS.readFile(CHATS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.sessions)) return [];
    return parsed.sessions.filter(
      (s: ChatSession) => s && typeof s.id === 'string' && Array.isArray(s.messages),
    );
  } catch {
    return [];
  }
}

export async function saveChats(sessions: ChatSession[]): Promise<void> {
  try {
    // Empty sessions aren't worth a disk write or a history row.
    const keep = sessions.filter(s => s.messages.length > 0).slice(0, MAX_SESSIONS);
    await RNFS.writeFile(CHATS_FILE, JSON.stringify({ sessions: keep }), 'utf8');
  } catch {
    // best-effort
  }
}

/** First user line, trimmed to a list-row title. */
export function sessionTitle(s: ChatSession): string {
  const first = s.messages.find(m => m.role === 'user')?.text ?? 'New chat';
  return first.length > 44 ? `${first.slice(0, 44)}…` : first;
}

export interface SessionStats {
  replies: number;
  /** mean decode tok/s across measured replies, null when none measured */
  avgTps: number | null;
  /** decode tok/s per measured reply, chat order — sparkline input */
  tpsSeries: number[];
  totalTokens: number;
}

export function sessionStats(s: ChatSession): SessionStats {
  const measured = s.messages.filter(
    m => m.role === 'assistant' && m.tps != null && m.tps > 0,
  );
  const tpsSeries = measured.map(m => m.tps as number);
  return {
    replies: s.messages.filter(m => m.role === 'assistant').length,
    avgTps: tpsSeries.length
      ? tpsSeries.reduce((a, b) => a + b, 0) / tpsSeries.length
      : null,
    tpsSeries,
    totalTokens: measured.reduce((a, m) => a + (m.tokens ?? 0), 0),
  };
}
