// NEIS 정오표 분석 엔진 — browser/node 공용. 입력: 반별 시트 2D 배열 (SheetJS sheet_to_json header:1 결과).
(function (root) {
  const ITEM_COLS = [4,5,6,7,8,10,11,12,13,14,15,16,17,18,19,20,21,22,24,25,27,28,30]; // E..AE, 빈 열(J,X,AA,AD) 건너뜀
  const COL = { no: 1, sid: 2, name: 3, mc: 31, sa: 32, tot: 35 }; // B,C,D, AF,AG, AJ
  const norm = v => (v === null || v === undefined) ? "" : String(v).trim().replace(/\.0$/, "");

  function parseSheet(rows) {
    // rows: array of arrays (SheetJS header:1). Column A may be dropped by the reader, so locate '반/번호' and offset from it.
    let title = "", hdr = -1, off = 0;
    for (let i = 0; i < Math.min(rows.length, 12); i++) {
      const r = rows[i] || [];
      for (const c of r) if (typeof c === "string" && c.includes("학년도")) title = c.replace(/\s+/g, " ");
      const j = r.indexOf("반/번호"); if (j >= 0) { hdr = i; off = j - 1; }   // in NEIS, '반/번호' is column B (index 1)
    }
    if (hdr < 0) return null;
    // 헤더 행에서 직접 열을 찾는다: 문항 번호(숫자 1..N) 열, '선택형'/'서답형'/'총점' 열. 못 찾으면 고정 배치(2학년 수학 23문항)로 되돌아간다.
    const H = rows[hdr] || [], C = {};
    const hdrText = c => typeof c === "string" ? c.replace(/\s+/g, "") : "";
    let cols = []; H.forEach((c, j) => { const v = typeof c === "number" ? c : (typeof c === "string" && /^\d+$/.test(c.trim()) ? Number(c) : NaN); if (Number.isInteger(v) && v === cols.length + 1 && j > off + 3) cols.push(j); });
    C.no = off + 1; C.sid = off + 2; C.name = off + 3;
    C.mc = H.findIndex(c => hdrText(c).includes("선택형")); C.sa = H.findIndex(c => hdrText(c).includes("서답형")); C.tot = H.findIndex(c => hdrText(c).includes("총점"));
    if (cols.length < 3 || C.tot < 0) { cols = ITEM_COLS.map(c => c + off); for (const k in COL) C[k] = COL[k] + off; }
    const keyRow = rows[hdr + 1] || [], ptRow = rows[hdr + 2] || [];
    const key = cols.map(c => norm(keyRow[c])), pts = cols.map(c => Number(ptRow[c]) || 0);
    const nq = key.filter(k => k !== "").length;
    const saMax = C.sa >= 0 ? (Number(ptRow[C.sa]) || 0) : 0;
    const cls = (title.match(/(\d+)\s*반/) || [])[1];
    const students = [];
    for (let i = hdr + 3; i < rows.length; i++) {
      const r = rows[i] || [];
      const sid = r[C.sid], tot = r[C.tot];
      if (typeof sid !== "number" || typeof tot !== "number") continue;
      const resp = cols.slice(0, nq).map(c => norm(r[c]));
      const correct = resp.map((v, q) => (v === "." || v === key[q]) ? 1 : 0);
      const raw = resp.map((v, q) => v === "." ? key[q] : v);
      students.push({ cls: Number(cls), no: Number(String(r[C.no]).split("/")[1] || 0), sid: String(sid), name: String(r[C.name] || ""),
        tot, mc: C.mc >= 0 ? (Number(r[C.mc]) || 0) : tot, sa: C.sa >= 0 && typeof r[C.sa] === "number" ? r[C.sa] : 0, correct, raw });
    }
    return { title, cls: Number(cls), key: key.slice(0, nq), pts: pts.slice(0, nq), nq, saMax, students };
  }

  const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
  const sd = a => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
  const median = a => { const b = [...a].sort((x, y) => x - y), n = b.length; return n % 2 ? b[(n - 1) / 2] : (b[n / 2 - 1] + b[n / 2]) / 2; };
  const quantile = (a, p) => { const b = [...a].sort((x, y) => x - y); const h = (b.length - 1) * p, lo = Math.floor(h); return b[lo] + (h - lo) * ((b[lo + 1] ?? b[lo]) - b[lo]); };
  const skew = a => { const m = mean(a), n = a.length, s = sd(a); return n / ((n - 1) * (n - 2)) * a.reduce((t, x) => t + ((x - m) / s) ** 3, 0); };
  const corr = (x, y) => { const mx = mean(x), my = mean(y); let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < x.length; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; } return sxy / Math.sqrt(sxx * syy); };
  // F distribution upper tail via regularized incomplete beta
  function betacf(a, b, x) { let qab = a + b, qap = a + 1, qam = a - 1, c = 1, d = 1 - qab * x / qap; d = 1 / d; let h = d;
    for (let m = 1; m <= 200; m++) { let m2 = 2 * m, aa = m * (b - m) * x / ((qam + m2) * (a + m2)); d = 1 + aa * d; d = 1 / d; c = 1 + aa / c; h *= d * c;
      aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2)); d = 1 + aa * d; d = 1 / d; c = 1 + aa / c; const del = d * c; h *= del; if (Math.abs(del - 1) < 3e-12) break; } return h; }
  function lgamma(z) { const g = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5]; let x = z, y = z, tmp = x + 5.5; tmp -= (x + 0.5) * Math.log(tmp); let ser = 1.000000000190015; for (let j = 0; j < 6; j++) ser += g[j] / ++y; return -tmp + Math.log(2.5066282746310005 * ser / x); }
  function ibeta(a, b, x) { if (x <= 0) return 0; if (x >= 1) return 1; const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x)); return x < (a + 1) / (a + b + 2) ? bt * betacf(a, b, x) / a : 1 - bt * betacf(b, a, 1 - x) / b; }
  const fPvalue = (F, d1, d2) => ibeta(d2 / 2, d1 / 2, d2 / (d2 + d1 * F));

  function analyze(sheets, domainTags) {
    const parsed = sheets.map(parseSheet).filter(Boolean).sort((a, b) => a.cls - b.cls);
    if (!parsed.length) return null;
    const key = parsed[0].key, pts = parsed[0].pts, nq = parsed[0].nq;
    const S = parsed.flatMap(p => p.students);
    const n = S.length, tot = S.map(s => s.tot);
    const m27 = Math.round(n * 0.27);
    const sorted = [...S].sort((a, b) => b.tot - a.tot);
    const upCut = sorted[m27 - 1].tot, loCut = sorted[n - m27].tot;
    S.forEach(s => { s.up = s.tot >= upCut; s.lo = s.tot <= loCut; });
    const nUp = S.filter(s => s.up).length, nLo = S.filter(s => s.lo).length;
    const ncor = S.map(s => s.correct.reduce((a, b) => a + b, 0));
    const items = [];
    for (let q = 0; q < nq; q++) {
      const c = S.map(s => s.correct[q]);
      const p = mean(c);
      const pu = S.filter(s => s.up).reduce((a, s) => a + s.correct[q], 0) / nUp;
      const pl = S.filter(s => s.lo).reduce((a, s) => a + s.correct[q], 0) / nLo;
      const rest = S.map((s, i) => s.tot - s.correct[q] * pts[q]);
      const rpb = corr(c, rest);
      const opt = {}; S.forEach(s => { const v = s.raw[q] || "-"; opt[v] = (opt[v] || 0) + 1; });
      const rate = k => (opt[k] || 0) / n;
      const o = ["1", "2", "3", "4", "5"].map(rate);
      const multiWrong = Object.keys(opt).filter(k => /^[A-Z]$/.test(k) && k !== key[q]).reduce((a, k) => a + opt[k], 0) / n;
      const blank = rate("-");
      // by option: upper/lower share (for distractor analysis)
      const optUp = ["1", "2", "3", "4", "5"].map(k => S.filter(s => s.up && (s.raw[q] === k)).length / nUp);
      const optLo = ["1", "2", "3", "4", "5"].map(k => S.filter(s => s.lo && (s.raw[q] === k)).length / nLo);
      let worst = "", wmax = 0; ["1", "2", "3", "4", "5"].forEach((k, i) => { if (k !== key[q] && o[i] > wmax) { wmax = o[i]; worst = "①②③④⑤"[i]; } });
      const D = pu - pl;
      let verdict = D >= 0.4 ? "변별 우수" : D >= 0.3 ? "양호" : D < 0.2 ? "변별↓ 검토" : "보통";
      if (p >= 0.9) verdict = "쉬움(기초확인)";
      else if (p < 0.5 && D < 0.3) verdict = "어려움+변별↓ 오개념 의심";
      items.push({ q: q + 1, key: key[q], pts: pts[q], p, D, pu, pl, rpb, o, optUp, optLo, multiWrong, blank, worst, verdict, midRate: null });
    }
    // mid group rate (between cuts)
    const mid = S.filter(s => !s.up && !s.lo);
    items.forEach(it => { it.midRate = mid.length ? mid.reduce((a, s) => a + s.correct[it.q - 1], 0) / mid.length : null; });
    // reliability
    const kr20 = nq / (nq - 1) * (1 - items.reduce((a, it) => a + it.p * (1 - it.p), 0) / (sd(ncor) ** 2));
    const dist = { n, mean: mean(tot), median: median(tot), sd: sd(tot), min: Math.min(...tot), max: Math.max(...tot), q1: quantile(tot, .25), q3: quantile(tot, .75), skew: skew(tot),
      ge90: tot.filter(x => x >= 90).length, ge80: tot.filter(x => x >= 80).length, lt60: tot.filter(x => x < 60).length, lt40: tot.filter(x => x < 40).length,
      kr20, sem: sd(tot) * Math.sqrt(1 - kr20), corrMcSa: (() => { const c = corr(S.map(s => s.mc), S.map(s => s.sa)); return Number.isFinite(c) ? c : 0; })(), saMean: mean(S.map(s => s.sa)), mcMean: mean(S.map(s => s.mc)) };
    dist.iqr = dist.q3 - dist.q1;
    const bands = [["100", 100, 100]]; for (let h = 99; h >= 5; h -= 5) bands.push([`${h - 4}-${h}`, h - 4, h]); bands.push(["0-4", 0, 4]);
    dist.hist = bands.map(([l, lo, hi]) => [l, tot.filter(x => x >= lo && x <= hi).length]);
    // classes
    const classes = parsed.map(p => { const t = p.students.map(s => s.tot); const nn = t.length; return { cls: p.cls, n: nn, mean: mean(t), median: median(t), sd: nn > 1 ? sd(t) : 0, iqr: quantile(t, .75) - quantile(t, .25), min: Math.min(...t), max: Math.max(...t),
      ge80: t.filter(x => x >= 80).length, lt60: t.filter(x => x < 60).length, mc: mean(p.students.map(s => s.mc)), sa: mean(p.students.map(s => s.sa)) }; });
    classes.forEach(c => { c.shape = (c.sd > dist.sd * 1.1 && c.iqr < dist.iqr * 0.8) ? "소수 극단값 (개별 지원)" : (c.sd > dist.sd * 1.1 && c.iqr > dist.iqr * 1.1) ? "전체가 넓게 퍼짐 (수준별 과제)" : c.sd > dist.sd * 1.1 ? "넓게 퍼짐 + 하위권 있음" : c.sd < dist.sd * 0.85 ? "고름" : "보통"; });
    let anova = null;
    if (classes.length > 1) { const k = classes.length, gm = dist.mean; const ssb = classes.reduce((a, c) => a + c.n * (c.mean - gm) ** 2, 0), ssw = classes.reduce((a, c) => a + (c.n - 1) * c.sd ** 2, 0);
      const F = (ssb / (k - 1)) / (ssw / (n - k)); anova = { F, p: fPvalue(F, k - 1, n - k), eta2: ssb / (ssb + ssw) }; }
    // ---- 추가 분석 ----
    const X = {};
    // (a) 오답지 질: 작동하는 오답지 수(선택률 5%↑), 죽은 오답지, 상위>하위로 고른 오답지(함정/오류 의심)
    items.forEach(it => {
      const ans = ["1","2","3","4","5"];
      it.working = ans.filter((k,i)=>k!==it.key && it.o[i]>=0.05).length;
      it.dead = ans.filter((k,i)=>k!==it.key && it.o[i]<0.02).map((k)=>"①②③④⑤"[ans.indexOf(k)]);
      it.suspect = ans.filter((k,i)=>k!==it.key && it.o[i]>=0.10 && it.optUp[i] >= it.optLo[i]*0.8).map(k=>"①②③④⑤"[ans.indexOf(k)]);
      it.pattern = it.p>=0.5 ? "" : (() => { const w = ans.map((k,i)=>k===it.key?0:it.o[i]); const top = Math.max(...w); const wrongTotal = w.reduce((a,b)=>a+b,0); return wrongTotal>0 && top/wrongTotal>=0.55 ? "쏠림형(공통 오개념)" : "흩어짐형(개념 부재/찍기)"; })();
    });
    X.deadTotal = items.reduce((a,it)=>a+it.dead.length,0);
    X.workingMean = mean(items.map(it=>it.working));
    X.effectiveChoices = items.map(it=>1+it.working);
    // (b) 성적대별 문항 정답률 (4분위): 어느 문항이 어느 집단을 가르는지
    const q = [quantile(tot,.25), quantile(tot,.5), quantile(tot,.75)];
    const grp = s => s.tot<=q[0]?0 : s.tot<=q[1]?1 : s.tot<=q[2]?2 : 3;
    const G = [[],[],[],[]]; S.forEach(s=>G[grp(s)].push(s));
    X.quartiles = G.map((g,i)=>({ label:["하위25%","25~50%","50~75%","상위25%"][i], n:g.length, mean: g.length?mean(g.map(s=>s.tot)):0, range:[g.length?Math.min(...g.map(s=>s.tot)):0, g.length?Math.max(...g.map(s=>s.tot)):0], sa: g.length?mean(g.map(s=>s.sa)):0, mc: g.length?mean(g.map(s=>s.mc)):0 }));
    items.forEach(it => { it.byQ = G.map(g => g.length ? g.reduce((a,s)=>a+s.correct[it.q-1],0)/g.length : 0); it.monotone = !(it.byQ[1] < it.byQ[0]-0.05 || it.byQ[2] < it.byQ[1]-0.05 || it.byQ[3] < it.byQ[2]-0.05); });
    X.nonMonotone = items.filter(it=>!it.monotone).map(it=>it.q);
    // (c) 최하위 20명 진단: 쉬운 문항(정답률 85%↑)도 못 맞히는가 / 어느 문항부터 무너지나
    const bottom = sorted.slice(-Math.min(20, n));
    X.bottom = { n: bottom.length, maxScore: bottom[0]?.tot, rates: items.map(it => bottom.reduce((a,s)=>a+s.correct[it.q-1],0)/bottom.length), sa: mean(bottom.map(s=>s.sa)) };
    X.bottom.easyMissed = items.filter((it,i)=>it.p>=0.85 && X.bottom.rates[i]<0.5).map(it=>it.q);
    X.bottom.zeroItems = items.filter((it,i)=>X.bottom.rates[i]<=0.1).map(it=>it.q);
    // (d) 선택형 vs 서답형 불일치 학생 수
    const mcMax = pts.reduce((a,b)=>a+b,0), saMax = Math.max(...parsed.map(p=>p.saMax||0)), hasSA = saMax > 0;
    X.mismatch = { mcHighSaLow: S.filter(s=>s.mc/mcMax>=0.8 && s.sa/saMax<=0.5).length, mcLowSaHigh: S.filter(s=>s.mc/mcMax<0.6 && s.sa/saMax>=0.8).length, saZero: S.filter(s=>s.sa===0).length, saFull: S.filter(s=>s.sa===saMax).length, saMax, hasSA };
    if (!hasSA) X.mismatch = { ...X.mismatch, mcHighSaLow: 0, mcLowSaHigh: 0, saZero: 0, saFull: 0 };
    // (e) 시간 부족 신호: 뒤쪽 1/3 문항 무표기율 vs 앞쪽
    const third = Math.floor(nq/3);
    X.omission = { front: mean(items.slice(0,third).map(it=>it.blank)), back: mean(items.slice(nq-third).map(it=>it.blank)), maxItem: items.reduce((a,it)=>it.blank>a.blank?it:a,items[0]) };
    // (f) 만점/천장·바닥
    X.ceiling = { full: tot.filter(x=>x===100).length, ge95: tot.filter(x=>x>=95).length, le10: tot.filter(x=>x<=10).length };
    // (g) 반별 추가: 각 반에서 가장 약한 문항 3개(전체 대비 정답률 차이 큰 문항)
    classes.forEach(c => { const st = parsed.find(p=>p.cls===c.cls).students; const diffs = items.map(it=>({q:it.q, d: st.reduce((a,s)=>a+s.correct[it.q-1],0)/st.length - it.p})); diffs.sort((a,b)=>a.d-b.d); c.weakItems = diffs.slice(0,3).filter(x=>x.d<=-0.15).map(x=>`${x.q}번(${(x.d*100).toFixed(0)}%p)`); c.strongItems = diffs.slice(-2).filter(x=>x.d>=0.15).map(x=>`${x.q}번(+${(x.d*100).toFixed(0)}%p)`); });
    // (h) 난이도 분포
    X.difficulty = { easy: items.filter(it=>it.p>=0.85).length, mid: items.filter(it=>it.p>=0.5&&it.p<0.85).length, hard: items.filter(it=>it.p<0.5).length };
    X.alphaIfDeleted = items.map(it => { const rest = items.filter(x=>x!==it); const nc = S.map(s=>s.correct.reduce((a,b,i)=>a+(i===it.q-1?0:b),0)); const k=nq-1; return k/(k-1)*(1-rest.reduce((a,x)=>a+x.p*(1-x.p),0)/(sd(nc)**2)); });
    items.forEach((it,i)=>{ it.alphaDrop = X.alphaIfDeleted[i] - kr20; });
    X.hurting = items.filter(it=>it.alphaDrop>0.002).map(it=>it.q);
    // (i) 오답지별 문항-총점 상관 (option point-biserial): 정답은 양(+), 오답은 음(−)이어야 정상. 오답이 양이면 복수정답/문항오류 의심
    items.forEach(it => { const rest = S.map(s => s.tot - s.correct[it.q-1]*it.pts); it.optRpb = ["1","2","3","4","5"].map(k => { const x = S.map(s => s.raw[it.q-1]===k ? 1 : 0); const sx = x.reduce((a,b)=>a+b,0); return (sx===0||sx===n) ? null : corr(x, rest); });
      it.posDistractor = ["1","2","3","4","5"].filter((k,i)=>k!==it.key && it.optRpb[i]!==null && it.optRpb[i] > 0.05 && it.o[i]>=0.03).map((k)=>"①②③④⑤"["12345".indexOf(k)]); });
    // (j) 난이도×변별도 2원 판정 (Ebel/UT Austin 기준: D≥.40 우수, .30~.39 양호, .20~.29 보통, <.20 검토 / p>.90 매우 쉬움, <.20 매우 어려움)
    items.forEach(it => { it.dBand = it.D>=0.4?"우수":it.D>=0.3?"양호":it.D>=0.2?"보통":it.D>=0?"미흡":"음(−)";
      it.pBand = it.p>=0.9?"매우 쉬움":it.p>=0.7?"쉬움":it.p>=0.4?"보통":it.p>=0.2?"어려움":"매우 어려움";
      it.action = it.D<0 || it.posDistractor.length ? "오류 확인 필요" : (it.D<0.2 && it.p<0.9) ? "수정" : it.p>=0.9 ? "유지(기초)" : it.D>=0.3 ? "유지" : "검토"; });
    // (k) 검사 수준 요약: 평균 난이도·평균 변별·5지선다 최적 난이도 .60(UT Austin), 추측 바닥
    X.summary = { meanP: mean(items.map(it=>it.p)), meanD: mean(items.map(it=>it.D)), meanRpb: mean(items.map(it=>it.rpb)), targetP: 0.60,
      nGood: items.filter(it=>it.D>=0.3).length, nRevise: items.filter(it=>it.action==="수정").length, nFlag: items.filter(it=>it.action.startsWith("오류")).length, nBasic: items.filter(it=>it.action==="유지(기초)").length,
      guessFloor: mean(items.map(it=>1/(1+it.working))) };
    // (l) 조건부 측정오차(Lord 이항모형): CSEM(x)=sqrt(x(k−x)/(k−1)) in 정답수 단위 → 점수 단위로 환산(평균 배점). 점수 구간별 ±1 SEM 띠
    const k = nq, avgPt = pts.reduce((a,b)=>a+b,0)/nq;
    const csemAt = x => Math.sqrt(x*(k-x)/(k-1))*avgPt;
    X.csem = [ [0.25,"하위25%"],[0.5,"중앙"],[0.75,"상위25%"],[0.9,"상위10%"] ].map(([p,l]) => { const sc = quantile(tot,p); const nc = Math.round(sc/100*k); return { label:l, score: sc, csem: csemAt(nc) }; });
    // (m) 등급 경계 근처 학생: 경계 ±1 SEM 안에 있는 학생 수 → 그 등급 판정은 불안정
    X.cutZone = [90,80,70,60].map(c => ({ cut:c, n: tot.filter(x => Math.abs(x-c) <= dist.sem).length, below: tot.filter(x => x < c && x >= c - dist.sem).length }));
    // (n) 신뢰도 등급(UT Austin): ≥.90 excellent, .80–.90 very good classroom, .70–.80 good, .60–.70 low
    X.relBand = dist.kr20>=0.9?"매우 우수(표준화 검사 수준)":dist.kr20>=0.8?"우수(학교 시험으로 매우 양호)":dist.kr20>=0.7?"양호(일부 문항 개선 여지)":dist.kr20>=0.6?"다소 낮음(다른 평가와 함께 판단)":"낮음(시험 수정 필요)";
    // (o) Spearman-Brown: 문항 수를 늘리면 신뢰도가 어디까지 오르나
    X.sb = [30,40].map(m => ({ k:m, r: (m/nq*dist.kr20)/(1+(m/nq-1)*dist.kr20) }));
    // (p) 영역별 분석 (문항→영역 태그가 주어졌을 때)
    const tagList = i => { const t = domainTags ? domainTags[i] : null; return Array.isArray(t) ? t.filter(Boolean) : (t && String(t).trim() ? [String(t).trim()] : []); };
    if (domainTags && domainTags.some((_,i)=>tagList(i).length)) { const map = {}; items.forEach((it,i)=>{ tagList(i).forEach(t => (map[t]=map[t]||[]).push(it)); });
      X.domains = Object.entries(map).map(([name, its]) => { const qs = its.map(it=>it.q); const ptsum = its.reduce((a,it)=>a+it.pts,0); const per = S.map(s => its.reduce((a,it)=>a+s.correct[it.q-1]*it.pts,0)/ptsum);
        const byG = G.map(g => g.length ? mean(g.map(s => its.reduce((a,it)=>a+s.correct[it.q-1]*it.pts,0)/ptsum)) : 0);
        return { name, qs, n: its.length, pts: ptsum, rate: mean(per), meanD: mean(its.map(it=>it.D)), byQ: byG, bottom: mean(bottom.map(s => its.reduce((a,it)=>a+s.correct[it.q-1]*it.pts,0)/ptsum)) }; });
      classes.forEach(c => { const st = parsed.find(p=>p.cls===c.cls).students; c.domainRates = X.domains.map(dm => mean(st.map(s => dm.qs.reduce((a,q)=>a+s.correct[q-1]*items[q-1].pts,0)/dm.pts))); }); }
    else X.domains = null;
    X.domainOverlap = X.domains ? items.filter((_,i)=>tagList(i).length>1).map(it=>it.q) : [];
    return { title: parsed[0].title.replace(/\d+\s*반/, "").replace(/\s+/g, " "), nq, key, pts, items, dist, classes, anova, students: S, nUp, nLo, upCut, loCut, X, hasSA, tags: domainTags ? items.map((_,i)=>tagList(i).join("·")) : null };
  }

  // 1차 자료(텍스트) — AI에 붙여넣는 본문. 각 표 앞에 "읽는 규칙"을 붙여 해석 기준을 같이 넘긴다.
  function buildPrompt(R) {
    const pc = x => (x * 100).toFixed(1) + "%", f2 = x => x.toFixed(2), f1 = x => x.toFixed(1), X = R.X, d = R.dist, SA = R.hasSA;
    const L = [];
    L.push(`[시험] ${R.title}`);
    L.push(`[기본] 응시 ${d.n}명, 객관식 ${R.nq}문항(${R.pts.reduce((a,b)=>a+b,0)}점)${SA?` + 서답형(${X.mismatch.saMax}점)`:" (서답형 없음)"}, 평균 ${f2(d.mean)}, 중앙값 ${d.median}, 표준편차 ${f2(d.sd)}, 최저 ${d.min}, 최고 ${d.max}, Q1 ${d.q1}, Q3 ${d.q3}, 가운데 50% 학생의 점수 폭(IQR) ${f1(d.iqr)}, 왜도 ${f2(d.skew)}(음수면 낮은 점수 쪽으로 꼬리)`);
    L.push(`[비율] 90점 이상 ${d.ge90}명(${pc(d.ge90/d.n)}), 80점 이상 ${d.ge80}명(${pc(d.ge80/d.n)}), 60점 미만 ${d.lt60}명(${pc(d.lt60/d.n)}), 40점 미만 ${d.lt40}명(${pc(d.lt40/d.n)}), 만점 ${X.ceiling.full}명, 95점 이상 ${X.ceiling.ge95}명, 10점 이하 ${X.ceiling.le10}명`);
    L.push(`[점수분포] ` + d.hist.map(([l, c]) => `${l}:${c}`).join(", "));
    L.push(`[신뢰도] 객관식 KR-20 ${f2(d.kr20)}, 측정의 표준오차 ±${f1(d.sem)}점${SA?`, 선택형-서답형 상관 ${f2(d.corrMcSa)}`:""}. 빼면 신뢰도가 오르는 문항(=시험과 다른 걸 재는 문항): ${X.hurting.length?X.hurting.join(", ")+"번":"없음"}`);
    L.push(`[검사 요약] 평균 난이도(정답률) ${pc(X.summary.meanP)} (5지선다 변별 최적 약 60%), 평균 변별도 ${f2(X.summary.meanD)}, 평균 문항-총점상관 ${f2(X.summary.meanRpb)}, 추측 바닥(작동 선지 기준 우연 정답 확률) ${pc(X.summary.guessFloor)}. 판정: 유지 ${R.items.filter(it=>it.action==="유지").length}, 유지(기초) ${X.summary.nBasic}, 검토 ${R.items.filter(it=>it.action==="검토").length}, 수정 ${X.summary.nRevise}, 오류 확인 ${X.summary.nFlag}문항`);
    L.push(`[신뢰도 해석] KR-20 ${f2(d.kr20)} → ${X.relBand}. 같은 질의 문항을 30문항으로 늘리면 약 ${f2(X.sb[0].r)}, 40문항이면 약 ${f2(X.sb[1].r)} (Spearman-Brown)`);
    L.push(`[조건부 측정오차] 점수대별 ±1 SEM(이항모형): ` + X.csem.map(c=>`${c.label} ${c.score}점 ±${f1(c.csem)}`).join(", ") + `. 낮은 점수일수록 오차가 큼. 읽는 규칙: 한 학생의 점수는 '진짜 실력 ± 이 폭' 안 어디든 있을 수 있음.`);
    L.push(`[경계 근처 학생] 등급 경계 ±${f1(d.sem)}점(1 SEM) 안에 있는 학생: ` + X.cutZone.map(c=>`${c.cut}점 경계 ${c.n}명(그중 바로 아래 ${c.below}명)`).join(", ") + `. 이 학생들의 등급 판정은 시험 오차만으로 바뀔 수 있음.`);
    L.push(`[난이도 분포] 쉬움(85%↑) ${X.difficulty.easy}문항, 중간(50~85%) ${X.difficulty.mid}문항, 어려움(50%↓) ${X.difficulty.hard}문항`);
    L.push(``);
    L.push(`[문항분석] 상위27%=${R.nUp}명(${R.upCut}점↑), 중위=${d.n-R.nUp-R.nLo}명, 하위27%=${R.nLo}명(${R.loCut}점↓). 변별도D=상위−하위 정답률(잘하는 학생과 못하는 학생의 정답률 차이). '문항-점수 관계'=이 문항을 맞힌 학생일수록 총점이 높은 정도(−1~+1, 0.2↑이면 괜찮음). 읽는 규칙: 정답률은 '어렵냐'만 말하고 문항의 질은 변별도·문항-점수 관계가 말함. D 0.4↑ 우수, 0.2↓ 검토. 중위 정답률이 하위와 같거나 낮으면 실력이 아니라 특정 오개념이 결과를 가른 문항.`);
    L.push(`문항 | 영역 | 정답 | 배점 | 정답률 | 난이도 | 변별도D | 변별 등급 | 상위27% | 중위 | 하위27% | 문항-점수 관계 | ① | ② | ③ | ④ | ⑤ | 복수표기(오답) | 무표기 | 최다오답 | 오답유형 | 판정(난이도×변별)`);
    R.items.forEach((it,i) => L.push([it.q, (R.tags&&R.tags[i])||"-", it.key, it.pts, pc(it.p), it.pBand, f2(it.D), it.dBand, pc(it.pu), pc(it.midRate), pc(it.pl), f2(it.rpb), ...it.o.map(pc), pc(it.multiWrong), pc(it.blank), it.worst, it.pattern || "-", it.action].join(" | ")));
    L.push(`판정 규칙(Ebel 기준): 변별 등급 우수 D≥.40, 양호 .30~.39, 보통 .20~.29, 미흡 <.20. 판정 '오류 확인 필요'=변별도 음수이거나 어떤 오답지가 총점과 양(+)의 상관(아래 표), '수정'=변별 미흡, '유지(기초)'=정답률 90%↑ 기초확인용.`);
    L.push(``);
    L.push(`[성적대별 문항 정답률] 1학기 총점 4분위 집단별. 읽는 규칙: 왼쪽→오른쪽으로 올라가야 정상. 상위25%만 높고 나머지가 비슷하면 '최상위권만 넘는 문턱' 문항, 하위25%만 낮고 나머지는 다 맞히면 '기초학력 진단' 문항.`);
    L.push(`집단 | 인원 | 총점 평균 | 범위 | 선택형 평균${SA?" | 서답형 평균":""}`);
    X.quartiles.forEach(g => L.push([g.label, g.n, f1(g.mean), `${g.range[0]}~${g.range[1]}`, f1(g.mc), ...(SA?[f1(g.sa)]:[])].join(" | ")));
    L.push(`문항 | 하위25% | 25~50% | 50~75% | 상위25% | 단조증가?`);
    R.items.forEach(it => L.push([it.q, ...it.byQ.map(pc), it.monotone ? "O" : "X(역전)"].join(" | ")));
    L.push(``);
    L.push(`[오답지 분석] 이 표는 '오답 선지'만 다룸(정답 선지는 표에서 뺐음. 정답 선지가 점수와 +관계인 것은 당연하므로 문제 삼지 말 것). 읽는 규칙: 오답은 하위권이 더 많이 골라야 정상. 상위≥하위인 오답은 실력과 무관한 함정이거나 문항 오류 가능성. '죽은 오답'(선택률 2%↓, 정답 제외)이 많으면 5지선다가 사실상 2~3지선다로 작동한 것. 전체 죽은 오답 ${X.deadTotal}개, 문항당 작동 오답 평균 ${f1(X.workingMean)}개.`);
    L.push(`'오답-점수 관계'는 그 오답을 고른 학생일수록 총점이 높은지(+) 낮은지(−)를 −1~+1로 나타낸 값. 오답은 −가 정상. +이면 잘하는 학생이 그 오답을 더 고른 것 → 복수정답·문항 오류·지문 혼동 의심(교사 확인 필요). ·는 아무도 안 고른 선지. 선택률 5% 미만인 오답에는 '(소수)'를 붙였음: 고른 학생이 몇 명 안 되어 +라도 우연일 수 있으니 문제 삼지 말 것. '+관계 오답' 칸에 적힌 것만 확인 대상.`);
    L.push(`문항 | 정답 | 작동 오답 수 | 죽은 오답 | 상위≥하위 오답 | +관계 오답 | 오답별 오답-점수 관계 | 오답별 상위/하위 선택률`);
    R.items.forEach(it => { const parts=[], rels=[]; ["1","2","3","4","5"].forEach((k,i)=>{ if(k===it.key) return; const x=it.optRpb[i]; rels.push(`${"①②③④⑤"[i]} ${x===null?"·":(x>=0?"+":"")+x.toFixed(2)}${x!==null&&it.o[i]<0.05?"(소수)":""}`); if(it.o[i]>=0.05 || (x!==null && x>0.05)) parts.push(`${"①②③④⑤"[i]} ${pc(it.optUp[i])}/${pc(it.optLo[i])}${it.o[i]<0.05?"(소수)":""}`); }); L.push([it.q, "①②③④⑤"[+it.key-1]||it.key, it.working, it.dead.join("")||"-", it.suspect.join("")||"-", it.posDistractor.join("")||"-", rels.join(", "), parts.join(", ")||"-"].join(" | ")); });
    L.push(``);
    L.push(`[최하위 ${X.bottom.n}명 진단] 최고 ${X.bottom.maxScore}점${SA?`, 서답형 평균 ${f1(X.bottom.sa)}점`:""}. 정답률 85%↑ 쉬운 문항인데 이 집단은 절반도 못 맞힌 문항: ${X.bottom.easyMissed.length?X.bottom.easyMissed.join(", ")+"번":"없음"}. 이 집단 정답률 10%↓ 문항: ${X.bottom.zeroItems.length?X.bottom.zeroItems.join(", ")+"번":"없음"}.`);
    L.push(`문항별 최하위집단 정답률: ` + R.items.map((it,i)=>`${it.q}:${(X.bottom.rates[i]*100).toFixed(0)}%`).join(", "));
    L.push(``);
    if (SA) L.push(`[선택형·서답형 불일치] 선택형 80%↑인데 서답형 50%↓: ${X.mismatch.mcHighSaLow}명(알지만 못 쓰는 학생), 선택형 60%↓인데 서답형 80%↑: ${X.mismatch.mcLowSaHigh}명, 서답형 0점 ${X.mismatch.saZero}명, 서답형 만점 ${X.mismatch.saFull}명`);
    L.push(`[시간 부족 신호] 앞쪽 1/3 문항 평균 무표기율 ${pc(X.omission.front)}, 뒤쪽 1/3 ${pc(X.omission.back)}, 무표기 최다 문항 ${X.omission.maxItem.q}번(${pc(X.omission.maxItem.blank)}). 뒤쪽이 뚜렷이 높으면 시간 부족.`);
    L.push(``);
    if (X.domains) { L.push(``); L.push(`[영역별] 교사가 문항에 붙인 영역 기준.${X.domainOverlap.length?` 여러 영역에 함께 들어간 문항: ${X.domainOverlap.join(", ")}번(그래서 영역 배점 합이 시험 배점보다 클 수 있음, 중복 때문이니 문제 삼지 말 것).`:""} 읽는 규칙: 득점률이 낮고 하위25%가 특히 낮은 영역이 재지도 1순위. 변별 평균이 높은 영역이 성적을 가른 영역. 문항 3개 이하인 영역(표에 '주의' 표시)은 학생 한 명의 득점률이 0·33·67·100%로만 움직이므로, 학년 전체 수치는 참고하되 반별 득점률 차이는 한두 명 차이일 수 있으니 '그 반이 약하다'고 단정하지 말 것.`);
      L.push(`영역 | 문항 | 배점 | 득점률 | 평균 변별도 | 하위25% | 25~50% | 50~75% | 상위25% | 최하위집단`);
      X.domains.forEach(dm => L.push([dm.name + (dm.n<=3?"(주의)":""), dm.qs.join(","), dm.pts, pc(dm.rate), f2(dm.meanD), ...dm.byQ.map(pc), pc(dm.bottom)].join(" | ")));
      L.push(`반별 영역 득점률: 반 | ` + X.domains.map(dm=>dm.name + (dm.n<=3?"(주의)":"")).join(" | ")); R.classes.forEach(c => L.push([c.cls+"반", ...c.domainRates.map(pc)].join(" | "))); }
    L.push(``);
    L.push(`[반별] 읽는 규칙: 한 반 ${Math.round(d.n/R.classes.length)}명의 평균은 우연만으로 ±${f1(d.sd/Math.sqrt(d.n/R.classes.length))}점쯤 흔들림. 평균 순위보다 표준편차·IQR·최저점이 반의 모양을 말함. 표준편차는 큰데 '가운데 50% 폭'이 작으면 몇 명의 극단 점수 때문, 둘 다 크면 반 전체가 퍼진 것.`);
    L.push(`반 | 인원 | 평균 | 중앙값 | 표준편차 | 가운데50% 폭 | 최저 | 최고 | 80점↑ | 60점↓ | 선택형${SA?" | 서답형":""} | 반 모양 | 전체보다 특히 약한 문항 | 특히 강한 문항`);
    R.classes.forEach(c => L.push([c.cls+"반", c.n, f1(c.mean), c.median, f1(c.sd), f1(c.iqr), c.min, c.max, c.ge80, c.lt60, f1(c.mc), ...(SA?[f1(c.sa)]:[]), c.shape, c.weakItems.join(" ")||"-", c.strongItems.join(" ")||"-"].join(" | ")));
    if (R.anova) L.push(`[반 간 차이 검정] 일원분산분석 F=${f2(R.anova.F)}, p=${R.anova.p.toFixed(3)}, 점수 차이 중 '어느 반이냐'로 설명되는 비율 ${(R.anova.eta2*100).toFixed(1)}% → ${R.anova.p < 0.05 ? "반 간 차이 있음" : "반 간 차이 없음 (우연 범위)"}`);
    return L.join("\n");
  }

  const QUESTIONS = `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
위 자료는 중학교 수학 정기고사를 분석한 표야. 읽는 사람은 통계를 따로 배우지 않은 수학 선생님이야. 너는 이 선생님 옆에 앉아 설명해 주는 교육평가 전문가라고 생각하고 답해 줘.

답할 때 꼭 지켜 줘:
- 통계 용어를 쓰지 말고 일상 말로 설명해. 꼭 써야 하면 괄호 안에 한 줄로 뜻을 적어 줘. (예: "변별도(잘하는 학생과 못하는 학생의 정답률 차이)")
- 각 표 앞에 적힌 '읽는 규칙'을 해석 기준으로 삼고, 표에 있는 숫자를 괄호 안에 근거로 붙여 줘. 숫자를 새로 계산하지 마.
- [오답지 분석] 표에는 정답 선지가 없어. 정답이 점수와 +관계인 건 당연한 것이니 문제로 지적하지 마. '오답'인데 +관계인 경우만 짚어 줘.
- 질문마다 3~6줄. 확실하지 않은 건 "추측"이라고 써 줘. 없으면 "없음"이라고 짧게.

1. 한마디로, 이 시험은 잘 낸 시험이야? 그렇게 보는 이유를 3가지만 쉽게 말해 줘. (너무 쉽거나 어렵진 않았는지, 잘하는 학생과 못하는 학생을 잘 갈랐는지, 점수를 믿을 만한지)

2. 우리 학년 점수는 어떤 모양이야? 대부분의 학생이 어디쯤 몰려 있고, 특별히 떨어지는 학생은 몇 명쯤이며 그 학생들은 어떤 문제까지 못 풀고 있어? ([점수분포], [최하위 진단]을 보고)

3. 어려운 문제들 중에서 "잘하는 학생은 맞히고 못하는 학생은 틀린 문제"(좋은 어려운 문제)와 "잘하는 학생도 많이 틀린 문제"(문제 자체를 다시 볼 문제)를 번호로 나눠 줘. 각각 왜 그렇게 봤는지 숫자로 보여 줘.

4. 학생들이 많이 고른 오답이 있는 문제는 뭐야? 그 오답을 고른 학생은 어떤 생각을 했을 것 같아? 수업 때 어떻게 짚어 주면 좋을까? (문제별 최다오답과 오답유형을 보고, 3문항까지만)

5. 문제 자체에 문제가 있을 가능성이 있는 문항이 있어? 예를 들어 잘하는 학생들이 오히려 어떤 오답을 더 골랐다면 복수정답이나 헷갈리는 표현이 있을 수 있어. 있으면 번호와 어떤 오답인지 알려 주고, 없으면 "없음"이라고 해 줘. ([오답지 분석]의 '+관계 오답', '상위≥하위 오답' 칸)

6. 아무도 안 고른 오답(죽은 오답)이 많은 문제는 어떤 문제야? 다음에 낼 때 그 오답지를 어떻게 바꾸면 좋을지 2~3개만 예를 들어 줘.

7. 너무 쉬워서 거의 다 맞힌 문제도 있지? 그 중에서 "그래도 기초를 못 하는 학생을 찾아내는 데 쓸모 있는 문제"와 "아무도 못 가르는 문제"를 나눠 줘. ([문항분석]의 판정 '유지(기초)'와 [최하위 진단]을 보고)

8. 반별로 평균이 다른데, 이게 실제로 반마다 실력이 다른 거야, 아니면 우연히 생길 수 있는 정도야? ([반별] 읽는 규칙의 '우연만으로 ±몇 점' 과 [반 간 차이 검정] 결과를 쉽게 풀어서) 그리고 각 반의 '반 모양'을 보고, 반마다 어떤 지도가 맞을지(모두에게 같은 수업 / 몇 명만 따로 챙기기 / 수준별 과제) 나눠 줘. '특히 약한 문항'이 있는 반은 그 내용을 그 반에서 다시 다룰지 말해 줘.

9. 점수 몇 점 차이면 "실력 차이"라고 봐도 돼? 예를 들어 79점과 81점을 다르게 봐도 되는 거야? ([신뢰도]의 '측정의 표준오차 ±몇 점'을 "같은 학생이 비슷한 시험을 다시 보면 이 정도는 왔다갔다 한다"는 뜻으로 풀어서) 그리고 등급 경계 바로 근처에 있는 학생이 몇 명인지, 학생·학부모에게 점수를 안내할 때 어떻게 말하면 좋을지 알려 줘.

10. 객관식은 잘 맞혔는데 서답형은 못 쓴 학생이 많아? 그런 학생은 어떻게 도와야 해? (서답형이 없는 시험이면 이 부분은 건너뛰어) 그리고 뒤쪽 문제를 못 푼 흔적(시간 부족)이 있는지도 봐 줘. ([선택형·서답형 불일치], [시간 부족 신호]) 특별한 게 없으면 "없음".

11. [영역별] 표가 있으면: 어떤 영역을 다시 가르쳐야 하고, 어느 반이 어느 영역에서 특히 약한지 말해 줘. 표가 없으면 건너뛰어.

12. 정리해서 알려 줘: (가) 다음 수업에서 먼저 다시 다룰 문제 3개와 이유, (나) 따로 챙겨야 할 학생들의 특징, (다) 다음 시험 낼 때 바꾸면 좋을 점 3가지.

※ 답을 읽고 더 궁금하면 이렇게 물어보세요: "3번에서 말한 '좋은 어려운 문제'가 왜 좋은 건지 더 쉽게 설명해 줘", "9번에서 ±몇 점이 왜 그렇게 나오는 거야?", "우리 반이 평균이 낮은데 내가 못 가르친 거야?"`;

  root.NeisAnalyzer = { parseSheet, analyze, buildPrompt, QUESTIONS, _u: { mean, sd, median, quantile, corr, fPvalue } };
})(typeof window !== "undefined" ? window : globalThis);
