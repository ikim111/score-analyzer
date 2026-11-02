// 브라우저 확인 테스트.  사용:
//   node tests/smoke.js <정오표폴더>                 → 1개 시험 분석
//   node tests/smoke.js <1차폴더> <2차폴더>          → 두 시험 비교
// 결과: 오류 여부, 핵심 숫자, AI용 글에 학생 이름이 섞였는지, 가로 넘침(1280/400px), 스크린샷(tests/out/)
// 크롬 경로를 바꾸려면 CHROME=/path/to/chrome node tests/smoke.js ...
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('playwright-core')); } const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), OUT = path.join(__dirname, 'out'); fs.mkdirSync(OUT, { recursive: true });
const xl = d => fs.readdirSync(d).filter(f => /\.xlsx?$/i.test(f)).map(f => path.resolve(d, f));
// 한글 파일명을 경로로 넘기면 일부 환경에서 업로드가 안 되므로 내용(buffer)으로 넘긴다
const up = d => xl(d).map(f => ({ name: path.basename(f), mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: fs.readFileSync(f) }));
const names = dirs => { // 정오표에서 학생 이름(D열 근처 문자열)을 모아 AI 글에 섞였는지 검사
  const X = require('xlsx'); const set = new Set();
  dirs.forEach(d => xl(d).forEach(f => { const ws = X.readFile(f).Sheets; const rows = X.utils.sheet_to_json(ws[Object.keys(ws)[0]], { header: 1 });
    rows.forEach(r => { if (r && typeof r[2] === 'number' && typeof r[3] === 'string' && r[3].length >= 2) set.add(r[3]); else if (r && typeof r[1] === 'number' && typeof r[2] === 'string' && r[2].length >= 2) set.add(r[2]); }); }));
  return [...set]; };
(async () => {
  const dirs = process.argv.slice(2); if (!dirs.length) { console.log('폴더를 지정하세요'); process.exit(1); }
  const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME, args: ['--no-sandbox', '--headless=new'], ignoreDefaultArgs: ['--headless=old'] } : {});
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } }); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/fonts|ERR_/.test(m.text())) errs.push(m.text()); });
  const local = path.join(ROOT, 'node_modules/xlsx/dist/xlsx.full.min.js'); // CDN이 막힌 환경이면 로컬 SheetJS로 대체
  await p.route('**/xlsx.full.min.js', r => fs.existsSync(local) ? r.fulfill({ path: local, contentType: 'application/javascript' }) : r.continue());
  await p.goto('file://' + path.join(ROOT, 'index.html')); await p.waitForTimeout(800);
  let txt;
  if (dirs.length === 1) {
    await p.click('#pick1'); await p.setInputFiles('#file', up(dirs[0])); await p.waitForTimeout(3000);
    console.log('KPI:', await p.$$eval('#kpis .kpi', e => e.map(x => x.textContent.replace(/\s+/g, ' ').trim()).join(' | ')));
    txt = await p.$eval('#prompt', e => e.value);
  } else {
    await p.click('#pick2'); await p.setInputFiles('#fileA', up(dirs[0])); await p.setInputFiles('#fileB', up(dirs[1])); await p.waitForTimeout(4000);
    console.log('짝짓기:', await p.$eval('#cstat', e => e.textContent));
    console.log('KPI:', await p.$$eval('#ckpis .kpi', e => e.map(x => x.textContent.replace(/\s+/g, ' ').trim()).join(' | ')));
    txt = await p.$eval('#cprompt', e => e.value);
  }
  const leak = names(dirs).filter(n => txt.includes(n));
  console.log('오류:', errs.length ? errs : '없음'); console.log('AI 글 길이:', txt.length, '| NaN/undefined:', /NaN|undefined/.test(txt) ? '있음!' : '없음', '| 학생 이름 섞임:', leak.length ? leak.slice(0, 5) : '없음');
  console.log('가로 넘침 1280:', await p.evaluate(() => document.documentElement.scrollWidth) > 1280 ? '있음!' : '없음');
  await p.screenshot({ path: path.join(OUT, 'full.png'), fullPage: true });
  await p.setViewportSize({ width: 400, height: 800 }); await p.waitForTimeout(300);
  console.log('가로 넘침 400:', await p.evaluate(() => document.documentElement.scrollWidth) > 400 ? '있음!' : '없음');
  fs.writeFileSync(path.join(OUT, 'prompt.txt'), txt); console.log('스크린샷·AI 글: tests/out/');
  await b.close();
})();
