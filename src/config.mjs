import { readFile } from 'node:fs/promises';
import { exists } from './util.mjs';

const sectionPattern = (section) => new RegExp(`(^|\\n)\\[${section.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\]\\n([\\s\\S]*?)(?=\\n\\[|$)`, 'm');
const safeKey = /^[a-zA-Z0-9_-]+$/;
const safeValue = /^(true|false|[0-9]+|"(?:[^"\\\\]|\\\\.)*")$/;

export function setTomlValues(text, section, values) {
  if (!['features', 'agents'].includes(section)) throw new Error(`Section not allowlisted: ${section}`);
  for (const [key, value] of Object.entries(values)) if (!safeKey.test(key) || !safeValue.test(String(value))) throw new Error(`Unsafe TOML value for ${key}`);
  const pattern = sectionPattern(section);
  const lines = Object.entries(values).map(([key, value]) => `${key} = ${value}`);
  const match = text.match(pattern);
  if (!match) return `${text.trimEnd()}${text.trim() ? '\n\n' : ''}[${section}]\n${lines.join('\n')}\n`;
  let body = match[2];
  for (const [key, value] of Object.entries(values)) {
    const keyPattern = new RegExp(`(^|\\n)${key}\\s*=.*?(?=\\n|$)`, 'm');
    body = keyPattern.test(body) ? body.replace(keyPattern, `$1${key} = ${value}`) : `${body.trimEnd()}\n${key} = ${value}\n`;
  }
  return text.replace(pattern, `${match[1]}[${section}]\n${body}`);
}

export async function readConfig(path) { return exists(path) ? readFile(path, 'utf8') : ''; }
