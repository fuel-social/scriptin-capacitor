// Performance check: a 500+ page script in a jsdom CodeMirror; per keystroke the longest blocking piece of work
// (the key handling, or the longest task after it), in ms, jsdom and CodeMirror included (BENCH_PLAIN: CodeMirror alone).
// Run with: node test/bench.js   (BENCH_SCENES to change the size)
const path = require('path');
let { w, cm } = require('./harness')();
if (process.env.BENCH_PLAIN){
  // CodeMirror 6 alone with the same text: what it and jsdom cost without the editor logic
  const fs = require('fs'), esb = require('esbuild');
  const code = esb.buildSync({stdin:{contents:"import {createEditor} from './src/cm6compat.js'; window.__plain = createEditor(document.getElementById('sm-editor'), {});", resolveDir:path.join(__dirname, '..')}, bundle:true, format:'iife', write:false}).outputFiles[0].text;
  w.eval(code); cm = w.__plain;
}
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
  function type(ch){ cm.typeText(ch); }
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
  // typing inside view 3 (dialogue only) and the switch into it
  const k3 = () => cm.triggerOnKeyDown({ type:'keydown', keyCode:51, key:'3', ctrlKey:true, shiftKey:true, preventDefault(){}, stopPropagation(){} });
  const k1 = () => cm.triggerOnKeyDown({ type:'keydown', keyCode:49, key:'1', ctrlKey:true, shiftKey:true, preventDefault(){}, stopPropagation(){} });
  const dl = () => { let l = ml; while (!/^Where is it/.test(cm.getLine(l))) l++; return l; };
  const viewSwitch = ONLY && ONLY !== 'view' ? skip : await op('view', () => { k1(); cm.setCursor({line:dl(), ch:5}); }, () => k3(), Math.min(R, 5));
  const inView = ONLY && ONLY !== 'view' ? skip : await op('inview', () => { cm.setCursor({line:dl(), ch:cm.getLine(dl()).length}); }, () => type('y'), R);
  k1();
  // commands on the whole script: Reformat, notes off and on, title page shown and hidden
  const kk = (code, key) => () => cm.triggerOnKeyDown({ type:'keydown', keyCode:code, key, ctrlKey:true, shiftKey:true, preventDefault(){}, stopPropagation(){} });
  const reformat = ONLY && ONLY !== 'cmd' ? skip : await op('reformat', () => { cm.setCursor({line:ml, ch:3}); type('  x'); }, kk(13, 'Enter'), 3);
  const notes = ONLY && ONLY !== 'cmd' ? skip : await op('notes', () => {}, kk(54, '6'), 4);
  const title = ONLY && ONLY !== 'cmd' ? skip : await op('title', () => {}, kk(57, '9'), 4);
  console.log(JSON.stringify({reformat, notes, title}));
  console.log(JSON.stringify({scenes:N, lines:cm.lineCount(), pages, loadMs:Math.round(load), middle:r1, end:r2, enter, cue, slug, tab, viewSwitch, inView}));
  process.exit(0);
}, 150);
