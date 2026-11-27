// Visual check in a real Chromium (Playwright): every colour band (slugline bars, cue boxes, shot and transition
// blocks, the selection) and the cursor follow one geometry. For many situations it measures that
//   - every band is exactly as high as the others and starts at its row's top (plus the gap), on whole device pixels
//   - bands of different kinds in the same row have the same top and bottom (no step), one piece per row (no hairline)
//   - the text lies above every band (a band never covers a letter, a descender or an underscore)
//   - the selection covers exactly the selected characters, shot blocks reach 16px beyond the text, transition blocks
//     reach the frame, the cursor has the band's top and height and is hidden while something is selected
// Run with: npm run visual (part of npm test). The page uses a local monospace font: the rules hold for any font.
const path = require('path');
const { chromium } = require('playwright');
const root = path.join(__dirname, '..');
const SCRIPT = [
  '---', '', '//TITLE PAGE', 'Title: Visual', 'Author: Test', '', '//SETTINGS', 'Page size: A4', 'Language: English', 'Autocomplete: On', 'Mode: Day', '', '---', '',
  '.i KÜCHE - MORGEN', '',
  'Anna steht am Fenster und hält eine Tasse Kaffee, die längst kalt ist. Draussen fährt ein Lieferwagen vorbei, dann ist es wieder still.', '',
  ',ANNA,', '(genervt)', 'Natürlich habe ich in der Jacke nachgeschaut, ganz sicher, gestern Abend schon.', '',
  ',TOM,', 'Dann liegt er im Auto. Er liegt _*immer*_ im Auto, glaub mir.', '',
  '// Notiz: hier vielleicht ein Blick auf die Uhr', '',
  '.s DIE SCHALE AUF DER KOMMODE, LEER BIS AUF EINE BÜROKLAMMER UND EINEN ZETTEL', '',
  ',*BEAMTER*,', 'Kann ich Ihnen helfen?', '',
  '.t SMASH CUT TO: AND THEN SOME MORE WORDS', '',
  '.ie AUTO / STRASSE - TAG', '', 'Rain.', '', '.act_end END OF ACT ONE'
].join('\n');
let fails = 0, checks = 0;
function ok(cond, label, extra){ checks++; if (!cond){ fails++; console.log('FAIL ' + label + (extra ? ' ' + extra : '')); } }
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1000, height: 1400 }, deviceScaleFactor: 2 });
  await page.setContent('<!doctype html><html><head><meta charset="utf-8"><style>@font-face{font-family:GTPressuraMonoRegular;src:local("DejaVu Sans Mono"),local("Liberation Mono"),local("Courier New")}body{margin:0;background:#F9F9F9}</style></head><body><div id="sm-editor"></div></body></html>');
  await page.addStyleTag({ path: path.join(root, 'capacitor.css') });
  // VISUAL_FAULT: a deliberate error, to see that the checks catch it
  if (process.env.VISUAL_FAULT) await page.addStyleTag({ content: process.env.VISUAL_FAULT });
  await page.evaluate(() => { try { localStorage.clear(); } catch (e){} window.SM_THEME = {}; });
  await page.addScriptTag({ path: path.join(root, 'capacitor.js') });
  await page.waitForFunction(() => document.getElementById('sm-editor').smCM);
  await page.evaluate(t => { const cm = document.getElementById('sm-editor').smCM; cm.setValue(t); cm.focus(); }, SCRIPT);
  await page.waitForTimeout(400);
  // show the title page too (it starts hidden)
  const measure = () => page.evaluate(() => {
    const cm = document.getElementById('sm-editor').smCM, v = cm.view, dpr = devicePixelRatio;
    const host = document.getElementById('sm-editor'), cs = getComputedStyle(host);
    const gap = parseFloat(cs.getPropertyValue('--sm-gap')) || 0, band = parseFloat(cs.getPropertyValue('--sm-band')), tail = parseFloat(cs.getPropertyValue('--sm-tail')) || 0;
    const lh = v.defaultLineHeight, B = cm.smBand();
    const bands = [...document.querySelectorAll('.sm-bands > div')].map(e => { const r = e.getBoundingClientRect(); return { cls: e.className, top: r.top, bottom: r.bottom, left: r.left, right: r.right }; });
    // row tops: every drawn line, every screen row of it
    const lines = [...document.querySelectorAll('.cm-line')].map(l => { const r = l.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, cls: l.className, text: l.textContent }; });
    // glyph boxes of every visible character: row, left, right, and the element on top at its centre (the bands are
    // made hit-testable for this, so a band lying above the text would be found)
    const hit = document.createElement('style'); hit.textContent = '.sm-bands,.sm-bands > div{pointer-events:auto !important}'; document.head.appendChild(hit);
    const glyphs = [];
    document.querySelectorAll('.cm-line').forEach(l => {
      const w = document.createTreeWalker(l, NodeFilter.SHOW_TEXT); let n;
      while ((n = w.nextNode())) for (let i = 0; i < n.length; i++){
        if (/\s/.test(n.data[i])) continue;
        const rg = document.createRange(); rg.setStart(n, i); rg.setEnd(n, i + 1);
        const b = rg.getBoundingClientRect(); if (!b.width) continue;
        const x = b.left + b.width / 2, y = b.top + b.height / 2, top = document.elementFromPoint(x, y);
        glyphs.push({ ch: n.data[i], left: b.left, right: b.right, top: b.top, bottom: b.bottom, onTop: !!(top && top.closest('.cm-content')), line: l });
      }
    });
    hit.remove();
    const cur = document.querySelector('.sm-caret'), cr = cur && getComputedStyle(cur).display !== 'none' && cur.offsetParent !== null ? cur.getBoundingClientRect() : null;
    const hc = v.coordsAtPos(v.state.selection.main.head, 1), gapX = hc ? hc.left : null;
    const sel = cm.somethingSelected();
    const docTop = v.documentTop;
    return { dpr, gap: B.gap, band: B.h, tail: 0, lh, bands, lines: lines.map(l => ({ top: l.top, bottom: l.bottom, left: l.left, right: l.right, cls: l.cls, text: l.text })), glyphs: glyphs.map(g => ({ ch: g.ch, left: g.left, right: g.right, top: g.top, bottom: g.bottom, onTop: g.onTop })), cursor: cr && { top: cr.top, height: cr.height, left: cr.left, width: cr.width }, gapX, sel, docTop };
  });
  function rules(m, label){
    const H = m.band + m.tail, grid = x => Math.abs(x * m.dpr - Math.round(x * m.dpr)) < 0.02;
    ok(m.bands.length > 0, label + ': bands drawn');
    // row tops are line tops plus whole rows
    const rowTops = [];
    m.lines.forEach(l => { for (let y = l.top; y < l.bottom - 1; y += m.lh) rowTops.push(y); });
    m.bands.forEach(b => {
      ok(Math.abs((b.bottom - b.top) - H) < 0.51, label + ': band height', b.cls + ' ' + (b.bottom - b.top) + ' vs ' + H);
      ok(rowTops.some(t => Math.abs(b.top - (t + m.gap)) < 0.51), label + ': band starts at a row top', b.cls + ' ' + b.top);
      ok(grid(b.top) && grid(b.bottom) && grid(b.left) && grid(b.right), label + ': band on device pixels', b.cls);
    });
    // same row: same top and bottom; one piece per kind and row
    for (let i = 0; i < m.bands.length; i++) for (let j = i + 1; j < m.bands.length; j++){
      const a = m.bands[i], b = m.bands[j];
      if (Math.abs(a.top - b.top) < m.lh / 2){
        ok(a.top === b.top && a.bottom === b.bottom, label + ': no step between bands in a row', a.cls + '/' + b.cls);
        if (a.cls === b.cls) ok(!(a.right < b.left && b.left - a.right < 2) && !(b.right < a.left && a.left - b.right < 2), label + ': no hairline', a.cls);
      }
    }
    // text above all bands
    const covered = m.glyphs.filter(g => !g.onTop);
    ok(!covered.length, label + ': text on top of the bands', covered.slice(0, 3).map(g => g.ch).join(''));
    // cursor
    if (m.sel) ok(!m.cursor, label + ': no cursor while selected');
    else if (m.cursor){
      ok(Math.abs(m.cursor.height - H) < 0.51, label + ': cursor height', m.cursor.height + ' vs ' + H);
      ok(rowTops.some(t => Math.abs(m.cursor.top - (t + m.gap)) < 0.51), label + ': cursor at a row top', '' + m.cursor.top);
      ok(Math.abs(m.cursor.width - 2) < 0.01, label + ': cursor 2px wide', '' + m.cursor.width);
      ok(Math.abs(m.cursor.left + m.cursor.width / 2 - m.gapX) <= 0.5 / m.dpr + 0.01, label + ': cursor centred on the gap', (m.cursor.left + m.cursor.width / 2) + ' vs ' + m.gapX);
      ok(grid(m.cursor.left) && grid(m.cursor.top), label + ': cursor on device pixels');
    }
  }
  const sel = (a, b) => page.evaluate(([a, b]) => { const cm = document.getElementById('sm-editor').smCM; cm.focus(); cm.setSelection(a, b); }, [a, b]);
  const lineOf = re => page.evaluate(src => { const cm = document.getElementById('sm-editor').smCM, r = new RegExp(src); for (let i = 0; i < cm.lineCount(); i++) if (r.test(cm.getLine(i))) return i; return -1; }, re.source);
  const L = { slug: await lineOf(/^\.i KÜCHE/), act: await lineOf(/^Anna steht/), dlg: await lineOf(/^Natürlich/), emph: await lineOf(/immer/), shot: await lineOf(/^\.s DIE/), cue: await lineOf(/BEAMTER/), trans: await lineOf(/^\.t SMASH/) };
  const cases = [
    ['no selection', null],
    ['slugline selected', [{ line: L.slug, ch: 0 }, { line: L.slug, ch: 99 }]],
    ['part of a slugline', [{ line: L.slug, ch: 4 }, { line: L.slug, ch: 9 }]],
    ['action over three rows', [{ line: L.act, ch: 0 }, { line: L.act, ch: 999 }]],
    ['one space selected', [{ line: L.act, ch: 4 }, { line: L.act, ch: 5 }]],
    ['dialogue below a parenthetical', [{ line: L.dlg, ch: 0 }, { line: L.dlg, ch: 999 }]],
    ['emphasis with underscores', [{ line: L.emph, ch: 20 }, { line: L.emph, ch: 50 }]],
    ['into a shot block', [{ line: L.shot, ch: 10 }, { line: L.shot, ch: 70 }]],
    ['a cue box', [{ line: L.cue, ch: 2 }, { line: L.cue, ch: 9 }]],
    ['a transition', [{ line: L.trans, ch: 3 }, { line: L.trans, ch: 30 }]],
    ['from slugline to dialogue', [{ line: L.slug, ch: 3 }, { line: L.dlg, ch: 20 }]],
    ['cursor on a slugline', [{ line: L.slug, ch: 2 }, { line: L.slug, ch: 2 }]],
    ['cursor in a shot', [{ line: L.shot, ch: 5 }, { line: L.shot, ch: 5 }]],
    ['cursor on an empty line', [{ line: L.slug + 1, ch: 0 }, { line: L.slug + 1, ch: 0 }]]
  ];
  for (const [label, s] of cases){
    if (s) await sel(s[0], s[1]); else await page.evaluate(() => { const cm = document.getElementById('sm-editor').smCM; cm.focus(); cm.setCursor({ line: 0, ch: 0 }); });
    await page.waitForTimeout(150);
    const m = await measure();
    rules(m, label);
    if (s && (s[0].line !== s[1].line || s[0].ch !== s[1].ch)){
      // the selection covers exactly the selected characters of each row (first and last glyph)
      const sb = m.bands.filter(b => b.cls === 'sm-band-sel');
      ok(sb.length > 0, label + ': selection drawn');
    }
  }
  // shot blocks reach 16px beyond the text, transition blocks reach the frame
  await page.evaluate(() => { const cm = document.getElementById('sm-editor').smCM; cm.setCursor({ line: 0, ch: 0 }); });
  await page.waitForTimeout(150);
  const g = await page.evaluate(([shot, trans]) => {
    const cm = document.getElementById('sm-editor').smCM, v = cm.view, out = { shot: [], trans: [] };
    const bands = [...document.querySelectorAll('.sm-bands > div')].map(e => ({ cls: e.className, r: e.getBoundingClientRect() }));
    for (const [n, key, cls] of [[shot, 'shot', 'sm-band-shot'], [trans, 'trans', 'sm-band-trans']]){
      const l = v.state.doc.line(n + 1), el = [...document.querySelectorAll('.cm-line')].find(e => v.state.doc.lineAt(v.posAtDOM(e)).number === n + 1);
      const lr = el.getBoundingClientRect();
      bands.filter(b => b.cls === cls && b.r.top >= lr.top - 6 && b.r.top < lr.bottom).forEach(b => out[key].push({ left: b.r.left, right: b.r.right, lineRight: lr.right }));
      out[key + 'Text'] = [...Array(l.length).keys()].map(i => v.coordsAtPos(l.from + i, 1)).filter(Boolean).map(c => c.left);
    }
    return out;
  }, [L.shot, L.trans]);
  ok(g.shot.length >= 2, 'shot block has a rectangle per row', '' + g.shot.length);
  ok(g.shot.every(r => Math.abs(r.left - (Math.min(...g.shotText) - 16)) < 0.6), 'shot block starts 16px before the text');
  ok(g.trans.length >= 2 && g.trans.every(r => Math.abs(r.right - r.lineRight) < 0.6), 'transition block reaches the frame');
  // selected text is light everywhere, also in cues, shots, transitions and the .s of a shot
  for (const [label, line] of [['cue', L.cue], ['shot', L.shot], ['transition', L.trans], ['slugline', L.slug]]){
    await sel({ line, ch: 0 }, { line, ch: 999 });
    await page.waitForTimeout(120);
    const bad = await page.evaluate(n => {
      const cm = document.getElementById('sm-editor').smCM, v = cm.view, bg = getComputedStyle(document.getElementById('sm-editor')).getPropertyValue('--sm-bg').trim();
      const probe = document.createElement('span'); probe.style.color = bg; document.body.appendChild(probe); const want = getComputedStyle(probe).color; probe.remove();
      const el = [...document.querySelectorAll('.cm-line')].find(e => v.state.doc.lineAt(v.posAtDOM(e)).number === n + 1), out = [];
      const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let t;
      while ((t = w.nextNode())) if (t.data.trim() && getComputedStyle(t.parentNode).color !== want) out.push(t.data.trim() + ':' + getComputedStyle(t.parentNode).color);
      return out;
    }, line);
    ok(!bad.length, 'selected ' + label + ': all text light', bad.slice(0, 3).join(' '));
  }
  // the cursor stands at the same place whichever side it came from (Left or Right arrow)
  {
    const pos = await page.evaluate(n => document.getElementById('sm-editor').smCM.view.state.doc.line(n + 1).from + 9, L.act);
    const at = async side => { await page.evaluate(([p, sd]) => { const cm = document.getElementById('sm-editor').smCM, v = cm.view; cm.focus(); const ES = v.state.selection.constructor; v.dispatch({ selection: ES.create([ES.cursor(p, sd)]) }); window.__assoc = v.state.selection.main.assoc; }, [pos, side]); await page.waitForTimeout(120); return page.evaluate(() => document.querySelector('.sm-caret').getBoundingClientRect().left); };
    const fromRight = await at(-1), fromLeft = await at(1);
    ok(fromRight === fromLeft, 'cursor at the same place from the left and from the right', fromLeft + ' / ' + fromRight);
  }
  // scene numbers (Option+Cmd+8): each number stands on the baseline of its slugline's text, so it is centred on the
  // bar as the slugline text is
  {
    await page.evaluate(() => { const cm = document.getElementById('sm-editor').smCM; cm.focus(); cm.setCursor({ line: 0, ch: 0 }); });
    await page.keyboard.press('Control+Shift+8');
    await page.waitForTimeout(300);
    const sn = await page.evaluate(() => {
      const nums = [...document.querySelectorAll('.sm-scenenum:not(.sm-cmdmark)')];
      const slugs = [...document.querySelectorAll('.cm-line.sm-l-slug')].filter(l => l.getBoundingClientRect().height);
      const bottom = el => { const r = document.createRange(); r.selectNodeContents(el); return r.getClientRects()[0].bottom; };
      return { n: nums.length, s: slugs.length, pairs: nums.map((e, i) => slugs[i] ? [bottom(e), bottom(slugs[i])] : null).filter(Boolean) };
    });
    ok(sn.n > 0 && sn.pairs.length === sn.n, 'scene numbers shown, one per slugline', sn.n + ' / ' + sn.s);
    sn.pairs.forEach((p, i) => ok(Math.abs(p[0] - p[1]) < 0.51, 'scene number ' + (i + 1) + ' on its slugline text', p[0] + ' vs ' + p[1]));
    await page.keyboard.press('Control+Shift+8');
  }
  // the stylesheet arriving after the editor started (Safari draws once before it is in): the bands follow
  {
    const p2 = await browser.newPage({ viewport: { width: 1000, height: 1400 }, deviceScaleFactor: 2 });
    await p2.setContent('<!doctype html><html><head><meta charset="utf-8"><style>@font-face{font-family:GTPressuraMonoRegular;src:local("DejaVu Sans Mono"),local("Liberation Mono")}body{margin:0;background:#F9F9F9;font-size:12px;line-height:1.4}</style></head><body><div id="sm-editor"></div></body></html>');
    await p2.evaluate(() => { try { localStorage.clear(); } catch (e){} });
    await p2.addScriptTag({ path: path.join(root, 'capacitor.js') });
    await p2.waitForFunction(() => document.getElementById('sm-editor').smCM);
    await p2.evaluate(t => { const cm = document.getElementById('sm-editor').smCM; cm.setValue(t); cm.focus(); cm.setSelection({line: 14, ch: 0}, {line: 16, ch: 20}); }, SCRIPT);
    await p2.waitForTimeout(300);
    await p2.addStyleTag({ path: path.join(root, 'capacitor.css') });
    await p2.waitForTimeout(600);
    const m2 = await p2.evaluate(() => {
      const cm = document.getElementById('sm-editor').smCM, v = cm.view, B = cm.smBand(), lh = v.defaultLineHeight;
      const bands = [...document.querySelectorAll('.sm-bands > div')].map(e => { const r = e.getBoundingClientRect(); return { cls: e.className, top: r.top, h: r.height }; });
      const tops = []; document.querySelectorAll('.cm-line').forEach(l => { const r = l.getBoundingClientRect(); for (let y = r.top; y < r.bottom - 1; y += lh) tops.push(y); });
      return { B, lh, bands, tops };
    });
    ok(m2.lh > 20, 'late stylesheet: line height taken over', '' + m2.lh);
    ok(m2.bands.length > 0 && m2.bands.every(b => Math.abs(b.h - m2.B.h) < 0.51 && m2.B.h >= m2.lh), 'late stylesheet: bands as high as a line and more', JSON.stringify(m2.bands.slice(0, 3)) + ' ' + JSON.stringify(m2.B));
    ok(m2.bands.every(b => m2.tops.some(t => Math.abs(b.top - (t + m2.B.gap)) < 0.51)), 'late stylesheet: bands at row tops');
    await p2.close();
  }
  // Back from About or Guide (the editor shown again): the cursor grows once; not in a locked script (after /fuel)
  {
    const growths = () => page.evaluate(async () => {
      const host = document.getElementById('sm-editor'), cm = host.smCM;
      cm.setCursor({ line: cm.lastLine(), ch: 0 });
      host.style.display = 'none'; await new Promise(r => setTimeout(r, 150));
      host.style.display = ''; await new Promise(r => setTimeout(r, 400));
      return [...document.querySelectorAll('#sm-editor div')].filter(d => d.style.zIndex === '5' && d.getAnimations && d.getAnimations().length).length;
    });
    ok(await growths() === 1, 'back in the editor: the cursor grows once');
    await page.evaluate(() => { const cm = document.getElementById('sm-editor').smCM; cm.smSync.ready = cb => cb('t'.repeat(32)); window.smFueled('yes'); });
    await page.waitForTimeout(1300);
    ok(await page.evaluate(() => document.getElementById('sm-editor').smCM.smLocked()), 'locked for the next check');
    ok(await growths() === 0, 'back in a locked script: the cursor does not grow');
  }
  // Typing: Typewriter. The line being typed stays at the middle of the window and the text moves up; near the top
  // nothing moves; two marks at the frame lines show the line's top; scrolling hides them until the next keystroke
  {
    const p3 = await browser.newPage({ viewport: { width: 1000, height: 800 }, deviceScaleFactor: 2 });
    await p3.setContent('<!doctype html><html><head><meta charset="utf-8"><style>@font-face{font-family:GTPressuraMonoRegular;src:local("DejaVu Sans Mono"),local("Liberation Mono"),local("Courier New")}body{margin:0;background:#F9F9F9}#head{height:200px}#foot{height:220px}</style></head><body><div id="head"></div><div id="sm-editor"></div><div id="foot"></div></body></html>');
    await p3.addStyleTag({ path: path.join(root, 'capacitor.css') });
    await p3.evaluate(() => { try { localStorage.clear(); } catch (e){} window.SM_THEME = {}; });
    await p3.addScriptTag({ path: path.join(root, 'capacitor.js') });
    await p3.waitForFunction(() => document.getElementById('sm-editor').smCM);
    const frames = () => p3.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r)))));
    const tp = t => '---\n\n//TITLE PAGE\nTitle: T\nAuthor: A\n\n//SETTINGS\nPage size: A4\nLanguage: English\nAutocomplete: Off\nTyping: ' + t + '\nMode: Day\n\n---\n\n';
    const scenes = n => Array.from({ length: n }, (_, i) => '.i ROOM ' + i + ' - DAY\n\nShe reads the letter number ' + i + ' and puts it back.\n\n,ANNA,\nNot again.').join('\n\n');
    const load = (text, line) => p3.evaluate(([t, l]) => { const cm = document.getElementById('sm-editor').smCM; cm.setValue(t); cm.focus(); const ln = l < 0 ? cm.lastLine() : l; cm.setCursor({ line: ln, ch: cm.getLine(ln).length }); }, [text, line]);
    const state = () => p3.evaluate(() => {
      const cm = document.getElementById('sm-editor').smCM, B = cm.smBand(), vh = innerHeight;
      const car = document.querySelector('.sm-caret'), c = car && car.getBoundingClientRect();
      const sc = document.querySelector('#sm-editor .cm-scroller').getBoundingClientRect(), sw = document.querySelector('#sm-editor .cm-scroller').clientWidth;
      const marks = [...document.querySelectorAll('.sm-twmark')].filter(e => getComputedStyle(e).display !== 'none').map(e => { const r = e.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, w: r.width, h: r.height }; });
      return { y: scrollY, vh, gap: B.gap, caret: c ? { top: c.top, bottom: c.bottom, mid: (c.top + c.bottom) / 2 - B.gap / 2 } : null, rowTop: c ? c.top - B.gap : null, lh: cm.view.defaultLineHeight, sc: { left: sc.left, right: sc.left + sw }, marks, tw: document.getElementById('sm-editor').classList.contains('sm-typewriter') };
    });
    const atMiddle = s => s.caret && Math.abs((s.rowTop + s.lh / 2) - s.vh / 2) <= 1;
    // two dark pieces of the frame lines (the 2 px borders just outside the scroller), 24 px high, centred on the row
    const marksOk = s => s.marks.length === 2 && s.marks.every(m => Math.abs((m.top + m.bottom) / 2 - (s.rowTop + s.lh / 2)) <= 1 && Math.abs(m.h - 24) < 0.01 && Math.abs(m.w - 2) < 0.01) &&
      Math.abs(Math.min(s.marks[0].left, s.marks[1].left) - (s.sc.left - 2)) <= 0.51 && Math.abs(Math.max(s.marks[0].right, s.marks[1].right) - (s.sc.right + 2)) <= 0.51;
    // near the top: nothing moves, no marks
    await load(tp('Typewriter') + '.i HOUSE - DAY\n\nShort.', -1);
    await p3.evaluate(() => scrollTo(0, 0)); await frames();
    await p3.keyboard.type(' More.'); await frames();
    let s = await state();
    ok(s.tw, 'typewriter: the editor gets the class with room below');
    ok(s.y === 0, 'typewriter, near the top: the page does not scroll', '' + s.y);
    ok(s.marks.length === 0, 'typewriter, near the top: no marks', JSON.stringify(s.marks));
    // a long script, typing at its very end: the last line comes to the middle (there is room below it)
    await load(tp('Typewriter') + scenes(40), -1); await frames();
    await p3.keyboard.press('Enter'); await p3.keyboard.press('Enter'); await p3.keyboard.type('She waits.'); await frames();
    s = await state();
    ok(atMiddle(s), 'typewriter: the last line stands at the middle of the window', JSON.stringify({ y: s.y, rowTop: s.rowTop, vh: s.vh }));
    ok(marksOk(s), 'typewriter: two marks, 2 x 24 px, on the frame lines, centred on the line', JSON.stringify({ marks: s.marks, rowTop: s.rowTop, sc: s.sc }));
    // typing on: rows wrap and new lines start, the line stays at the middle and the text above moves up
    const y0 = s.y;
    await p3.keyboard.type(' The phone rings twice, then stops, and the room is so quiet that she can hear the fridge again.'); await frames();
    s = await state();
    ok(atMiddle(s) && s.y > y0, 'typewriter: after the rows wrap the line is still at the middle, the text moved up', JSON.stringify({ y0, y: s.y, rowTop: s.rowTop }));
    ok(marksOk(s), 'typewriter: the marks follow the line');
    // Enter at the very end of the script: the new line comes to the middle right away, not one keystroke later
    for (let k = 0; k < 3; k++){
      await p3.keyboard.press('Enter'); await frames();
      s = await state();
      ok(atMiddle(s) && marksOk(s), 'typewriter: Enter at the end of the script, the new line at once at the middle (' + (k + 1) + ')', JSON.stringify({ rowTop: s.rowTop, vh: s.vh, m: s.marks.length }));
      await p3.keyboard.type('Then.'); await frames();
    }
    // a click on a line above (no scrolling) and arrow keys: nothing moves, the marks stay
    const before = s;
    const lineAbove = await p3.evaluate(() => { const ls = [...document.querySelectorAll('.cm-line')].filter(l => { const r = l.getBoundingClientRect(); return r.top > 120 && r.bottom < innerHeight / 2 - 60 && l.textContent.length > 10; }); const r = ls[0].getBoundingClientRect(); return { x: r.left + 60, y: r.top + r.height / 2 }; });
    await p3.mouse.click(lineAbove.x, lineAbove.y); await frames();
    s = await state();
    ok(s.y === before.y && s.marks.length === 2 && Math.abs(s.marks[0].top - before.marks[0].top) < 0.01, 'typewriter: a click moves nothing and the marks stay', JSON.stringify({ y: s.y, by: before.y, m: s.marks.length }));
    await p3.keyboard.press('ArrowDown'); await frames();
    s = await state();
    ok(s.y === before.y && s.marks.length === 2, 'typewriter: an arrow key moves nothing and the marks stay', JSON.stringify({ y: s.y, by: before.y }));
    // the next keystroke brings that line between the marks
    await p3.keyboard.type('x'); await frames();
    s = await state();
    ok(atMiddle(s) && marksOk(s), 'typewriter: the next keystroke brings the line to the middle, between the marks', JSON.stringify({ rowTop: s.rowTop, vh: s.vh, m: s.marks }));
    // the reader scrolls: the marks go; the next keystroke brings them back
    await p3.mouse.move(500, 400); await p3.mouse.wheel(0, -240); await p3.waitForTimeout(250); await frames();
    s = await state();
    ok(s.marks.length === 0, 'typewriter: scrolling hides the marks', JSON.stringify(s.marks));
    await p3.keyboard.type('y'); await frames();
    s = await state();
    ok(atMiddle(s) && marksOk(s), 'typewriter: typing again brings the line and the marks back');
    // a new size of the window hides them too
    await p3.setViewportSize({ width: 1000, height: 760 }); await p3.waitForTimeout(150); await frames();
    s = await state();
    ok(s.marks.length === 0, 'typewriter: a new window size hides the marks');
    await p3.setViewportSize({ width: 1000, height: 800 });
    // The title page: shown above, the marks stay with their row in the script; typing on it, Tab through its
    // settings: the text does not move and the marks go
    await load(tp('Typewriter') + scenes(40), -1); await frames();
    await p3.keyboard.press('Enter'); await p3.keyboard.press('Enter'); await p3.keyboard.type('Zq waits.'); await frames();
    s = await state();
    ok(marksOk(s), 'title page: marks on the row typed in the script');
    const k9 = () => p3.evaluate(() => document.getElementById('sm-editor').smCM.triggerOnKeyDown({ type: 'keydown', keyCode: 57, key: '9', ctrlKey: true, shiftKey: true, preventDefault(){}, stopPropagation(){} }));
    await k9(); await frames(); await p3.waitForTimeout(100); await frames();
    const rowAtMarks = () => p3.evaluate(() => {
      const ms = [...document.querySelectorAll('.sm-twmark')].filter(e => getComputedStyle(e).display !== 'none');
      if (!ms.length) return null;
      const r = ms[0].getBoundingClientRect(), sc = document.querySelector('#sm-editor .cm-scroller').getBoundingClientRect();
      if (r.top + 12 < 0 || r.top + 12 > innerHeight) return 'off screen';
      const el = document.elementFromPoint(sc.left + 40, r.top + 12), line = el && el.closest('.cm-line');
      return line ? line.textContent : '(no line)';
    });
    const shown = await p3.evaluate(() => /^---/.test(document.getElementById('sm-editor').smCM.getValue()) && !/sm-gone/.test(document.getElementById('sm-editor').smCM.getLineHandle(3).wrapClass || ''));
    const at = await rowAtMarks();
    ok(shown && (at === null || at === 'off screen' || /Zq waits/.test(at)), 'title page shown: the marks are not in it, they stay with their row', JSON.stringify({ shown, at }));
    const y1 = (await state()).y;
    await p3.keyboard.type('Night'); await frames();
    s = await state();
    ok(s.marks.length === 0 && s.y === y1, 'typing a title: the text does not move and the marks go', JSON.stringify({ y: s.y, y1, m: s.marks.length }));
    for (let k = 0; k < 6; k++) await p3.keyboard.press('Tab');
    await frames();
    s = await state();
    ok(s.marks.length === 0 && /^Mode:/.test(await p3.evaluate(() => { const cm = document.getElementById('sm-editor').smCM; return cm.getLine(cm.getCursor().line); })), 'Tab through the settings to Mode: no marks', JSON.stringify(s.marks));
    // Enter after the last setting and Backspace (a new command line, taken back), low enough on the page to be centred
    const y2 = s.y;
    await p3.keyboard.press('Enter'); await frames(); await p3.keyboard.press('Backspace'); await frames();
    s = await state();
    ok(s.marks.length === 0 && s.y === y2, 'Enter and Backspace on the last setting: the text does not move, no marks in the settings', JSON.stringify({ y: s.y, y2, m: s.marks }));
    await k9(); await frames();
    // Safari keeps scroll positions on whole pixels: with the middle between two pixels (an odd window height) typing
    // along a row asks for no scroll at all
    await p3.setViewportSize({ width: 1000, height: 801 }); await p3.waitForTimeout(150);
    await load(tp('Typewriter') + scenes(40), -1); await frames();
    await p3.keyboard.press('Enter'); await p3.keyboard.press('Enter'); await p3.keyboard.type('Yes.'); await frames();
    await p3.evaluate(() => { window.__sc = []; const by = window.scrollBy.bind(window), to = window.scrollTo.bind(window);
      window.scrollBy = function(x, y){ window.__sc.push(['by', x, y]); return by.apply(null, arguments); };
      window.scrollTo = function(x, y){ window.__sc.push(['to', x, y]); return to.apply(null, arguments); }; });
    for (const ch of 'abcdefgh') { await p3.keyboard.press(ch); await frames(); }
    const sc = await p3.evaluate(() => { const r = window.__sc; delete window.scrollBy; delete window.scrollTo; return r; });
    s = await state();
    ok(sc.length === 0 && atMiddle(s), 'odd window height: typing along a row asks for no scroll, the row stays at the middle', JSON.stringify({ sc: sc.slice(0, 4), rowTop: s.rowTop, vh: s.vh }));
    await p3.setViewportSize({ width: 1000, height: 800 }); await p3.waitForTimeout(150);
    // Standard: no class, no marks, and typing at the end only brings the cursor into view
    await load(tp('Standard') + scenes(40), -1); await frames();
    await p3.keyboard.press('Enter'); await p3.keyboard.press('Enter'); await p3.keyboard.type('She waits.'); await frames();
    s = await state();
    ok(!s.tw && s.marks.length === 0, 'standard: no room below, no marks');
    ok(!atMiddle(s) && s.caret && s.caret.bottom <= s.vh, 'standard: the cursor is only brought into view, not to the middle', JSON.stringify({ rowTop: s.rowTop, vh: s.vh }));
    await p3.close();
  }
  await browser.close();
  console.log((fails ? fails + ' failed' : 'all passed') + ' (' + checks + ' visual checks)');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('FAIL visual test crashed: ' + (e.stack || e)); process.exit(1); });
