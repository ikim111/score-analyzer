// 두 시험 비교 엔진 — analyze.js 뒤에 로드. 입력: NeisAnalyzer.analyze() 결과 두 개(RA, RB)와 시험 이름.
(function (root) {
  const U = root.NeisAnalyzer._u, { mean, sd, median, quantile, corr, fPvalue } = U;
  const rank = a => { const idx = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]); const r = Array(a.length); let i = 0; while (i < idx.length) { let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++; const avg = (i + j) / 2 + 1; for (let k = i; k <= j; k++) r[idx[k][1]] = avg; i = j + 1; } return r; };
  const pctRank = (v, arr) => arr.filter(x => x < v).length / arr.length + 0.5 * arr.filter(x => x === v).length / arr.length; // 백분위(0~1)

  function compare(RA, RB, nameA, nameB) {
    const key = s => s.sid && s.sid !== "undefined" && s.sid !== "" ? "s" + s.sid : "c" + s.cls + "-" + s.no;
    const mapB = new Map(RB.students.map(s => [key(s), s]));
    const pairs = []; RA.students.forEach(a => { const b = mapB.get(key(a)); if (b) pairs.push({ a, b, cls: b.cls, no: b.no, sid: a.sid }); });
    const onlyA = RA.students.length - pairs.length, onlyB = RB.students.length - pairs.length;
    const n = pairs.length; if (n < 5) return { error: `두 시험에 모두 응시한 학생이 ${n}명뿐이라 비교할 수 없어요. 학번(또는 반·번호)이 같은 학생이 있어야 해요.` };
    const A = pairs.map(p => p.a.tot), B = pairs.map(p => p.b.tot), D = pairs.map((p, i) => B[i] - A[i]);
    const allA = RA.students.map(s => s.tot), allB = RB.students.map(s => s.tot);
    // 표준점수(z)와 백분위로 '상대 위치' 변화 — 시험 난이도가 달라도 비교 가능
    const zA = A.map(x => (x - mean(allA)) / sd(allA)), zB = B.map(x => (x - mean(allB)) / sd(allB)), dz = zA.map((z, i) => zB[i] - z);
    const pA = A.map(x => pctRank(x, allA)), pB = B.map(x => pctRank(x, allB)), dp = pA.map((p, i) => pB[i] - p);
    // 대응표본 t: t = mean(D)/(sd(D)/√n), p from F(1, n−1)
    const mD = mean(D), sD = sd(D), t = mD / (sD / Math.sqrt(n)), pT = fPvalue(t * t, 1, n - 1), dCohen = mD / sD;
    const r = corr(A, B), rho = corr(rank(A), rank(B));
    const semA = RA.dist.sem, semB = RB.dist.sem, semDiff = Math.sqrt(semA * semA + semB * semB); // 차이 점수의 측정오차
    // 변화 띠
    const bands = [["크게 하락(−15점↓)", x => x <= -15], ["하락(−15~−5)", x => x > -15 && x <= -5], ["비슷(±5)", x => x > -5 && x < 5], ["상승(+5~+15)", x => x >= 5 && x < 15], ["크게 상승(+15점↑)", x => x >= 15]].map(([l, f]) => ({ label: l, n: D.filter(f).length }));
    const beyond = D.filter(x => Math.abs(x) > semDiff).length; // 오차 폭 밖으로 움직인 학생
    // 1차 성적대(4분위)별 변화 — 평균으로의 회귀를 보여주는 표
    const q = [quantile(allA, .25), quantile(allA, .5), quantile(allA, .75)];
    const grp = x => x <= q[0] ? 0 : x <= q[1] ? 1 : x <= q[2] ? 2 : 3;
    const quart = ["하위25%", "25~50%", "50~75%", "상위25%"].map((label, g) => { const ix = pairs.map((_, i) => i).filter(i => grp(A[i]) === g); const f = arr => ix.length ? mean(ix.map(i => arr[i])) : 0; return { label, n: ix.length, a: f(A), b: f(B), d: f(D), dz: f(dz), dp: f(dp), up: ix.filter(i => D[i] >= 5).length, down: ix.filter(i => D[i] <= -5).length }; });
    // 점수대 이동(90/80/70/60)
    const band = x => x >= 90 ? 0 : x >= 80 ? 1 : x >= 70 ? 2 : x >= 60 ? 3 : 4, bandLabels = ["90↑", "80~89", "70~79", "60~69", "60↓"];
    const cross = Array.from({ length: 5 }, () => Array(5).fill(0)); pairs.forEach((_, i) => cross[band(A[i])][band(B[i])]++);
    const bandUp = pairs.filter((_, i) => band(B[i]) < band(A[i])).length, bandDown = pairs.filter((_, i) => band(B[i]) > band(A[i])).length;
    // 반별 변화 (2차 시험의 반 기준) + 변화량의 반 간 차이 검정
    const clsSet = [...new Set(pairs.map(p => p.cls))].sort((x, y) => x - y);
    const classes = clsSet.map(c => { const ix = pairs.map((_, i) => i).filter(i => pairs[i].cls === c); const f = arr => mean(ix.map(i => arr[i])); return { cls: c, n: ix.length, a: f(A), b: f(B), d: f(D), sdD: ix.length > 1 ? sd(ix.map(i => D[i])) : 0, dz: f(dz), up: ix.filter(i => D[i] >= 5).length, down: ix.filter(i => D[i] <= -5).length }; });
    let anova = null; if (classes.length > 1) { const k = classes.length, gm = mD; const ssb = classes.reduce((a, c) => a + c.n * (c.d - gm) ** 2, 0), ssw = classes.reduce((a, c) => a + (c.n - 1) * c.sdD ** 2, 0); const F = (ssb / (k - 1)) / (ssw / (n - k)); anova = { F, p: fPvalue(F, k - 1, n - k), eta2: ssb / (ssb + ssw) }; }
    // 선택형/서답형 득점률 변화 (둘 다 서답형이 있을 때)
    const mcMaxA = RA.pts.reduce((a, b) => a + b, 0), mcMaxB = RB.pts.reduce((a, b) => a + b, 0);
    const split = { mcA: mean(pairs.map(p => p.a.mc / mcMaxA)), mcB: mean(pairs.map(p => p.b.mc / mcMaxB)), hasSA: RA.hasSA && RB.hasSA };
    if (split.hasSA) { // 서답형 점수가 통째로 비어 있는 반(NEIS 미입력)은 서답형 비교에서 뺀다
      const emptyCls = (R, side) => [...new Set(R.students.map(s => s.cls))].filter(c => R.students.filter(s => s.cls === c).every(s => !s.sa)).sort((x, y) => x - y);
      split.saMissA = emptyCls(RA), split.saMissB = emptyCls(RB);
      const ok = pairs.filter(p => !split.saMissA.includes(p.a.cls) && !split.saMissB.includes(p.b.cls));
      split.saN = ok.length; split.saA = ok.length ? mean(ok.map(p => p.a.sa / RA.X.mismatch.saMax)) : 0; split.saB = ok.length ? mean(ok.map(p => p.b.sa / RB.X.mismatch.saMax)) : 0; }
    // (학술 보완 1) 신뢰할 수 있는 변화 지수 RCI (Jacobson & Truax 1991): |변화| > 1.96 × √(SEM1²+SEM2²) 이면 오차로 보기 어려운 변화
    const rciCut = 1.96 * semDiff, rciUp = D.filter(x => x > rciCut).length, rciDown = D.filter(x => x < -rciCut).length;
    // (학술 보완 2) 변화 점수의 신뢰도 (Lord; Cronbach & Furby 1970): 두 시험 상관이 높을수록 '개인별 변화'는 오히려 믿기 어려워짐
    const sA = sd(A), sB = sd(B), relD = (sA * sA * RA.dist.kr20 + sB * sB * RB.dist.kr20 - 2 * sA * sB * r) / (sA * sA + sB * sB - 2 * sA * sB * r);
    // (학술 보완 3) 잔차 이득(residual gain): 1차 점수로 예측한 2차 점수보다 얼마나 더/덜 받았나 — 평균으로의 회귀를 제거한 변화
    const slope = r * sB / sA, icpt = mean(B) - slope * mean(A), pred = A.map(x => icpt + slope * x), resid = B.map((y, i) => y - pred[i]), sRes = sd(resid);
    // (학술 보완 4) 간이 성장 백분위(SGP, Betebenner 2009): 1차 점수가 비슷한(±5점, 최소 20명) 학생들 사이에서 2차 점수의 백분위. 50이면 '같은 출발점 학생들의 보통 성장'
    const sgp = pairs.map((_, i) => { let w = 5, peers; do { peers = pairs.map((_, j) => j).filter(j => Math.abs(A[j] - A[i]) <= w); w += 5; } while (peers.length < 20 && w <= 50); const vals = peers.map(j => B[j]); return Math.round(100 * pctRank(B[i], vals)); });
    const sgpStat = ix => { const v = ix.map(i => sgp[i]); return { med: v.length ? median(v) : 0, hi: v.filter(x => x >= 80).length, lo: v.filter(x => x <= 20).length }; };
    const sgpAll = sgpStat(pairs.map((_, i) => i));
    quart.forEach((g, gi) => { const ix = pairs.map((_, i) => i).filter(i => grp(A[i]) === gi); g.resid = ix.length ? mean(ix.map(i => resid[i])) : 0; Object.assign(g, { sgp: sgpStat(ix) }); });
    classes.forEach(c => { const ix = pairs.map((_, i) => i).filter(i => pairs[i].cls === c.cls); c.resid = mean(ix.map(i => resid[i])); c.residSE = sRes / Math.sqrt(ix.length); c.residFlag = Math.abs(c.resid) > 2 * c.residSE ? (c.resid > 0 ? "↑" : "↓") : ""; Object.assign(c, { sgp: sgpStat(ix) }); });
    const points = pairs.map((p, i) => ({ a: A[i], b: B[i], cls: p.cls, sgp: sgp[i] }));
    // 크게 움직인 학생 (화면용: 반·번호만, 이름 없음)
    const order = pairs.map((_, i) => i).sort((x, y) => D[y] - D[x]);
    const mover = i => ({ cls: pairs[i].cls, no: pairs[i].no, a: A[i], b: B[i], d: D[i], dp: dp[i], sgp: sgp[i], rci: Math.abs(D[i]) > rciCut });
    const movers = { up: order.slice(0, 10).filter(i => D[i] > 0).map(mover), down: order.slice(-10).reverse().filter(i => D[i] < 0).map(mover) };
    // 상대 위치가 크게 바뀐 학생 수(백분위 ±20%p)
    const relUp = dp.filter(x => x >= 0.2).length, relDown = dp.filter(x => x <= -0.2).length;
    // 두 시험 모두 60점 미만 / 1차 60↓→2차 60↑ 등 기초학력 추적
    const low = { both: pairs.filter((_, i) => A[i] < 60 && B[i] < 60).length, escaped: pairs.filter((_, i) => A[i] < 60 && B[i] >= 60).length, fell: pairs.filter((_, i) => A[i] >= 60 && B[i] < 60).length };
    const hist = []; for (let lo = -40; lo < 40; lo += 5) hist.push([`${lo >= 0 ? "+" : ""}${lo}~${lo + 5 >= 0 ? "+" : ""}${lo + 5}`, D.filter(x => x >= lo && x < lo + 5).length]); hist.unshift(["−40↓", D.filter(x => x < -40).length]); hist.push(["+40↑", D.filter(x => x >= 40).length]);
    return { nameA, nameB, n, onlyA, onlyB, A: { mean: mean(A), sd: sd(A), median: median(A), allMean: mean(allA), allSd: sd(allA), n: allA.length, kr20: RA.dist.kr20, sem: semA, nq: RA.nq, title: RA.title }, B: { mean: mean(B), sd: sd(B), median: median(B), allMean: mean(allB), allSd: sd(allB), n: allB.length, kr20: RB.dist.kr20, sem: semB, nq: RB.nq, title: RB.title },
      mD, sD, t, pT, dCohen, r, rho, semDiff, beyond, rciCut, rciUp, rciDown, relD, slope, icpt, sRes, sgpAll, points, bands, hist, quart, cross, bandLabels, bandUp, bandDown, classes, anova, split, movers, relUp, relDown, low, dzMean: mean(dz), dpAbsMean: mean(dp.map(Math.abs)) };
  }

  function buildComparePrompt(C) {
    const f1 = x => x.toFixed(1), f2 = x => x.toFixed(2), pc = x => (x * 100).toFixed(1) + "%", sg = x => (x >= 0 ? "+" : "") + x.toFixed(1);
    const L = [], a = C.nameA, b = C.nameB;
    L.push(`[비교 대상] 1차 "${a}" (${C.A.title}, ${C.A.nq}문항, 응시 ${C.A.n}명) ↔ 2차 "${b}" (${C.B.title}, ${C.B.nq}문항, 응시 ${C.B.n}명). 두 시험 모두 본 학생 ${C.n}명만 비교(1차만 ${C.onlyA}명, 2차만 ${C.onlyB}명 제외).`);
    L.push(`[읽는 규칙 — 가장 중요] 두 시험은 범위·난이도가 다른 별개의 시험이므로 점수가 올랐다고 실력이 늘었다고 단정할 수 없음. (1) 전체 평균이 같이 움직인 만큼은 '시험이 쉬워지거나 어려워진 것'이고, 학생·반의 실력 변화는 '전체 평균 대비 상대 위치(백분위·표준점수)'가 얼마나 바뀌었나로 봐야 함. (2) 1차에서 아주 높거나 낮았던 학생은 2차에서 평균 쪽으로 돌아오는 경향(평균으로의 회귀)이 자연스럽게 있으므로, '하위권이 많이 올랐다/상위권이 떨어졌다'는 그 자체로는 의미가 약함. (3) 한 학생의 점수 차이는 시험 오차만으로 ±${f1(C.semDiff)}점쯤 흔들림 — 그 안의 변화는 '변화 없음'으로 읽을 것.`);
    L.push(``);
    L.push(`[전체 변화] (두 시험 모두 본 ${C.n}명 기준) 1차 평균 ${f1(C.A.mean)}(표준편차 ${f1(C.A.sd)}, 중앙값 ${C.A.median}) → 2차 평균 ${f1(C.B.mean)}(표준편차 ${f1(C.B.sd)}, 중앙값 ${C.B.median}). 평균 변화 ${sg(C.mD)}점, 학생별 변화의 표준편차 ${f1(C.sD)}점. 1차 신뢰도 ${f2(C.A.kr20)}, 2차 ${f2(C.B.kr20)}.`);
    L.push(`[변화가 우연인지] 대응표본 검정 t=${f2(C.t)}, p=${C.pT.toFixed(3)} → 평균 변화는 ${C.pT < 0.05 ? "우연이라고 보기 어려움(시험 난이도 차이일 수도 있음)" : "우연 범위"}. 효과 크기 d=${f2(C.dCohen)}(0.2 작음, 0.5 중간, 0.8 큼). 두 시험 점수의 상관 r=${f2(C.r)}, 순위 상관 ${f2(C.rho)} (0.7↑이면 두 시험이 학생을 거의 같은 순서로 세움 = 안정적).`);
    L.push(`[변화 폭 분포] ` + C.bands.map(x => `${x.label} ${x.n}명`).join(", ") + `. 오차 폭(±${f1(C.semDiff)}점) 밖으로 움직인 학생 ${C.beyond}명(${pc(C.beyond / C.n)}).`);
    L.push(`[믿을 만한 변화] 시험 오차를 감안해 "정말 변했다"고 볼 수 있는 기준(신뢰 변화 지수, Jacobson–Truax): 변화가 ±${f1(C.rciCut)}점을 넘을 때. 이 기준을 넘어 오른 학생 ${C.rciUp}명(${pc(C.rciUp / C.n)}), 내린 학생 ${C.rciDown}명(${pc(C.rciDown / C.n)}). 나머지 ${C.n - C.rciUp - C.rciDown}명의 변화는 오차 범위 안.`);
    L.push(`[개인별 변화를 얼마나 믿을 수 있나] '변화 점수(2차−1차)'의 신뢰도 ${f2(C.relD)} (두 시험 신뢰도 ${f2(C.A.kr20)}·${f2(C.B.kr20)}와 두 시험 상관 ${f2(C.r)}로 계산). 읽는 규칙: 이 값이 0.5 아래면 학생 한 명의 변화 점수는 절반 이상이 오차이므로 개인별 상승·하락을 단정하지 말고 집단(반·성적대) 단위로만 말할 것. 두 시험이 학생을 같은 순서로 세울수록(상관↑) 개인별 변화는 오히려 덜 믿을 만해짐.`);
    L.push(`[상대 위치 변화] 백분위(학년 안에서의 위치, 0~100%)가 20%p 이상 오른 학생 ${C.relUp}명, 내린 학생 ${C.relDown}명. 학생별 백분위 변화의 평균 크기 ${pc(C.dpAbsMean)}p.`);
    L.push(`[점수대 이동] 1차 점수대 → 2차 점수대 인원표(행=1차, 열=2차). 점수대 ${C.bandLabels.join("/")}. 한 단계 이상 올라간 학생 ${C.bandUp}명, 내려간 학생 ${C.bandDown}명.`);
    L.push(`1차\\2차 | ` + C.bandLabels.join(" | ")); C.cross.forEach((row, i) => L.push([C.bandLabels[i], ...row].join(" | ")));
    L.push(`[기초학력(60점 미만) 추적] 두 시험 모두 60점 미만 ${C.low.both}명, 1차 60점 미만 → 2차 60점 이상 ${C.low.escaped}명, 1차 60점 이상 → 2차 60점 미만 ${C.low.fell}명.`);
    L.push(``);
    L.push(`[1차 성적대별 변화] 1차 점수로 4등분한 집단별. 읽는 규칙: 하위권의 상승·상위권의 하락 일부는 '평균으로의 회귀'(우연히 못 본 학생은 다음에 제 실력으로 돌아옴)이므로, 점수 변화보다 '백분위 변화'와 '상승/하락 인원'을 함께 볼 것.`);
    L.push(`'기대 대비 변화'=1차 점수로 예측되는 2차 점수(전체 추세선)보다 실제로 얼마나 더(+)/덜(−) 받았나 — 평균으로의 회귀를 뺀 값이라 성적대끼리 공정하게 비교 가능. '성장 백분위'=1차 점수가 비슷한 학생들 사이에서 2차 점수가 몇 번째인지(0~100, 50이 보통). 80↑이면 같은 출발점 학생들보다 크게 성장, 20↓이면 뒤처짐.`);
    L.push(`집단 | 인원 | 1차 평균 | 2차 평균 | 점수 변화 | 백분위 변화 | 기대 대비 변화 | 성장 백분위 중앙값 | 성장 80↑ | 성장 20↓ | 5점↑ 오른 학생 | 5점↑ 내린 학생`);
    C.quart.forEach(g => L.push([g.label, g.n, f1(g.a), f1(g.b), sg(g.d), (g.dp >= 0 ? "+" : "") + (g.dp * 100).toFixed(1) + "%p", sg(g.resid), g.sgp.med, g.sgp.hi, g.sgp.lo, g.up, g.down].join(" | ")));
    L.push(`전체: 성장 백분위 중앙값 ${C.sgpAll.med}, 80↑ ${C.sgpAll.hi}명, 20↓ ${C.sgpAll.lo}명. 추세선: 2차 ≈ ${f1(C.icpt)} + ${f2(C.slope)} × 1차 (기울기가 1보다 작으면 평균으로의 회귀가 있다는 뜻).`);
    L.push(``);
    L.push(`[반별 변화] 2차 시험의 반 기준. 읽는 규칙: 반 평균 변화는 ${Math.round(C.n / C.classes.length)}명 평균이므로 우연만으로 ±${f1(C.sD / Math.sqrt(C.n / C.classes.length))}점쯤 흔들림. '백분위 변화'가 +면 그 반이 학년 안에서 상대적으로 올라온 것.`);
    L.push(`'기대 대비 변화'는 반 학생들의 1차 점수로 예측한 2차 점수보다 실제가 얼마나 높았나(반의 출발점 차이를 보정한 값). 그 옆 '±오차'는 우연만으로 흔들리는 폭이며, 변화가 오차의 2배를 넘을 때만 ↑/↓ 표시. 표시가 없는 반은 '다른 반과 다르다'고 말할 근거가 없음.`);
    L.push(`반 | 인원 | 1차 평균 | 2차 평균 | 점수 변화 | 표준점수 변화 | 기대 대비 변화(±오차) | 표시 | 성장 백분위 중앙값 | 성장 80↑ | 성장 20↓ | 5점↑ 오른 학생 | 5점↑ 내린 학생`);
    C.classes.forEach(c => L.push([c.cls + "반", c.n, f1(c.a), f1(c.b), sg(c.d), (c.dz >= 0 ? "+" : "") + f2(c.dz), `${sg(c.resid)}(±${f1(c.residSE)})`, c.residFlag || "-", c.sgp.med, c.sgp.hi, c.sgp.lo, c.up, c.down].join(" | ")));
    if (C.anova) L.push(`[반 간 변화 차이 검정] 반별 '점수 변화'에 차이가 있는지: F=${f2(C.anova.F)}, p=${C.anova.p.toFixed(3)}, 변화 차이 중 '어느 반이냐'로 설명되는 비율 ${(C.anova.eta2 * 100).toFixed(1)}% → ${C.anova.p < 0.05 ? "반마다 변화 폭이 다름" : "반 간 변화 차이는 우연 범위"}.`);
    L.push(``);
    L.push(`[선택형·서답형 득점률 변화] 선택형 ${pc(C.split.mcA)} → ${pc(C.split.mcB)}` + (C.split.hasSA ? `, 서답형 ${pc(C.split.saA)} → ${pc(C.split.saB)}` + ((C.split.saMissA.length || C.split.saMissB.length) ? ` (서답형 점수가 비어 있는 반 제외: 1차 ${C.split.saMissA.map(c=>c+"반").join(",")||"없음"}, 2차 ${C.split.saMissB.map(c=>c+"반").join(",")||"없음"} → ${C.split.saN}명 기준)` : "") : ` (서답형은 한쪽 시험에 없어 비교 생략)`) + `.`);
    L.push(`[변화량 분포] ` + C.hist.map(([l, c]) => `${l}:${c}`).join(", "));
    L.push(`[크게 움직인 학생] 점수가 가장 많이 오른 학생 ${C.movers.up.length}명의 변화(성장 백분위): ` + C.movers.up.map(m => `${sg(m.d)}(${m.a}→${m.b}, ${m.sgp})`).join(", ") + `. 가장 많이 내린 학생: ` + C.movers.down.map(m => `${sg(m.d)}(${m.a}→${m.b}, ${m.sgp})`).join(", ") + `. (학생 식별 정보는 뺐음)`);
    return L.join("\n");
  }

  const QUESTIONS2 = `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
위 자료는 같은 학생들이 본 두 번의 수학 정기고사(1차 → 2차)를 비교한 표야. 읽는 사람은 통계를 따로 배우지 않은 수학 선생님이야. 너는 이 선생님 옆에 앉아 설명해 주는 교육평가 전문가라고 생각하고 답해 줘.

답할 때 꼭 지켜 줘:
- 통계 용어를 쓰지 말고 일상 말로 설명해. 꼭 써야 하면 괄호 안에 한 줄로 뜻을 적어 줘.
- 맨 위 [읽는 규칙]을 꼭 지켜. 특히 "점수가 올랐다 = 실력이 늘었다"로 바로 연결하지 말고, 전체 평균 변화(시험 난이도)와 상대 위치 변화(실력)를 나눠서 말해 줘.
- 표에 있는 숫자를 괄호 안에 근거로 붙이고, 숫자를 새로 계산하지 마. 질문마다 3~6줄. 확실하지 않은 건 "추측"이라고 써.

1. 한마디로, 2차 시험은 1차보다 어려웠어, 쉬웠어, 비슷했어? 그리고 학생들의 실력 순서는 두 시험에서 얼마나 비슷하게 나왔어? ([전체 변화], [변화가 우연인지]의 상관 r)

2. 평균이 변한 만큼 중에서 "시험이 달라서 생긴 변화"와 "학생이 달라져서 생긴 변화"를 어떻게 구분해서 봐야 해? 이 자료로는 어디까지 말할 수 있고, 어디부터는 말할 수 없어?

3. 점수가 많이 오르거나 내린 학생이 얼마나 돼? 그중 시험 오차를 감안해도 "정말 변했다"고 할 수 있는 학생은 몇 명이야? ([변화 폭 분포], [믿을 만한 변화]) 그리고 [개인별 변화를 얼마나 믿을 수 있나]를 보고, 학생 한 명 한 명의 변화를 말해도 되는 자료인지, 집단 단위로만 말해야 하는 자료인지 알려 줘.

4. 1차에 못 봤던 학생들이 2차에 올랐다면 그게 정말 나아진 거야, 아니면 원래 자기 실력으로 돌아온 거야? [1차 성적대별 변화] 표에서 '점수 변화'와 '기대 대비 변화'·'성장 백분위'가 다르게 말하는 집단이 있으면 짚어 줘. 상위권은 어땠어?

5. 두 시험 모두 60점 미만인 학생은 몇 명이고, 이 학생들에게는 무엇이 필요해? 1차에 60점 미만이었다가 2차에 넘어선 학생과 그 반대인 학생은 각각 어떻게 봐야 해? ([기초학력 추적], [점수대 이동] 표)

6. 반별로 변화가 다른 게 실제 차이야, 우연이야? ([반별 변화]의 '기대 대비 변화(±오차)'와 ↑/↓ 표시, [반 간 변화 차이 검정]) 표시가 붙은 반이 있으면 그 반에서 무엇을 확인하면 좋을지 알려 주고, 표시가 없는 반에 대해 "잘 가르쳤다/못 가르쳤다"고 말하면 안 되는 이유를 한 줄로 써 줘.

7. 선택형과 서답형 중 어느 쪽이 더 달라졌어? 그게 뜻하는 바가 있으면 말해 주고, 서답형이 없으면 건너뛰어.

8. 정리해서 알려 줘: (가) 이번 비교에서 믿고 말해도 되는 결론 2가지, (나) 말하면 안 되는 성급한 결론 2가지(예: "○반 선생님이 잘 가르쳤다"), (다) 다음 시험 전에 따로 챙길 학생 집단과 그 이유.

※ 더 궁금하면 이렇게 물어보세요: "평균으로의 회귀가 뭔지 예를 들어 설명해 줘", "성장 백분위 50이 보통이라는 게 무슨 뜻이야?", "우리 반이 평균이 떨어졌는데 내가 못 가르친 거야?"`;

  root.NeisCompare = { compare, buildComparePrompt, QUESTIONS2 };
})(typeof window !== "undefined" ? window : globalThis);
