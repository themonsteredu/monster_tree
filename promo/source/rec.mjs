// Playwright + CDP 스크린캐스트 녹화 헬퍼 (ai-air 홍보영상과 같은 방식)
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
export const FF = process.env.FFMPEG || '/usr/local/lib/python3.11/dist-packages/imageio_ffmpeg/binaries/ffmpeg-linux-x86_64-v7.0.2';
export const BASE = 'http://localhost:3000/tree';
// 외부 폰트 CDN 대신 npm 으로 받은 폰트 파일을 쓴다 (FONT_DIR = npm i pretendard galmuri @fontsource/jua @fontsource/gaegu @fontsource/nanum-pen-script)
const FONT_DIR = process.env.FONT_DIR || './fonts/node_modules';
async function routeFonts(ctx) {
  await ctx.route('https://cdn.jsdelivr.net/npm/**', r => {
    const p = path.join(FONT_DIR, new URL(r.request().url()).pathname.replace('/npm/', ''));
    return fs.existsSync(p) ? r.fulfill({ path: p }) : r.fulfill({ status: 404, body: '' });
  });
  await ctx.route('https://fonts.googleapis.com/**', r => {
    let css = '';
    for (const [pkg, files] of [['jua', ['index.css']], ['gaegu', ['400.css', '700.css']], ['nanum-pen-script', ['index.css']]])
      for (const f of files) css += fs.readFileSync(`${FONT_DIR}/@fontsource/${pkg}/${f}`, 'utf8').replaceAll('url(./files/', `url(https://fonts.gstatic.com/fs/${pkg}/`);
    css = css.replaceAll("font-family: 'Nanum Pen Script'", "font-family: 'Nanum Pen Script'");
    return r.fulfill({ body: css, contentType: 'text/css' });
  });
  await ctx.route('https://fonts.gstatic.com/fs/**', r => {
    const [, , pkg, file] = new URL(r.request().url()).pathname.split('/');
    return r.fulfill({ path: `${FONT_DIR}/@fontsource/${pkg}/files/${file}` });
  });
}
export async function session(fn, { width = 1600, height = 900, dpr = 1, mobile = false } = {}) {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const ctx = await b.newContext({ viewport: { width, height }, deviceScaleFactor: dpr, isMobile: mobile, hasTouch: mobile, locale: 'ko-KR', timezoneId: 'Asia/Seoul' });
  await routeFonts(ctx);
  await ctx.addCookies([
    { name: 'garden_admin_key', value: 'promo-key', domain: 'localhost', path: '/' },
    { name: 'garden_admin_branch', value: 'br_promo', domain: 'localhost', path: '/' },
    { name: 'garden_admin_branch_name', value: encodeURIComponent('몬스터 데모점'), domain: 'localhost', path: '/' },
  ]);
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('PAGEERR', e.message));
  try { await fn(page); } finally { await b.close(); }
}
export async function record(page, name, actions) {
  const dir = `clips/${name}`; fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  const vp = page.viewportSize(); const dpr = await page.evaluate(() => devicePixelRatio);
  const W = Math.round(vp.width * dpr), H = Math.round(vp.height * dpr);
  const cdp = await page.context().newCDPSession(page);
  const frames = [];
  cdp.on('Page.screencastFrame', async f => {
    const i = frames.length; frames.push(f.metadata.timestamp);
    fs.writeFileSync(`${dir}/${String(i).padStart(5, '0')}.jpg`, Buffer.from(f.data, 'base64'));
    cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: W, maxHeight: H, everyNthFrame: 1 });
  const start = Date.now() / 1000;
  await actions();
  const end = Date.now() / 1000;
  await cdp.send('Page.stopScreencast');
  let list = '';
  frames.forEach((t, i) => { const next = i + 1 < frames.length ? frames[i + 1] : end; list += `file '${String(i).padStart(5, '0')}.jpg'\nduration ${Math.max(0.001, next - t).toFixed(4)}\n`; });
  list += `file '${String(frames.length - 1).padStart(5, '0')}.jpg'\n`;
  fs.writeFileSync(`${dir}/list.txt`, list);
  execFileSync(FF, ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', `${dir}/list.txt`, '-vf', `fps=30,scale=${W}:${H}:flags=lanczos,format=yuv420p`, '-c:v', 'libx264', '-crf', '14', '-preset', 'medium', `clips/${name}.mp4`]);
  console.log(name, frames.length, 'frames', (end - start).toFixed(1), 's', `${W}x${H}`);
}
