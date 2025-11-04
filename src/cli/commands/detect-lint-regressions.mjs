#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

function parseArgs(argv) {
  const result = {};
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token || !token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      result[key] = next;
      index += 1;
    } else {
      result[key] = 'true';
    }
  }
  return result;
}

function listFilesRecursive(rootDir) {
  if (!rootDir || !fs.existsSync(rootDir)) {
    return [];
  }

  const stack = [rootDir];
  const files = [];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;

    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry) continue;
      if (entry.name === '.' || entry.name === '..') continue;
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else {
        files.push(fullPath);
      }
    }
  }

  return files;
}

function toRelative(filePath) {
  if (!filePath) return '';
  const normalized = filePath.replace(/\\/g, '/');
  const repository = process.env.GITHUB_REPOSITORY || '';
  const [, repoName = ''] = repository.split('/');
  if (repoName) {
    const marker = `/${repoName}/`;
    const index = normalized.lastIndexOf(marker);
    if (index >= 0) {
      return normalized.slice(index + marker.length);
    }
  }
  return normalized;
}

function parseCheckstyleFile(filePath) {
  const contents = fs.readFileSync(filePath, 'utf8');
  const filePattern = /<file\b[^>]*name="([^"]*)"[^>]*>([\s\S]*?)<\/file>/gi;
  const records = [];
  let match;

  while ((match = filePattern.exec(contents)) !== null) {
    const [, rawName = '', body = ''] = match;
    const name = toRelative(rawName);
    const errorPattern = /<error\b([^>]*)\/>/gi;
    let errorMatch;
    while ((errorMatch = errorPattern.exec(body)) !== null) {
      const attrs = errorMatch[1] || '';
      const severity = ((attrs.match(/severity="([^"]*)"/i) || [])[1] || '').toLowerCase();
      if (severity !== 'error') continue;
      const lineValue = (attrs.match(/line="([^"]*)"/i) || [])[1] || '';
      const columnValue = (attrs.match(/column="([^"]*)"/i) || [])[1] || '';
      const message = (attrs.match(/message="([^"]*)"/i) || [])[1] || '';
      const source = (attrs.match(/source="([^"]*)"/i) || [])[1] || '';
      const line = lineValue ? Number.parseInt(lineValue, 10) || null : null;
      const column = columnValue ? Number.parseInt(columnValue, 10) || null : null;
      const rule = source.split('.').slice(-1)[0] || source;
      records.push({
        file: name,
        line,
        column,
        message,
        rule,
        descriptor: `${name}|${line ?? ''}|${column ?? ''}|${message}|${source}`,
      });
    }
  }

  return records;
}

function collectLintErrors(rootDir) {
  const files = listFilesRecursive(rootDir).filter((file) => /checkstyle/i.test(path.basename(file)));
  const records = [];
  for (const file of files) {
    try {
      records.push(...parseCheckstyleFile(file));
    } catch {
      // ignore malformed files
    }
  }
  const descriptors = new Set(records.map((record) => record.descriptor));
  return {
    available: files.length > 0,
    files,
    records,
    descriptors,
    count: descriptors.size,
  };
}

function sanitizeSummary(text) {
  if (!text) return '';
  return String(text).replace(/\s+/g, ' ').trim();
}

function main() {
  const args = parseArgs(process.argv);
  const baseDir = args.base ? path.resolve(args.base) : null;
  const headDir = args.head ? path.resolve(args.head) : null;
  const mergeDir = args.merge ? path.resolve(args.merge) : null;
  const outputFile = args.output ? path.resolve(args.output) : null;

  let result;

  try {
    const base = collectLintErrors(baseDir);
    const head = collectLintErrors(headDir);
    const merge = collectLintErrors(mergeDir);

    let targetKey = null;
    let target = null;

    if (merge.available) {
      targetKey = 'merge';
      target = merge;
    } else if (head.available) {
      targetKey = 'head';
      target = head;
    }

    let status = 'clean';
    let summary = '';
    let newErrors = [];

    if (!target) {
      status = 'unknown';
      summary = 'Unable to evaluate lint errors (missing artifacts).';
    } else {
      const baseDescriptors = base.descriptors || new Set();
      newErrors = target.records.filter((record) => !baseDescriptors.has(record.descriptor));
      if (!base.available && target.records.length > 0) {
        newErrors = target.records.slice();
      }
      if (newErrors.length > 0) {
        status = 'new_errors';
        summary = `${newErrors.length} new lint error${newErrors.length === 1 ? '' : 's'} detected.`;
      }
    }

    result = {
      status,
      summary: sanitizeSummary(summary),
      base: { count: base.count || 0 },
      head: { count: head.count || 0 },
      merge: { count: merge.count || 0 },
      target: {
        key: targetKey,
        count: target ? target.count || 0 : 0,
      },
      newErrors: newErrors.map(({ descriptor, ...rest }) => rest),
    };

    if (outputFile) {
      try {
        fs.mkdirSync(path.dirname(outputFile), { recursive: true });
        fs.writeFileSync(outputFile, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
      } catch {
        // ignore write errors
      }
    }
  } catch (error) {
    const message = error && error.message ? String(error.message) : 'Unknown error';
    result = {
      status: 'error',
      summary: sanitizeSummary(message),
      base: { count: 0 },
      head: { count: 0 },
      merge: { count: 0 },
      target: { key: '', count: 0 },
      newErrors: [],
    };
  }

  const lines = [
    `lint_status=${result.status || ''}`,
    `lint_target=${result.target?.key || ''}`,
    `lint_new_errors=${result.newErrors?.length || 0}`,
    `lint_target_errors=${result.target?.count || 0}`,
    `lint_base_errors=${result.base?.count || 0}`,
    `lint_summary=${result.summary || ''}`,
  ];

  process.stdout.write(`${lines.join('\n')}\n`);
}

main();
