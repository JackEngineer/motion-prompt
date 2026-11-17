/* Motion Prompt · pack "artstyle" · MIT License (c) 2026 Shohei Ohtaki · https://github.com/showheyohtaki/motion-prompt */
MotionPrompt.pack('artstyle', function () {
  // @kit
  // 每张卡片为 539 × 208 像素，循环时长为 4.7 秒。每帧仅由时间 u 决定。
  // 24 张画风示例都由图像生成模型参照同一张线稿生成，线稿中有山丘、房屋、树和太阳。
  // 资源位于 img/*.webp，分辨率为 1078 × 416 像素，是卡片尺寸的两倍。图片由原作者生成并以 MIT 许可证发布。
  // 图片异步加载。ready 完成前只绘制纯色背景，完成后每帧仅由时间 u 决定。
  const CW = 539, CH = 208, CYC = 4.7;
  const SITE_IMG = 'https://showheyohtaki.github.io/motion-prompt/packs/artstyle/';

  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, x) => a + (b - a) * x;
  const P = (t, a, b) => clamp((t - a) / (b - a));
  const eIO = x => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;

  // 优先从脚本所在目录加载图片。独立粘贴使用时回退到公开站点。
  const IMG_BASE = (() => {
    try {
      const s = typeof document !== 'undefined' && document.currentScript && document.currentScript.src;
      if (typeof s === 'string' && s && typeof URL !== 'undefined') return new URL('./', s).href;
    } catch (e) {  }
    return SITE_IMG;
  })();
  // 08（彩色玻璃）和 23（合成器浪潮）的裁剪范围不同，各自使用对应的线稿。
  const OWN_BASE = ['08', '23'];
  const IMG_FILES = ['img/base.webp', ...OWN_BASE.map(n => `img/base-${n}.webp`),
    ...Array.from({ length: 24 }, (_, i) => `img/style-${String(i + 1).padStart(2, '0')}.webp`)];
  const IMG = {};
  const ready = Promise.all(IMG_FILES.map(f => new Promise((res, rej) => {
    const im = new Image();
    im.crossOrigin = 'anonymous';
    im.onload = () => { IMG[f] = im; res(); };
    im.onerror = () => rej(new Error('图片加载失败：' + f));
    im.src = IMG_BASE + f;
  })));
  const ok = im => !!(im && im.complete && im.naturalWidth);

  // 用铅笔图标标记线稿，无需文字标签。
  function pencilTag(k, a) {
    k.save(); k.globalAlpha = a;
    k.beginPath(); k.roundRect(10, 10, 40, 28, 8); k.fillStyle = 'rgba(30,30,33,.72)'; k.fill();
    k.translate(30, 24); k.rotate(-Math.PI / 4);
    k.fillStyle = '#FFFFFF';
    k.fillRect(-7, -2.6, 11, 5.2);
    k.beginPath(); k.moveTo(4.6, -2.6); k.lineTo(9.6, 0); k.lineTo(4.6, 2.6); k.closePath(); k.fill();
    k.fillRect(-10, -2.6, 2.2, 5.2);
    k.restore();
  }

  // 前 0.5 秒显示线稿，0.5 至 1.35 秒斜向擦除切入画风，0.5 至 4 秒逐渐放大到 1.045 倍，4 至 4.5 秒淡回线稿。
  function gafu(k, w, h, u, no) {
    const st = IMG[`img/style-${no}.webp`];
    const base = IMG[OWN_BASE.includes(no) ? `img/base-${no}.webp` : 'img/base.webp'];
    k.fillStyle = '#FFFFFF'; k.fillRect(0, 0, w, h);
    if (!ok(st) || !ok(base)) { k.fillStyle = '#F1F0EE'; k.fillRect(0, 0, w, h); return; }
    const wp = eIO(P(u, 0.5, 1.35));
    const back = eIO(P(u, 4.0, 4.5));
    const zoom = 1 + 0.045 * eIO(P(u, 0.5, 4.0)) * (1 - back);
    const draw = (im, a) => { k.save(); k.globalAlpha = a; k.translate(w / 2, h / 2); k.scale(zoom, zoom); k.drawImage(im, -w / 2, -h / 2, w, h); k.restore(); };
    draw(base, 0.5);                                                  // 调低线稿的不透明度，以便与线描画风区分。
    if (wp > 0 && back < 1) {
      const tilt = 60, x = lerp(-tilt - 8, w + 8, wp);
      k.save(); k.beginPath(); k.moveTo(-10, -10); k.lineTo(x + tilt, -10); k.lineTo(x, h + 10); k.lineTo(-10, h + 10); k.closePath(); k.clip();
      draw(st, 1 - back); k.restore();
      if (wp < 1) { k.save(); k.strokeStyle = 'rgba(255,255,255,.95)'; k.lineWidth = 4; k.beginPath(); k.moveTo(x + tilt, -10); k.lineTo(x, h + 10); k.stroke(); k.restore(); }
    }
    const a1 = clamp(1 - P(u, 0.45, 0.7) + P(u, 4.15, 4.45));
    if (a1 > 0.01) pencilTag(k, a1);
  }
  const CELLS = [];

  // @element 01
  CELLS[0] = (k, w, h, u) => gafu(k, w, h, u, '01');

  // @element 02
  CELLS[1] = (k, w, h, u) => gafu(k, w, h, u, '02');

  // @element 03
  CELLS[2] = (k, w, h, u) => gafu(k, w, h, u, '03');

  // @element 04
  CELLS[3] = (k, w, h, u) => gafu(k, w, h, u, '04');

  // @element 05
  CELLS[4] = (k, w, h, u) => gafu(k, w, h, u, '05');

  // @element 06
  CELLS[5] = (k, w, h, u) => gafu(k, w, h, u, '06');

  // @element 07
  CELLS[6] = (k, w, h, u) => gafu(k, w, h, u, '07');

  // @element 08
  CELLS[7] = (k, w, h, u) => gafu(k, w, h, u, '08');

  // @element 09
  CELLS[8] = (k, w, h, u) => gafu(k, w, h, u, '09');

  // @element 10
  CELLS[9] = (k, w, h, u) => gafu(k, w, h, u, '10');

  // @element 11
  CELLS[10] = (k, w, h, u) => gafu(k, w, h, u, '11');

  // @element 12
  CELLS[11] = (k, w, h, u) => gafu(k, w, h, u, '12');

  // @element 13
  CELLS[12] = (k, w, h, u) => gafu(k, w, h, u, '13');

  // @element 14
  CELLS[13] = (k, w, h, u) => gafu(k, w, h, u, '14');

  // @element 15
  CELLS[14] = (k, w, h, u) => gafu(k, w, h, u, '15');

  // @element 16
  CELLS[15] = (k, w, h, u) => gafu(k, w, h, u, '16');

  // @element 17
  CELLS[16] = (k, w, h, u) => gafu(k, w, h, u, '17');

  // @element 18
  CELLS[17] = (k, w, h, u) => gafu(k, w, h, u, '18');

  // @element 19
  CELLS[18] = (k, w, h, u) => gafu(k, w, h, u, '19');

  // @element 20
  CELLS[19] = (k, w, h, u) => gafu(k, w, h, u, '20');

  // @element 21
  CELLS[20] = (k, w, h, u) => gafu(k, w, h, u, '21');

  // @element 22
  CELLS[21] = (k, w, h, u) => gafu(k, w, h, u, '22');

  // @element 23
  CELLS[22] = (k, w, h, u) => gafu(k, w, h, u, '23');

  // @element 24
  CELLS[23] = (k, w, h, u) => gafu(k, w, h, u, '24');

  // @end
  return { width: CW, height: CH, cycle: CYC, cells: CELLS, fonts: [], images: IMG_FILES, ready };
});
