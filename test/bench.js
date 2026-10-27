// Performance check: a 500+ page script in a jsdom CodeMirror; per keystroke the longest blocking piece of work
// (the key handling, or the longest task after it), in ms, jsdom and CodeMirror included (BENCH_PLAIN: CodeMirror alone).
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
if (process.env.BENCH_PLAIN) { w.CodeMirror(w.document.getElementById('sm-editor'), {lineWrapping:true, viewportMargin:Infinity}); } else w.eval(fs.readFileSync(path.join(__dirname, '..', 'capacitor.js'), 'utf8'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
// Every task the page runs is timed: what blocks a keystroke is the key handling itself and the longest task after it
// (the deferred redraw or one step of the page count), not the sum of all small steps between keystrokes
let longest = 0;
const wst = w.setTimeout.bind(w);
w.setTimeout = function(f, ms){ const a = [].slice.call(arguments, 2); return wst(function(){ const t0 = process.hrtime.bigint(); try { f.apply(null, a); } finally { const d = Number(process.hrtime.bigint() - t0) / 1e6; if (d > longest) longest = d; } }, ms); };
function script(n){
  const out = ['---\n\n//TITLE PAGE\nTitle: Bench\nAuthor: Test\n\n//SETTINGS\nPage size: A4\nLanguage: English\nAutocomplete: On\nMode: Day\n\n---'];
  for (let s = 0; s < n; s++) out.push('.i HOUSE ' + s + ' - DAY\n\nShe waits for the call number ' + s + ' and looks out of the window for a long while, thinking about _nothing_ at all.\n\n,ANNA,\nWhere is it? I left it here this morning, I am *sure* of it.\n\n,BEN,\n(quietly)\nMaybe it fell behind the desk. Look again.\n\nShe kneels and searches.\n\n// a note');
  return out.join('\n\n');
}
setTimeout(async function(){
  const inp = cm.display.input;
  function type(ch){ cm.state.focused = true; inp.reset(); const ta = inp.textarea; ta.value = ch; ta.selectionStart = ta.selectionEnd = 1; inp.poll(); }
  const N = +(process.env.BENCH_SCENES || 1700), text = script(N);
  let t = process.hrtime.bigint();
  cm.setValue(text); await sleep(60);
  const load = Number(process.hrtime.bigint() - t) / 1e6;
  const pages = w.document.querySelectorAll('.sm-pagenum').length + 1;
  // with BENCH_PLAIN a bare CodeMirror with the same text: what CodeMirror and jsdom cost alone
  // typing in the middle of the script, then at its end: our code's cpu time per keystroke, the deferred refresh included
  async function keys(line, n){
    cm.setCursor({line, ch:cm.getLine(line).length});
    const times = [];
    for (let k = 0; k < n; k++){
      longest = 0; const t0 = process.hrtime.bigint(); type('x'); const sync = Number(process.hrtime.bigint() - t0) / 1e6; await sleep(45);
      times.push(Math.max(sync, longest));
    }
    times.sort((a, b) => a - b);
    return {median:+times[n >> 1].toFixed(1), max:+times[n - 1].toFixed(1)};
  }
  const mid = Math.floor(cm.lineCount() / 2); let ml = mid; while (!/^She waits/.test(cm.getLine(ml))) ml++;
  const K = +(process.env.BENCH_KEYS || 15), r1 = await keys(ml, K), r2 = await keys(cm.lineCount() - 1, K);
  // other keystrokes in the middle of the script: Enter after action, a new cue with name completion, a slugline with
  // location completion, Tab
  function keyDown(name, code){ cm.triggerOnKeyDown({ type:'keydown', keyCode:code, key:name, preventDefault(){}, stopPropagation(){} }); }
  async function op(label, setup, act, n){
    const times = [];
    for (let k = 0; k < n; k++){
      setup(k); await sleep(45);
      longest = 0; const t0 = process.hrtime.bigint(); act(k); const sync = Number(process.hrtime.bigint() - t0) / 1e6; await sleep(45);
      times.push(Math.max(sync, longest));
    }
    times.sort((a, b) => a - b);
    return {median:+times[n >> 1].toFixed(1), max:+times[n - 1].toFixed(1)};
  }
  const at = () => { let l = ml; while (!/^She kneels/.test(cm.getLine(l))) l++; return l; };
  const ONLY = process.env.BENCH_ONLY || '', R = +(process.env.BENCH_REPS || 10), skip = {median:0, max:0};
  const enter = ONLY && ONLY !== 'enter' ? skip : await op('enter', () => { const l = at(); cm.setCursor({line:l, ch:cm.getLine(l).length}); }, () => keyDown('Enter', 13), R);
  const cue = ONLY && ONLY !== 'cue' ? skip : await op('cue', () => { const l = at(); cm.setCursor({line:l, ch:cm.getLine(l).length}); keyDown('Enter', 13); }, () => { type(','); type('a'); }, R);
  const slug = ONLY && ONLY !== 'slug' ? skip : await op('slug', () => { const l = at(); cm.setCursor({line:l, ch:cm.getLine(l).length}); keyDown('Enter', 13); type('.'); type('i'); }, () => type('h'), R);
  const tab = ONLY && ONLY !== 'tab' ? skip : await op('tab', () => { const l = at(); cm.setCursor({line:l, ch:cm.getLine(l).length}); }, () => keyDown('Tab', 9), R);
  console.log(JSON.stringify({scenes:N, lines:cm.lineCount(), pages, loadMs:Math.round(load), middle:r1, end:r2, enter, cue, slug, tab}));
  process.exit(0);
}, 150);
