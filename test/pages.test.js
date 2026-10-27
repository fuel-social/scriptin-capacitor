// Performance check: a 500+ page script in a jsdom CodeMirror; time per keystroke for our own code.
// Run with: node test/bench.js   (BENCH_SCENES to change the size)
const { w, cm } = require('./harness')();
const sleep = ms => new Promise(r => setTimeout(r, ms));
// Incremental page count and line classes against full ones: random edits on a long script, after every edit both must agree.
// Run with: node test/pages.test.js (PAGES_SEED, PAGES_STEPS to vary)
let seed = +(process.env.PAGES_SEED || 7);
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const pick = a => a[Math.floor(rnd() * a.length)];
const SENT = ['She waits.', 'The phone rings twice and stops.', 'He looks at her for a long time, then turns away and walks to the window.', 'Nothing moves... nothing at all.', 'A car passes -- slowly.', 'They _never_ speak about it *again*.'];
function para(){
  const r = rnd();
  if (r < 0.12) return '.i ' + pick(['HOUSE', 'GARDEN', 'CAR', 'OFFICE']) + ' - ' + pick(['DAY', 'NIGHT']);
  if (r < 0.18) return '.s ' + pick(['close on the letter', 'her hands', 'the door']);
  if (r < 0.22) return '.t CUT TO:';
  if (r < 0.26) return '// ' + pick(['a note', 'check this', 'longer note about the scene']);
  if (r < 0.28) return '===';
  if (r < 0.30) return '/pdf';
  if (r < 0.55){ let d = ',' + pick(['ANNA', 'BEN', 'MARA']) + ',\n'; const k = 1 + Math.floor(rnd() * 6); for (let i = 0; i < k; i++) d += (rnd() < 0.2 ? '(' + pick(['quietly', 'beat', 'to Ben']) + ')' : pick(SENT) + ' ' + pick(SENT)) + (i < k - 1 ? '\n' : ''); return d; }
  let a = ''; const k = 1 + Math.floor(rnd() * 5); for (let i = 0; i < k; i++) a += pick(SENT) + ' '; return a.trim();
}
const head = '---\n\n//TITLE PAGE\nTitle: Pages\nAuthor: Test\n\n//SETTINGS\nPage size: A4\nLanguage: English\nAutocomplete: On\nMode: Day\n\n---';
setTimeout(async function(){
  let fails = 0, steps = +(process.env.PAGES_STEPS || 600), checks = 0;
  const ps = [head]; for (let i = 0; i < 600; i++) ps.push(para());
  cm.setValue(ps.join('\n\n')); cm.clearHistory(); await sleep(50);
  const pages0 = cm.smPages().full.length + 1;
  function same(label){
    const p = cm.smPages(), a = JSON.stringify(p.inc.map(x => [x.line, x.ch])), b = JSON.stringify(p.full.map(x => [x.line, x.ch]));
    checks++;
    if (a !== b){ fails++; if (fails < 6) console.log('FAIL ' + label + '\n  inc  ' + a.slice(0, 300) + '\n  full ' + b.slice(0, 300)); }
  }
  same('start');
  for (let s = 0; s < steps; s++){
    if (cm.lineCount() < 40) break; // the page limit lets a long script shrink but not grow again
    const n = cm.lineCount(), ln = 14 + Math.floor(rnd() * (n - 14)), L = cm.getLine(ln), ch = Math.floor(rnd() * (L.length + 1)), r = rnd();
    let label;
    if (r < 0.3){ cm.replaceRange(pick(['x', ' ', 'word ', '.', 'A longer phrase that wraps the line further. ']), {line:ln, ch}, null, '+input'); label = 'type'; }
    else if (r < 0.45){ cm.replaceRange('\n', {line:ln, ch}, null, '+input'); label = 'newline'; }
    else if (r < 0.6){ if (ch > 0) cm.replaceRange('', {line:ln, ch:ch - 1}, {line:ln, ch}, '+delete'); else if (ln > 14) cm.replaceRange('', {line:ln - 1, ch:cm.getLine(ln - 1).length}, {line:ln, ch:0}, '+delete'); label = 'delete'; }
    else if (r < 0.7){ const e = Math.min(cm.lastLine(), ln + 1 + Math.floor(rnd() * 8)); cm.replaceRange('', {line:ln, ch:0}, {line:e, ch:0}, '+delete'); label = 'delete lines'; }
    else if (r < 0.82){ cm.replaceRange('\n\n' + para() + '\n\n' + para(), {line:ln, ch:L.length}, null, 'paste'); label = 'paste'; }
    else if (r < 0.9){ cm.operation(() => { cm.replaceRange('two ', {line:ln, ch}, null, '+input'); const l2 = 14 + Math.floor(rnd() * (cm.lineCount() - 14)); cm.replaceRange('\n', {line:l2, ch:0}, null, '+input'); }); label = 'two changes in one go'; }
    else if (r < 0.95){ cm.replaceRange('x', {line:3, ch:cm.getLine(3).length}, null, '+input'); label = 'title page'; }
    else if (r < 0.97){ const v = pick([1, 2, 3, 4, 6, 1]); cm.triggerOnKeyDown({ type:'keydown', keyCode:48 + v, key:String(v), ctrlKey:true, shiftKey:true, preventDefault(){}, stopPropagation(){} }); label = 'view ' + v; }
    else { cm.execCommand(rnd() < 0.7 ? 'undo' : 'redo'); label = 'undo/redo'; }
    // now and then only a small part is laid out, and the next edit comes before the rest: checked a few steps later
    if (rnd() < 0.5){ cm.smPagesStep(1 + Math.floor(rnd() * 3)); if (rnd() < 0.6) continue; }
    same(label + ' #' + s);
    // the cursor goes to a line with text (in a view, empty lines between paragraphs are hidden and the writer cannot get there)
    if (rnd() < 0.25){ const c = 14 + Math.floor(rnd() * (cm.lineCount() - 14)); if (cm.getLine(c).trim()) cm.setCursor({line:c, ch:0}); }
    // an edit can leave the cursor on an empty line, which a view hides (the editor then moves it on, as it always has):
    // the checks start from a line with text
    { let c = cm.getCursor().line; if (!cm.getLine(c).trim()){ let k = c; while (k < cm.lastLine() && !cm.getLine(k).trim()) k++; cm.setCursor({line:k, ch:0}); } }
    { const v = cm.smView(); checks++; if (v.cur !== v.fresh){ fails++; if (fails < 6) console.log('FAIL hidden runs after ' + label + ' #' + s + '\n  cur   ' + v.cur.slice(0, 200) + '\n  fresh ' + v.fresh.slice(0, 200)); } }
    { const x = cm.smIndex(); checks++; if (x.cue !== x.cueFull || x.slug !== x.slugFull){ fails++; if (fails < 6) console.log('FAIL index after ' + label + ' #' + s); } }
    { const c = cm.smClasses(); checks++;
      if (c.cmdInc !== c.cmdFull){ fails++; if (fails < 6) console.log('FAIL commands after ' + label + ' #' + s + ' inc ' + c.cmdInc + ' full ' + c.cmdFull); }
      for (let i = 0; i < c.full.length; i++) if (c.inc[i] !== c.full[i]){ fails++; if (fails < 6) console.log('FAIL classes after ' + label + ' #' + s + ' line ' + i + ': ' + JSON.stringify(cm.getLine(i)) + ' inc ' + c.inc[i] + ' full ' + c.full[i]); break; } }
    if (s % 50 === 0) await sleep(40);
  }
  console.log((fails ? fails + ' failed' : 'all passed') + ' (' + checks + ' checks, ' + pages0 + ' pages at the start, ' + cm.smPages().fulls + ' full counts)');
  process.exit(fails ? 1 : 0);
}, 150);
