// 녹화 전용 가짜 Supabase(PostgREST) 서버 — 실제 DB·개인정보 없이 더미 데이터만 메모리에 둔다.
// 사용: node mock-supabase.mjs  (포트 54321)  →  앱은 NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 로 실행
import http from 'node:http';

const BR = 'br_promo';
const now = Date.now();
const iso = (dAgo = 0, h = 0) => new Date(now - dAgo * 864e5 - h * 36e5).toISOString();
let seq = 1;
const uid = () => `00000000-0000-4000-8000-${String(seq++).padStart(12, '0')}`;

// ---------- 더미 학생 (가상 이름) ----------
const NAMES = [
  ['하늘', '중1A', 402], ['별이', '중1A', 318], ['도윤', '중1A', 246], ['서아', '중1B', 188],
  ['지호', '중1B', 150], ['유나', '중1B', 96], ['민준', '중2A', 58], ['채원', '중2A', 34],
  ['시우', '중2A', 22], ['다온', '중2B', 12], ['예린', '중2B', 4], ['준우', '중2B', 0],
];
const STAGES = [0, 10, 30, 70, 130, 200, 280, 380];
const stageOf = p => STAGES.filter(t => p >= t).length;
const MOODS = ['오늘 수학 100점!', '방학 숙제 끝!', '분수 정복 중', null, '문제집 1권 완료', null, '화이팅!', null, null, null, null, null];
const garden_students = NAMES.map(([name, cls, pts], i) => ({
  id: uid(), name, class_name: cls, branch_id: BR, total_points: pts, current_stage: stageOf(pts),
  apples_harvested: i < 2 ? 3 - i : 0, is_active: true, created_at: iso(60), grade: cls.startsWith('중1') ? '중1' : '중2',
  external_student_id: String(1000 + i), avatar: null, background: null, mood_text: MOODS[i], mood_updated_at: iso(0, 3),
  scene_layout: null,
}));
const S = garden_students;

const monster_species = [
  ['불꽃몬', '🔥', '뜨거운 불꽃에서 태어난 몬스터'], ['물결몬', '💧', '맑은 물결을 타고 다니는 몬스터'],
  ['새싹몬', '🌿', '작은 새싹에서 자라난 몬스터'], ['번개몬', '⚡', '번쩍이는 번개를 품은 몬스터'],
  ['달빛몬', '🌙', '달빛을 받으며 자라는 몬스터'], ['구름몬', '☁️', '폭신한 구름 위에서 낮잠 자는 몬스터'],
  ['별똥몬', '⭐', '밤하늘 별똥별을 타고 온 몬스터'], ['사과몬', '🍎', '사과정원에서 태어난 몬스터'],
  ['얼음몬', '❄️', '차가운 얼음 속에서 깨어난 몬스터'],
].map(([name, emoji, description], i) => ({
  id: uid(), name, emoji, description, display_order: i + 1, is_active: true, hide_name: true, created_at: iso(90), updated_at: iso(90),
}));
const STAGE_DEF = [[1, '알', 0], [2, '금간 알', 70], [3, '부화', 190], [4, '성장', 380], [5, '완성체', 630]];
const monster_stage_images = monster_species.flatMap(sp => STAGE_DEF.map(([stage, stage_name, required_exp]) => ({
  id: uid(), species_id: sp.id, stage, image_url: null, stage_name, required_exp, updated_at: iso(90),
})));
const student_monsters = [];
S.forEach((s, i) => {
  // 진화 완료 몬스터 (도감용)
  const done = i === 0 ? [0, 1, 2, 3] : i === 1 ? [1, 4] : i === 2 ? [2] : [];
  done.forEach((k, j) => student_monsters.push({ id: uid(), student_id: s.id, species_id: monster_species[k].id, nickname: monster_species[k].name,
    current_exp: 630, current_stage: 5, is_evolved: true, selected_at: iso(80 - j * 15), evolved_at: iso(70 - j * 15) }));
  const exp = [420, 240, 120, 80, 30, 200, 10, 0, 60, 0, 15, 0][i];
  student_monsters.push({ id: uid(), student_id: s.id, species_id: monster_species[(i + 5) % 9].id, nickname: ['뭉치', '콩이', '두부', '보리', '토리', '모찌', '호두', '감자', '초코', '쿠키', '밤톨', '젤리'][i],
    current_exp: exp, current_stage: STAGE_DEF.filter(d => exp >= d[2]).length, is_evolved: false, selected_at: iso(10), evolved_at: null });
});

const village_buildings = [
  ['garden', '사과정원', '/me', '15%', '35%', null, '28%', 1, '내 사과나무와 숲속 마당'],
  ['quiz', '퀴즈 오두막', '/quiz-center', '35%', '5%', null, '25%', 2, '하루 3문제 퀴즈'],
  ['shop', '몬스터 상점', '/shop', '38%', null, '5%', '25%', 3, '포인트로 소품 구매'],
  ['mailbox', '건의 우체통', '/me/suggest', '62%', '12%', null, '20%', 4, '선생님께 하고 싶은 말'],
  ['game', '게임센터', '/me/game-center', '65%', null, '8%', '25%', 5, '미니게임으로 알 키우기'],
].map(([building_key, name, link, position_top, position_left, position_right, size, display_order, description]) => ({
  id: uid(), building_key, name, image_url: null, link, position_top, position_left, position_right, size, rotation: 0, description,
  display_order, is_ready: true, is_visible: true, updated_at: iso(5),
}));

const Q = (category, grade, question, opts, ans, explanation, difficulty = 'easy') => ({
  id: uid(), category, grade, question, option_1: opts[0], option_2: opts[1], option_3: opts[2], option_4: opts[3],
  correct_answer: ans, explanation, difficulty, is_approved: true, is_active: true, created_at: iso(3), source: 'manual',
});
const quiz_questions = [
  Q('math', 'middle_1', '3/4 + 1/8 의 값은?', ['7/8', '4/12', '1/2', '5/8'], 1, '분모를 8로 통분하면 6/8 + 1/8 = 7/8'),
  Q('math', 'middle_1', '(-3) × (-4) − 5 의 값은?', ['-17', '7', '17', '-7'], 2, '(-3)×(-4)=12, 12−5=7'),
  Q('general', 'all', '우리나라에서 가장 높은 산은?', ['설악산', '지리산', '한라산', '백두산'], 4, '백두산(2,744m)'),
  Q('math', 'middle_1', '정육면체의 모서리는 모두 몇 개일까?', ['8개', '10개', '12개', '6개'], 3, '정육면체는 모서리가 12개'),
  Q('nonsense', 'all', '세상에서 가장 뜨거운 과일은?', ['천도복숭아', '불사과', '수박', '레몬'], 1, '천 도(°)!'),
  Q('math', 'middle_1', 'x + 5 = 12 일 때 x 는?', ['5', '6', '7', '17'], 3, '12 − 5 = 7'),
];

const decoration_items = [];
const TABLES = {
  garden_students, monster_species, monster_stage_images, student_monsters, village_buildings, quiz_questions, decoration_items,
  garden_point_logs: S.slice(0, 8).flatMap((s, i) => [
    { id: uid(), student_id: s.id, points: 5, reason: '숙제 완료', logged_at: iso(0, i + 1) },
    { id: uid(), student_id: s.id, points: 3, reason: '출석', logged_at: iso(0, i + 2) },
  ]),
  garden_harvests: [{ id: uid(), student_id: S[0].id, apples_count: 1, harvested_at: iso(0, 1) }],
  garden_tree_stages: [], garden_pending_points: [], village_settings: [], yard_settings: [], student_yard_layout: [],
  student_weather_setting: [{ student_id: S[0].id, weather_type: 'cherry_blossom' }, { student_id: S[1].id, weather_type: 'sunshine' }],
  student_decorations: [], game_plays: [], quiz_plays: [], shop_requests: [], shop_settings: [],
  game_rankings: ['infinite_stairs', 'sky_shooter', 'math_adventure'].flatMap((g, gi) => S.slice(0, 8).map((s, i) => ({
    id: uid(), student_id: s.id, branch_id: BR, game_type: g, best_score: [182, 150, 121, 97, 80, 64, 41, 20][(i + gi * 3) % 8],
    month: new Date(now).toISOString().slice(0, 7), reward_exp: 0, rank: null, updated_at: iso(1),
  }))),
  garden_suggestions: [], garden_suggestion_blocks: [], garden_suggestion_reactions: [], garden_avatar_gallery: [], garden_avatar_ownership: [],
  avatars: [], garden_push_subscriptions: [], garden_admin_alerts: [],
};

// ---------- PostgREST 흉내 ----------
function parseVal(v) { if (v === 'null') return null; if (v === 'true') return true; if (v === 'false') return false; return v; }
const eq = (a, b) => a === b || String(a) === String(b);
function cond(row, col, expr) {
  let neg = false; if (expr.startsWith('not.')) { neg = true; expr = expr.slice(4); }
  const i = expr.indexOf('.'); const op = expr.slice(0, i); const raw = expr.slice(i + 1); const v = row[col];
  let r;
  switch (op) {
    case 'eq': r = eq(v, parseVal(raw)); break;
    case 'neq': r = !eq(v, parseVal(raw)); break;
    case 'gt': r = v > (isNaN(raw) ? raw : +raw); break;
    case 'gte': r = v >= (isNaN(raw) ? raw : +raw); break;
    case 'lt': r = v < (isNaN(raw) ? raw : +raw); break;
    case 'lte': r = v <= (isNaN(raw) ? raw : +raw); break;
    case 'is': r = raw === 'null' ? v == null : v === parseVal(raw); break;
    case 'in': { const list = raw.replace(/^\(|\)$/g, '').split(',').map(x => x.replace(/^"|"$/g, '')); r = list.some(x => eq(v, x)); break; }
    case 'like': case 'ilike': { const re = new RegExp('^' + raw.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/[*%]/g, '.*') + '$', op === 'ilike' ? 'i' : ''); r = re.test(String(v ?? '')); break; }
    default: r = true;
  }
  return neg ? !r : r;
}
function splitTop(s) { const out = []; let d = 0, cur = ''; for (const c of s) { if (c === '(') d++; if (c === ')') d--; if (c === ',' && d === 0) { out.push(cur.trim()); cur = ''; } else cur += c; } if (cur.trim()) out.push(cur.trim()); return out; }
function project(row, select, table) {
  if (!select || select === '*') return { ...row };
  const o = {};
  for (const part of splitTop(select)) {
    const m = part.match(/^(\w+)(?:!\w+)?\((.*)\)$/);
    if (m) { // 임베드: 외래키 1:1 가정
      const rel = m[1]; const fk = rel === 'garden_students' ? 'student_id' : rel.replace(/s$/, '') + '_id';
      const t = TABLES[rel] || []; const hit = t.find(x => x.id === row[fk]);
      o[rel] = hit ? project(hit, m[2], rel) : null; continue;
    }
    if (part === '*') Object.assign(o, row); else { const [c, alias] = part.split(':').reverse(); o[alias || c] = row[c.trim()]; }
  }
  return o;
}
function query(table, url) {
  let rows = [...(TABLES[table] || (TABLES[table] = []))];
  const reserved = new Set(['select', 'order', 'limit', 'offset', 'or', 'on_conflict', 'columns']);
  for (const [k, v] of url.searchParams) {
    if (reserved.has(k)) continue;
    if (k.includes('.')) { // 임베드 필터 (예: garden_students.branch_id)
      const [rel, col] = k.split('.'); const fk = rel === 'garden_students' ? 'student_id' : rel + '_id';
      rows = rows.filter(r => { const h = (TABLES[rel] || []).find(x => x.id === r[fk]); return h && cond(h, col, v); });
    } else rows = rows.filter(r => cond(r, k, v));
  }
  const or = url.searchParams.get('or');
  if (or) { const parts = splitTop(or.replace(/^\(|\)$/g, '')); rows = rows.filter(r => parts.some(p => { const i = p.indexOf('.'); return cond(r, p.slice(0, i), p.slice(i + 1)); })); }
  const order = url.searchParams.get('order');
  if (order) {
    const keys = order.split(',').map(x => x.split('.'));
    rows.sort((a, b) => { for (const [c, dir] of keys) { const x = a[c], y = b[c]; if (x === y) continue; if (x == null) return 1; if (y == null) return -1; const r = x < y ? -1 : 1; return dir === 'desc' ? -r : r; } return 0; });
  }
  const total = rows.length;
  const off = +(url.searchParams.get('offset') || 0); const lim = url.searchParams.get('limit');
  rows = rows.slice(off, lim ? off + +lim : undefined);
  return { rows, total };
}
const DEFAULTS = { id: () => uid(), created_at: () => new Date().toISOString(), updated_at: () => new Date().toISOString(), logged_at: () => new Date().toISOString(), played_at: () => new Date().toISOString() };

function rpc(fn, body) {
  switch (fn) {
    case 'get_today_play_count': case 'get_today_quiz_count': return 0;
    case 'garden_award_pending_bulk': return (body?.p_student_ids || []).length;
    default: return null;
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  let body = ''; for await (const c of req) body += c;
  const json = body ? (() => { try { return JSON.parse(body); } catch { return null; } })() : null;
  const hdr = { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*', 'Access-Control-Expose-Headers': 'Content-Range' };
  if (req.method === 'OPTIONS') { res.writeHead(204, hdr); return res.end(); }
  const m = url.pathname.match(/^\/rest\/v1\/(rpc\/)?(\w+)/);
  if (!m) { res.writeHead(404, hdr); return res.end('{}'); }
  if (process.env.MOCK_LOG) console.log(req.method, decodeURIComponent(url.pathname + url.search).slice(0, 200));
  if (m[1]) { res.writeHead(200, hdr); return res.end(JSON.stringify(rpc(m[2], json))); }
  const table = m[2]; const select = url.searchParams.get('select');
  const single = (req.headers.accept || '').includes('vnd.pgrst.object');
  const prefer = req.headers.prefer || '';
  let out = [];
  if (req.method === 'GET' || req.method === 'HEAD') {
    const { rows, total } = query(table, url); out = rows.map(r => project(r, select, table));
    if (/count=/.test(prefer)) hdr['Content-Range'] = `0-${Math.max(0, out.length - 1)}/${total}`;
  } else if (req.method === 'POST') {
    const list = (Array.isArray(json) ? json : [json]).filter(Boolean);
    const t = TABLES[table] || (TABLES[table] = []);
    for (const r of list) {
      const conflict = url.searchParams.get('on_conflict');
      const ex = conflict && t.find(x => conflict.split(',').every(c => eq(x[c], r[c])));
      if (ex) { Object.assign(ex, r); out.push(ex); continue; }
      const row = { ...r }; for (const [k, f] of Object.entries(DEFAULTS)) if (row[k] === undefined) row[k] = f();
      t.push(row); out.push(row);
    }
    out = out.map(r => project(r, select, table));
  } else if (req.method === 'PATCH') {
    const { rows } = query(table, url); rows.forEach(r => Object.assign(r, json)); out = rows.map(r => project(r, select, table));
  } else if (req.method === 'DELETE') {
    const { rows } = query(table, url); TABLES[table] = (TABLES[table] || []).filter(r => !rows.includes(r)); out = rows.map(r => project(r, select, table));
  }
  if (single) {
    if (out.length !== 1) { res.writeHead(406, hdr); return res.end(JSON.stringify({ code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: `${out.length} rows`, hint: null })); }
    res.writeHead(200, hdr); return res.end(JSON.stringify(out[0]));
  }
  res.writeHead(req.method === 'POST' ? 201 : 200, hdr);
  res.end(req.method === 'HEAD' ? '' : JSON.stringify(out));
});
server.listen(54321, '127.0.0.1', () => console.log('mock supabase on :54321'));
