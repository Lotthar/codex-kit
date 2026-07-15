import { readFile } from 'node:fs/promises';
import { exists } from './util.mjs';
import { detectEol } from './platform.mjs';

const safeKey = /^[a-zA-Z0-9_-]+$/;
const safeValue = /^(true|false|[0-9]+|"(?:[^"\\]|\\.)*")$/;

export function setTomlValues(text, section, values) {
  if (!['features', 'agents'].includes(section)) throw new Error(`Section not allowlisted: ${section}`);
  for (const [key, value] of Object.entries(values)) if (!safeKey.test(key) || !safeValue.test(String(value))) throw new Error(`Unsafe TOML value for ${key}`);
  const eol = detectEol(text);
  const bom = text.startsWith('\uFEFF') ? '\uFEFF' : '';
  const lines = text.slice(bom.length).split(/\r?\n/);
  const headers = lines.map((line, index) => ({ index, name: line.match(/^\s*\[([^\]]+)]\s*(?:#.*)?$/)?.[1] })).filter((item) => item.name);
  const matching = headers.filter((item) => item.name === section);
  if (matching.length > 1) throw new Error(`Duplicate [${section}] table.`);
  const target = matching[0];
  if (!target) {
    const suffix = lines.length && lines.at(-1) === '' ? lines.slice(0, -1) : lines;
    return `${bom}${suffix.join(eol)}${suffix.length ? `${eol}${eol}` : ''}[${section}]${eol}${Object.entries(values).map(([key, value]) => `${key} = ${value}`).join(eol)}${eol}`;
  }
  const nextHeader = headers.find((item) => item.index > target.index)?.index ?? lines.length;
  const body = lines.slice(target.index + 1, nextHeader);
  for (const [key, value] of Object.entries(values)) {
    const matches = body.map((line, index) => ({ index, match: line.match(new RegExp(`^\\s*${key}\\s*=`)) })).filter((item) => item.match);
    if (matches.length > 1) throw new Error(`Duplicate key ${key} in [${section}].`);
    if (matches.length) body[matches[0].index] = `${key} = ${value}`;
    else body.push(`${key} = ${value}`);
  }
  return `${bom}${[...lines.slice(0, target.index + 1), ...body, ...lines.slice(nextHeader)].join(eol)}`;
}

export async function readConfig(path) { return exists(path) ? readFile(path, 'utf8') : ''; }
