#!/usr/bin/env node
/**
 * Coverage 결과를 HTML 이메일로 발송하는 스크립트
 *
 * Usage:
 *   node send-coverage-mail.mjs --to <email> --project <name> --version <ver> \
 *     [--back <file> --back-version <ver>] [--front <file> --front-version <ver>]
 *
 * 최소 --back 또는 --front 중 하나는 필수.
 */

import nodemailer from 'nodemailer';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const skillDir = resolve(__dirname, '..');

// ── CLI 파싱 ──────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    if (argv[i].startsWith('--') && i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
      args[argv[i].slice(2)] = argv[i + 1];
      i++;
    }
  }
  return args;
}

const args = parseArgs(process.argv);
const recipient = args.to;
const projectName = args.project || 'project';
const version = args.version || 'untagged';
const backFile = args.back;
const frontFile = args.front;
const backVersion = args['back-version'] || version;
const frontVersion = args['front-version'] || version;

if (!recipient) {
  console.error('Usage: node send-coverage-mail.mjs --to <email> --project <name> --version <ver> [--back <file> --back-version <ver>] [--front <file> --front-version <ver>]');
  process.exit(1);
}

if (!backFile && !frontFile) {
  console.error('❌ --back 또는 --front 중 하나 이상의 coverage 파일을 지정해주세요.');
  process.exit(1);
}

// .env 로드 - 스킬 디렉토리 기준
dotenv.config({ path: resolve(skillDir, '.env') });

const MAIL_USER = process.env.MAIL_USER;
const MAIL_PASS = process.env.MAIL_PASS;

if (!MAIL_USER || !MAIL_PASS) {
  console.error('❌ .env에 MAIL_USER와 MAIL_PASS를 설정해주세요.');
  console.error('   MAIL_USER=your@gmail.com');
  console.error('   MAIL_PASS=앱비밀번호16자리');
  process.exit(1);
}

// ── 섹션별 파싱 ────────────────────────────────────────────────────────────
const sections = [];

if (backFile) {
  const text = readFileSync(backFile, 'utf8');
  sections.push({ label: 'Backend', version: backVersion, coverage: parseCoverage(text), summary: parseTestSummary(text) });
}

if (frontFile) {
  const text = readFileSync(frontFile, 'utf8');
  sections.push({ label: 'Frontend', version: frontVersion, coverage: parseCoverage(text), summary: parseTestSummary(text) });
}

const mergedSummary = mergeSummaries(sections.map(s => s.summary));
const html = buildHtml(sections, mergedSummary, projectName, version);
await sendMail(recipient, html, projectName, mergedSummary, version);

// ── 요약 병합 ──────────────────────────────────────────────────────────────
function mergeSummaries(summaries) {
  const merged = { suites: 0, suitesTotal: 0, tests: 0, testsTotal: 0, failed: 0, time: '0s', allPassed: true };
  let totalSeconds = 0;

  for (const s of summaries) {
    merged.suites += s.suites;
    merged.suitesTotal += s.suitesTotal;
    merged.tests += s.tests;
    merged.testsTotal += s.testsTotal;
    merged.failed += s.failed;
    if (!s.allPassed) merged.allPassed = false;
    const timeMatch = s.time.match(/([\d.]+)/);
    if (timeMatch) totalSeconds += parseFloat(timeMatch[1]);
  }

  merged.time = `${totalSeconds.toFixed(1)}s`;
  return merged;
}

// ── 테스트 요약 파싱 ───────────────────────────────────────────────────────
function parseTestSummary(text) {
  const summary = { suites: 0, suitesTotal: 0, tests: 0, testsTotal: 0, failed: 0, time: '0s', allPassed: true };

  // Jest:   "Test Suites: 1 failed, 22 passed, 23 total"
  // Vitest: "Test Files  24 passed (24)"  or  "Test Files  1 failed | 23 passed (24)"
  const jestSuitesMatch = text.match(/Test Suites:\s+(?:(\d+) failed,\s+)?(\d+) passed,\s+(\d+) total/);
  const vitestSuitesMatch = text.match(/Test Files\s+(?:(\d+) failed\s*\|\s*)?(\d+) passed\s*\((\d+)\)/);
  const suitesMatch = jestSuitesMatch || vitestSuitesMatch;

  if (suitesMatch) {
    summary.suites = parseInt(suitesMatch[2]);
    summary.suitesTotal = parseInt(suitesMatch[3]);
    if (suitesMatch[1]) {
      summary.failed = parseInt(suitesMatch[1]);
      summary.allPassed = false;
    }
  }

  // Jest:   "Tests: 1 failed, 310 passed, 311 total"
  // Vitest: "Tests  91 passed (91)"  or  "Tests  2 failed | 89 passed (91)"
  const jestTestsMatch = text.match(/Tests:\s+(?:(\d+) failed,\s+)?(\d+) passed,\s+(\d+) total/);
  const vitestTestsMatch = text.match(/Tests\s+(?:(\d+) failed\s*\|\s*)?(\d+) passed\s*\((\d+)\)/);
  const testsMatch = jestTestsMatch || vitestTestsMatch;

  if (testsMatch) {
    summary.tests = parseInt(testsMatch[2]);
    summary.testsTotal = parseInt(testsMatch[3]);
    if (testsMatch[1]) {
      summary.failed += parseInt(testsMatch[1]);
      summary.allPassed = false;
    }
  }

  // Jest:   "Time:  6.589 s"
  // Vitest: "Duration  5.69s (transform ...)"
  const timeMatch = text.match(/Time:\s+([\d.]+\s*s)/) || text.match(/Duration\s+([\d.]+s)/);
  if (timeMatch) summary.time = timeMatch[1];

  return summary;
}

// ── 커버리지 파싱 ("All files" 총합 행만 추출) ─────────────────────────────
function parseCoverage(text) {
  const lines = text.split('\n');
  let separatorCount = 0;

  for (const line of lines) {
    if (/^[-| ]+$/.test(line) && line.includes('|')) {
      separatorCount++;
      continue;
    }
    if (separatorCount !== 2) continue;

    const parts = line.split('|').map(p => p.trim()).filter(Boolean);
    if (parts.length < 5) continue;

    const [file, stmts, branch, funcs, lines_] = parts;
    if (file.trim().toLowerCase() !== 'all files') continue;

    return { stmts: parseFloat(stmts), branch: parseFloat(branch), funcs: parseFloat(funcs), lines: parseFloat(lines_) };
  }

  return null;
}

// ── HTML 빌드 ─────────────────────────────────────────────────────────────
function pctColor(val) {
  if (val >= 80) return '#16a34a';
  if (val >= 60) return '#d97706';
  return '#dc2626';
}

function buildSectionHtml(section) {
  const { label, version: sectionVersion, coverage, summary } = section;

  const statusIcon = summary.allPassed ? '✅' : '❌';
  const statusText = summary.allPassed ? 'Passed' : 'Failed';
  const statusColor = summary.allPassed ? '#16a34a' : '#dc2626';

  const sectionHeader = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
      <div style="font-size:16px;font-weight:700;color:#111827">${label}</div>
      <span style="font-size:11px;color:#6b7280;background:#f3f4f6;border-radius:4px;padding:2px 8px;font-family:monospace">v${sectionVersion}</span>
      <span style="font-size:12px;color:${statusColor};font-weight:600">${statusIcon} ${summary.tests}/${summary.testsTotal} tests ${statusText}</span>
      <span style="font-size:12px;color:#9ca3af">${summary.time}</span>
    </div>`;

  const coverageSummary = coverage ? `
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      ${[['Stmts', coverage.stmts], ['Branch', coverage.branch], ['Funcs', coverage.funcs], ['Lines', coverage.lines]].map(([l, v]) => `
        <div style="flex:1;min-width:70px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:10px;text-align:center">
          <div style="font-size:16px;font-weight:700;color:${pctColor(v)}">${v.toFixed(1)}%</div>
          <div style="font-size:11px;color:#9ca3af;margin-top:2px">${l}</div>
        </div>`).join('')}
    </div>` : '';

  return `${sectionHeader}${coverageSummary}`;
}

function buildHtml(sections, mergedSummary, projectName, version) {
  const now = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });

  const headerBg = mergedSummary.allPassed ? '#16a34a' : '#dc2626';
  const headerIcon = mergedSummary.allPassed ? '✅' : '❌';
  const headerTitle = mergedSummary.allPassed ? 'All Tests Passed' : 'Tests Failed';

  const isBothSections = sections.length > 1;

  // ── 히어로 카드 (전체 합산) ──
  const heroCards = `
    <div style="display:flex;gap:16px;margin-bottom:32px;flex-wrap:wrap">
      <div style="flex:2;min-width:160px;background:${mergedSummary.allPassed ? '#f0fdf4' : '#fef2f2'};border:1px solid ${mergedSummary.allPassed ? '#bbf7d0' : '#fecaca'};border-radius:12px;padding:20px;text-align:center">
        <div style="font-size:36px;font-weight:800;color:${mergedSummary.allPassed ? '#16a34a' : '#dc2626'}">${mergedSummary.tests}</div>
        <div style="font-size:13px;color:#6b7280;margin-top:4px">Tests Passed</div>
      </div>
      ${mergedSummary.failed > 0 ? `
      <div style="flex:2;min-width:160px;background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:20px;text-align:center">
        <div style="font-size:36px;font-weight:800;color:#dc2626">${mergedSummary.failed}</div>
        <div style="font-size:13px;color:#6b7280;margin-top:4px">Failed</div>
      </div>` : ''}
      <div style="flex:1;min-width:120px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:20px;text-align:center">
        <div style="font-size:28px;font-weight:700;color:#374151">${mergedSummary.suitesTotal}</div>
        <div style="font-size:13px;color:#6b7280;margin-top:4px">Test Suites</div>
      </div>
      <div style="flex:1;min-width:120px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:20px;text-align:center">
        <div style="font-size:28px;font-weight:700;color:#374151">${mergedSummary.time}</div>
        <div style="font-size:13px;color:#6b7280;margin-top:4px">Duration</div>
      </div>
    </div>`;

  // ── 섹션별 상세 ──
  const sectionDivider = '<div style="border-top:1px solid #e5e7eb;margin:24px 0"></div>';
  const sectionsHtml = sections.map(s => buildSectionHtml(s)).join(sectionDivider);

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <div style="max-width:680px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1)">
    <div style="background:${headerBg};padding:28px 32px;color:#fff">
      <div style="font-size:22px;font-weight:700">${headerIcon} ${headerTitle}</div>
      <div style="margin-top:12px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <span style="font-size:13px;opacity:0.85">${projectName}</span>
        <span style="opacity:0.4">·</span>
        <span style="display:inline-flex;align-items:center;gap:5px;background:rgba(255,255,255,0.22);border:1px solid rgba(255,255,255,0.45);border-radius:6px;padding:3px 10px;font-size:13px;font-weight:700;letter-spacing:0.04em">
          ${version}
        </span>
        ${isBothSections ? '<span style="opacity:0.4">·</span><span style="font-size:12px;opacity:0.85">Backend + Frontend</span>' : ''}
        <span style="opacity:0.4">·</span>
        <span style="font-size:12px;opacity:0.75">${now}</span>
      </div>
    </div>
    <div style="padding:32px">
      ${heroCards}
      ${sectionsHtml}
    </div>
  </div>
</body></html>`;
}

// ── 메일 발송 ─────────────────────────────────────────────────────────────
async function sendMail(to, html, projectName, summary, version) {
  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: { user: MAIL_USER, pass: MAIL_PASS },
  });

  const now = new Date().toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' });
  const status = summary?.allPassed ? '✅ Passed' : '❌ Failed';
  const testCount = summary ? `${summary.tests}/${summary.testsTotal}` : '';

  await transporter.sendMail({
    from: `"${projectName} CI" <${MAIL_USER}>`,
    to,
    subject: `[${projectName}] ${version} · ${status} · ${testCount} tests · ${now}`,
    html,
  });

  console.log(`✅ Coverage 리포트 발송 완료 → ${to}`);
}
