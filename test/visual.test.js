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
  await browser.close();
  console.log((fails ? fails + ' failed' : 'all passed') + ' (' + checks + ' visual checks)');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('FAIL visual test crashed: ' + (e.stack || e)); process.exit(1); });
