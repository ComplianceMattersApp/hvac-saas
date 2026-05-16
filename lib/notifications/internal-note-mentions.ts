export type InternalNoteMentionCandidate = {
  user_id: string;
  display_name: string;
};

export type ActiveMentionToken = {
  start: number;
  end: number;
  query: string;
};

const MENTION_TOKEN_PATTERN = /(^|[\s([{"'`])@([A-Za-z0-9._-]*)$/;

function normalizeMentionDisplayName(value: string) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

export function findActiveMentionToken(text: string, caretPosition: number): ActiveMentionToken | null {
  const source = String(text ?? "");
  const caret = Math.max(0, Math.min(Number(caretPosition ?? 0), source.length));
  const beforeCaret = source.slice(0, caret);
  const match = beforeCaret.match(MENTION_TOKEN_PATTERN);

  if (!match) return null;

  const token = String(match[2] ?? "");
  const tokenStart = Math.max(0, caret - token.length - 1);

  return {
    start: tokenStart,
    end: caret,
    query: token,
  };
}

export function insertMentionAtCaret(input: {
  text: string;
  caretPosition: number;
  displayName: string;
}): { text: string; caretPosition: number } {
  const source = String(input.text ?? "");
  const caret = Math.max(0, Math.min(Number(input.caretPosition ?? 0), source.length));
  const displayName = normalizeMentionDisplayName(input.displayName);
  if (!displayName) return { text: source, caretPosition: caret };

  const token = findActiveMentionToken(source, caret);
  const mention = `@${displayName}`;
  const trailingSpace = source[caret] === " " ? "" : " ";

  if (!token) {
    const needsLeadingSpace = source.length > 0 && !/\s$/.test(source);
    const prefix = needsLeadingSpace ? " " : "";
    const nextText = `${source}${prefix}${mention}${trailingSpace}`;
    return {
      text: nextText,
      caretPosition: nextText.length,
    };
  }

  const nextText = `${source.slice(0, token.start)}${mention}${trailingSpace}${source.slice(token.end)}`;
  const nextCaret = token.start + mention.length + (trailingSpace ? 1 : 0);

  return {
    text: nextText,
    caretPosition: nextCaret,
  };
}

export function removeMentionFromText(input: {
  text: string;
  displayName: string;
}): string {
  const source = String(input.text ?? "");
  const displayName = normalizeMentionDisplayName(input.displayName);
  if (!displayName) return source;

  const mentionPattern = new RegExp(`(^|\\s)@${displayName.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}(?=\\s|$)`, "i");
  const replaced = source.replace(mentionPattern, (match, leadingWhitespace) => {
    return String(leadingWhitespace ?? "");
  });

  return replaced.replace(/\s{2,}/g, " ").replace(/\s+([,.!?;:])/g, "$1").trimStart();
}
