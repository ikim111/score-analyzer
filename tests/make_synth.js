// 개인정보 없는 가짜 정오표 생성 (테스트용).  사용: node tests/make_synth.js
// tests/data/synth_a : 20문항, 서답형 없음, 3개 반   tests/data/synth_b : 22문항, 서답형 있음, 3개 반(같은 학번)
const X = require('xlsx'), fs = require('fs'), path = require('path');
function mk(dir, cls, nItems, withSA, seedBase) {
  const rows = [[], [null, `2026학년도 1학기 주간 2학년 ${cls}반 기말고사 과학`], [], [], [], []];
  const hdr = [null, '반/번호', null, '번호']; for (let i = 1; i <= nItems; i++) hdr.push(i);
  hdr.push('선택형점수'); if (withSA) hdr.push('서답형점수'); hdr.push('기타\n점수', null, '영역\n총점'); rows.push(hdr);
  const key = [null, null, null, '정답'], pts = [null, null, null, '배점'], K = [];
  const pt = withSA ? 3 : 5; for (let i = 0; i < nItems; i++) { const k = String(1 + (i * 3) % 5); K.push(k); key.push(k); pts.push(pt); }
  const mcMax = pt * nItems; key.push(null); pts.push(mcMax); if (withSA) pts.push(100 - mcMax); pts.push(0, null, 100); rows.push(key); rows.push(pts);
  let seed = cls * 101 + seedBase; const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  for (let n = 1; n <= 25; n++) { const ab = (((cls * 100 + n) * 7919) % 100) / 100; const r = [null, `${cls}/${n}`, 2025000000 + cls * 100 + n, '학생' + n]; let mc = 0;
    for (let i = 0; i < nItems; i++) { if (rnd() < 0.25 + 0.65 * ab) { r.push('.'); mc += pt; } else { let w = String(1 + Math.floor(rnd() * 5)); if (w === K[i]) w = '-'; r.push(w); } }
    r.push(mc); let sa = 0; if (withSA) { sa = Math.round(rnd() * (100 - mcMax)); r.push(sa); } r.push(0, null, mc + sa); rows.push(r); }
  fs.mkdirSync(dir, { recursive: true }); const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(rows), 's'); X.writeFile(wb, path.join(dir, `${cls}반.xlsx`));
}
const D = path.join(__dirname, 'data');
[1, 2, 3].forEach(c => { mk(path.join(D, 'synth_a'), c, 20, false, 7); mk(path.join(D, 'synth_b'), c, 22, true, 13); });
console.log('tests/data/synth_a, synth_b 생성');
