// 장면별 실제 화면 녹화: node go2.mjs <tv|admin|yard|gchub|stairs|sky|quiz|col|plaza>
import { session, record, BASE } from './rec.mjs';
const w = ms => new Promise(r => setTimeout(r, ms));
const which = process.argv[2];
const PHONE = { width: 430, height: 900, dpr: 2, mobile: true };
const SID = '00000000-0000-4000-8000-000000000001'; // 더미 학생 '하늘'
const ANSWERS = { '3/4': '7/8', '(-3)': '7', '높은 산': '백두산', '모서리': '12개', '뜨거운 과일': '천도복숭아', 'x + 5': '7' };
// 계단 게임: React 내부의 계단 큐(stairsRef)를 읽어 다음 칸 방향을 고른다 (녹화용 자동 플레이)
const nextStair = p => p.evaluate(() => {
  const el = [...document.querySelectorAll('div.absolute')].find(e => e.style.left === '6%' || e.style.right === '6%');
  if (!el) return null;
  let f = el[Object.keys(el).find(k => k.startsWith('__reactFiber'))];
  while (f) {
    for (let h = f.memoizedState; h && typeof h === 'object' && 'next' in h; h = h.next) {
      const v = h.memoizedState;
      if (v && v.current && Array.isArray(v.current) && v.current.length > 3 && v.current.every(x => x === 'L' || x === 'R')) return v.current[1];
    }
    f = f.return;
  }
  return null;
});
const opts = which === 'tv' ? { width: 1600, height: 900, dpr: 1.2 } : PHONE;
await session(async p => {
  const go = async (r, t = 1500) => { await p.goto(BASE + r, { waitUntil: 'networkidle' }).catch(() => {}); await w(t); };
  if (which === 'tv') { await go('/', 2500); await record(p, 'tv', async () => { await w(12000); }); }
  if (which === 'admin') {
    await go('/admin/garden');
    await record(p, 'admin', async () => {
      await w(1500); await p.getByText('서아').first().click(); await w(1300);
      await p.getByRole('button', { name: '5', exact: true }).first().click(); await w(700);
      await p.getByRole('button', { name: '적용' }).first().click(); await w(3500);
    });
  }
  if (which === 'yard') {
    await go('/admin/yard-preview', 2500);
    await record(p, 'yard', async () => {
      await w(1500); await p.mouse.wheel(0, 250); await w(1200); await p.mouse.wheel(0, -250); await w(800);
      await p.getByRole('button', { name: /마당 꾸미기/ }).click(); await w(1500);
      await p.getByText('포근한 안락의자').first().click(); await w(1500);
      await p.getByText('원목 티 테이블').first().click(); await w(1500);
      await p.getByRole('button', { name: /저장/ }).first().click(); await w(2000);
    });
  }
  if (which === 'gchub') { await go('/admin/game-center-preview', 2000); await record(p, 'gchub', async () => { await w(1500); await p.mouse.wheel(0, 380); await w(2500); }); }
  if (which === 'stairs') {
    await go('/admin/game-center-preview/infinite-stairs', 2000);
    await record(p, 'stairs', async () => {
      await w(800); await p.getByRole('button', { name: /시작/ }).click(); await w(900);
      for (let i = 0; i < 40; i++) {
        const side = await nextStair(p);
        await p.keyboard.press(side === 'L' ? 'ArrowLeft' : 'ArrowRight'); await w(i < 6 ? 420 : 300);
      }
      await w(500);
    });
  }
  if (which === 'sky') {
    await go('/admin/game-center-preview/sky-shooter', 2000);
    await record(p, 'sky', async () => {
      await w(600); await p.getByRole('button', { name: /시작/ }).click(); await w(500);
      for (const [k, t] of [['ArrowLeft', 700], ['ArrowRight', 1300], ['ArrowLeft', 900], ['ArrowRight', 600], ['ArrowLeft', 1000], ['ArrowRight', 900]]) { await p.keyboard.down(k); await w(t); await p.keyboard.up(k); await w(200); }
    });
  }
  if (which === 'quiz') {
    await go('/admin/quiz-center-preview', 2000);
    await record(p, 'quiz', async () => {
      await w(1200); await p.getByRole('button', { name: /도전/ }).click(); await w(1800);
      for (let q = 0; q < 3; q++) {
        const txt = await p.locator('body').innerText();
        const key = Object.keys(ANSWERS).find(k => txt.includes(k));
        const btns = p.locator('button').filter({ hasText: new RegExp(`^\\s*\\d\\s*${ANSWERS[key].replace(/[()/+]/g, '\\$&')}\\s*$`) });
        await btns.first().click(); await w(2600);
      }
      await w(2500);
    });
  }
  if (which === 'col') {
    await go(`/admin/collection-preview?student=${SID}`, 2000);
    await record(p, 'col', async () => { await w(1800); await p.getByText('불꽃몬').first().click(); await w(2800); });
  }
  if (which === 'plaza') {
    await go('/admin/plaza-preview', 2500);
    await record(p, 'plaza', async () => { await w(800); await p.mouse.wheel(0, 130); await w(1500); await p.getByRole('button', { name: /내 집/ }).last().click().catch(e=>console.log(e.message)); await w(2500); await p.getByRole('button', { name: /옷/ }).last().click().catch(e=>console.log(e.message)); await w(2500); });
  }
}, opts);
