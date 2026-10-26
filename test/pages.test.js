// Performance check: a 500+ page script in a jsdom CodeMirror; time per keystroke for our own code.
// Run with: node test/bench.js   (BENCH_SCENES to change the size)
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><div id="box"><div id="sm-editor"></div></div>', { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://fuel.social/version-test/scriptin' });
const w = dom.window;
Object.defineProperty(w.HTMLElement.prototype, 'clientHeight', { get(){ return 3000; } });
Object.defineProperty(w.HTMLElement.prototype, 'clientWidth', { get(){ return 720; } });
w.document.createRange = () => ({ setEnd(){}, setStart(){}, getBoundingClientRect(){ return {top:0,bottom:0,left:0,right:0,height:0,width:0}; }, getClientRects(){ return { length: 0, item(){ return null; } }; } });
w.HTMLElement.prototype.getClientRects = function(){ return { length: 0, item(){ return null; } }; };
w.scrollTo = () => {}; w.document.elementFromPoint = () => null; w.HTMLElement.prototype.scrollIntoView = function(){}; w.document.elementFromPoint = () => null; w.HTMLElement.prototype.scrollIntoView = function(){};
const nm = path.join(__dirname, '..', 'node_modules', 'codemirror') + '/';
w.eval(fs.readFileSync(nm + 'lib/codemirror.js', 'utf8'));
w.eval(fs.readFileSync(nm + 'addon/selection/mark-selection.js', 'utf8'));
w.__smMarkSelection = 1;
const Orig = w.CodeMirror; let cm;
w.CodeMirror = Object.assign(function(){ cm = Orig.apply(this, arguments); return cm; }, Orig);
w.CodeMirror.prototype = Orig.prototype;
w.eval(fs.readFileSync(path.join(__dirname, '..', 'capacitor.js'), 'utf8'));
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
  if (r < 0.55){ let d = ',' + pick(['ANNA', 'BEN', 'MARA']) + ',\n'; const k = 1 + Math.floor(rnd() * 6); for (let i = 0; i < k; i++) d += (rnd() < 0.2 ? '(' + pick(['quietly', 'beat', 'to Ben']) + ')' : pick(SENT) + ' ' + pick(SENT)) + (i < k - 1 ? '\n' : ''); return d; }
  let a = ''; const k = 1 + Math.floor(rnd() * 5); for (let i = 0; i < k; i++) a += pick(SENT) + ' '; return a.trim();
}
const head = '---\n\n//TITLE PAGE\nTitle: Pages\nAuthor: Test\n\n//SETTINGS\nPage size: A4\nLanguage: English\nAutocomplete: On\nMode: Day\n\n---';
setTimeout(async function(){
  let fails = 0, steps = +(process.env.PAGES_STEPS || 600), checks = 0;
  const ps = [head]; for (let i = 0; i < 600; i++) ps.push(para());
  cm.setValue(ps.join('\n\n')); await sleep(50);
  const pages0 = cm.smPages().full.length + 1;
  function same(label){
    const p = cm.smPages(), a = JSON.stringify(p.inc.map(x => [x.line, x.ch])), b = JSON.stringify(p.full.map(x => [x.line, x.ch]));
    checks++;
    if (a !== b){ fails++; if (fails < 6) console.log('FAIL ' + label + '\n  inc  ' + a.slice(0, 300) + '\n  full ' + b.slice(0, 300)); }
  }
  same('start');
  for (let s = 0; s < steps; s++){
    const n = cm.lineCount(), ln = 14 + Math.floor(rnd() * (n - 14)), L = cm.getLine(ln), ch = Math.floor(rnd() * (L.length + 1)), r = rnd();
    let label;
    if (r < 0.3){ cm.replaceRange(pick(['x', ' ', 'word ', '.', 'A longer phrase that wraps the line further. ']), {line:ln, ch}, null, '+input'); label = 'type'; }
    else if (r < 0.45){ cm.replaceRange('\n', {line:ln, ch}, null, '+input'); label = 'newline'; }
    else if (r < 0.6){ if (ch > 0) cm.replaceRange('', {line:ln, ch:ch - 1}, {line:ln, ch}, '+delete'); else if (ln > 14) cm.replaceRange('', {line:ln - 1, ch:cm.getLine(ln - 1).length}, {line:ln, ch:0}, '+delete'); label = 'delete'; }
    else if (r < 0.7){ const e = Math.min(cm.lastLine(), ln + 1 + Math.floor(rnd() * 8)); cm.replaceRange('', {line:ln, ch:0}, {line:e, ch:0}, '+delete'); label = 'delete lines'; }
    else if (r < 0.82){ cm.replaceRange('\n\n' + para() + '\n\n' + para(), {line:ln, ch:L.length}, null, 'paste'); label = 'paste'; }
    else if (r < 0.9){ cm.operation(() => { cm.replaceRange('two ', {line:ln, ch}, null, '+input'); const l2 = 14 + Math.floor(rnd() * (cm.lineCount() - 14)); cm.replaceRange('\n', {line:l2, ch:0}, null, '+input'); }); label = 'two changes in one go'; }
    else if (r < 0.95){ cm.replaceRange('x', {line:3, ch:cm.getLine(3).length}, null, '+input'); label = 'title page'; }
    else { cm.execCommand(rnd() < 0.7 ? 'undo' : 'redo'); label = 'undo/redo'; }
    same(label + ' #' + s);
    if (rnd() < 0.25) cm.setCursor({line:14 + Math.floor(rnd() * (cm.lineCount() - 14)), ch:0});
    { const c = cm.smClasses(); checks++;
      for (let i = 0; i < c.full.length; i++) if (c.inc[i] !== c.full[i]){ fails++; if (fails < 6) console.log('FAIL classes after ' + label + ' #' + s + ' line ' + i + ': ' + JSON.stringify(cm.getLine(i)) + ' inc ' + c.inc[i] + ' full ' + c.full[i]); break; } }
    if (s % 50 === 0) await sleep(40);
  }
  console.log((fails ? fails + ' failed' : 'all passed') + ' (' + checks + ' checks, ' + pages0 + ' pages at the start, ' + cm.smPages().fulls + ' full counts)');
  process.exit(fails ? 1 : 0);
}, 150);
