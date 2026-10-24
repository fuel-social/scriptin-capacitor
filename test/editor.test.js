// Simulated typing in a jsdom CodeMirror: completion, Tab, Reformat. Run with: npm test
const fs = require('fs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><div id="box"><div id="sm-editor"></div></div>', { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://fuel.social/version-test/scriptin' });
const w = dom.window;
Object.defineProperty(w.HTMLElement.prototype, 'clientHeight', { get(){ return 3000; } });
Object.defineProperty(w.HTMLElement.prototype, 'clientWidth', { get(){ return 720; } });
w.document.createRange = () => ({ setEnd(){}, setStart(){}, getBoundingClientRect(){ return {top:0,bottom:0,left:0,right:0,height:0,width:0}; }, getClientRects(){ return { length: 0, item(){ return null; } }; } });
w.HTMLElement.prototype.getClientRects = function(){ return { length: 0, item(){ return null; } }; };
const nm = require('path').join(__dirname, '..', 'node_modules', 'codemirror') + '/';
w.eval(fs.readFileSync(nm + 'lib/codemirror.js', 'utf8'));
w.eval(fs.readFileSync(nm + 'addon/selection/mark-selection.js', 'utf8'));
w.__smMarkSelection = 1;
// Capture the editor instance
const Orig = w.CodeMirror; let cm;
w.CodeMirror = Object.assign(function(){ cm = Orig.apply(this, arguments); return cm; }, Orig);
w.CodeMirror.prototype = Orig.prototype;
w.eval(fs.readFileSync(require('path').join(__dirname, '..', 'capacitor.js'), 'utf8'));
setTimeout(main, 100);
function main(){
if (!cm) { console.log('no editor'); process.exit(1); }
cm.state.focused = true;
const inp = cm.display.input;
function type(str){
  for (const ch of str){
    cm.state.focused = true;
    inp.reset();
    const ta = inp.textarea;
    ta.value = ch; ta.selectionStart = ta.selectionEnd = 1;
    inp.poll();
  }
}
function key(name, code){ cm.triggerOnKeyDown({ type:'keydown', keyCode: code, key: name, preventDefault(){}, stopPropagation(){} }); }
const tab = () => key('Tab', 9), right = () => key('ArrowRight', 39);
function state(){
  const c = cm.getCursor(), sel = cm.getSelection();
  return JSON.stringify(cm.getLine(c.line)) + ' cursor ' + c.line + ':' + c.ch + (sel ? ' selected ' + JSON.stringify(sel) : '');
}
let fails = 0;
function check(label, want){ const got = state(); const ok = got === want; if (!ok) fails++; console.log((ok ? 'ok   ' : 'FAIL ') + label + ' -> ' + got + (ok ? '' : '   wanted ' + want)); }
function start(text){ cm.setValue(text); cm.setCursor({line: cm.lastLine(), ch: cm.getLine(cm.lastLine()).length}); }

const base = '.i HOUSE - LIVING ROOM - DAY\n\nAction.\n\n.e GARDEN - NIGHT\n\nMore.\n\n';
// First DAY is never completed: only GARDEN and HOUSE as locations, times DAY and NIGHT
start('.i HOUSE\n\nAction.\n\n'); type('.id'); check('no time words in script yet, d stays d', '".i d" cursor 4:4');
start(base); type('.ih'); check('h completes house (typed lowercase)', '".i HOUSE" cursor 8:4 selected "OUSE"');
tab(); check('Tab after location stays on the line', '".i HOUSE" cursor 8:8');
type(' - l'); check('l completes living room under HOUSE', '".i HOUSE - LIVING ROOM" cursor 8:12 selected "IVING ROOM"');
right(); check('Right arrow keeps it', '".i HOUSE - LIVING ROOM" cursor 8:22');
type(' - d'); check('d completes day (only time with D)', '".i HOUSE - LIVING ROOM - DAY" cursor 8:26 selected "AY"');
tab(); check('Tab after time moves on to action', '"" cursor 10:0');
start(base); type('.iH'); check('typed capital keeps stored case', '".i HOUSE" cursor 8:4 selected "OUSE"');
start(base); type('.il'); check('L at the start offers only first segments', '".i l" cursor 8:4');
start(base); type('.egx'); check('typing overwrites the completion', '".e Gx" cursor 8:5');
start(base); type('.egarden'); check('typing the whole word leaves it as typed', '".e GARDEN" cursor 8:9');
type(' - n'); check('n completes night', '".e GARDEN - NIGHT" cursor 8:13 selected "IGHT"');
start(base); type('.ihouse - k'); check('unknown room, nothing', '".i HOUSE - k" cursor 8:12');
start(base); type('.ioffice - d'); check('time words come from the whole script', '".i office - DAY" cursor 8:13 selected "AY"');
start(base + '.i HOUSE - DUSK\n\nX.\n\n'); type('.ihouse - d'); check('DAY and DUSK used, d ambiguous', '".i HOUSE - d" cursor 12:12');
type('u'); check('du completes dusk', '".i HOUSE - DUSK" cursor 12:13 selected "SK"');
start(base); type('.ihouse - day - x'); check('nothing after the time', '".i HOUSE - DAY - x" cursor 8:18');
start('.i HOUSE - SAME\n\n.i HOUSE - SAME TIME\n\n'); type('.ihouse - same'); check('SAME and SAME TIME, same stays', '".i HOUSE - same" cursor 4:15');
type(' '); check('same + space completes same time', '".i HOUSE - SAME TIME" cursor 4:16 selected "TIME"');
start('.i TWENTY-ONE CLUB - DAY\n\n'); type('.it'); check('hyphen inside a word is not a separator', '".i TWENTY-ONE CLUB" cursor 2:4 selected "WENTY-ONE CLUB"');
start('.i HOUSE - DAY (FLASHBACK)\n\n'); type('.ex - d'); check('completion stops at the time word', '".e x - DAY" cursor 2:8 selected "AY"');
start('.i HOUSE – DAY\n\n'); type('.ex -d'); check('en dash and missing space still separate', '".e x -DAY" cursor 2:7 selected "AY"');
start('.i HOUSE - DAY\n\nThe house is old.\n\n'); type('h'); check('action lines are not completed', '"h" cursor 4:1');
start('.i HOUSE - DAY\n\n,ANNA,\nHi.\n\n'); type(',a'); check('cue completion unchanged', '",ANNA," cursor 5:2 selected "NNA"');
start('.i HOUSE - DAY\n\n'); type('.ieh'); check('.ie sluglines complete too', '".ie HOUSE" cursor 2:5 selected "OUSE"');
start('.i HOUSE - DAY\n\n'); type('.ih'); tab(); tab(); check('second Tab goes to action', '"" cursor 4:0');
start('.i HOUSE - DAY\n\n,anna,\nHi.\n\n'); type(',a'); check('cue from lowercase name completes in capitals', '",ANNA," cursor 5:2 selected "NNA"');
start('.i house - day\n\n'); type('.eh'); check('slugline from lowercase completes in capitals', '".e HOUSE" cursor 2:4 selected "OUSE"');
start('.i HOUSE - DAY\n\n,JOHN,\nHi.\n\n,JO,\nYes.\n\n'); type(',joh'); type('n'); check('name typed to the end ends in capitals', '",JOHN," cursor 8:5');

function reformatAll(){ cm.triggerOnKeyDown({ type:'keydown', keyCode:13, key:'Enter', ctrlKey:true, shiftKey:true, preventDefault(){}, stopPropagation(){} }); }
function rf(label, text, want){ cm.setValue(text); cm.setCursor({line:0, ch:0}); reformatAll(); const got = cm.getValue(); const ok = got === want; if (!ok) fails++; console.log((ok ? 'ok   ' : 'FAIL ') + label + ' -> ' + JSON.stringify(got) + (ok ? '' : '   wanted ' + JSON.stringify(want))); }
const N = '–', M = '—';
rf('majority en dash wins', '.i a - b\n\n.i c '+N+' d\n\n.i e '+N+' f\n\n.e g - h '+N+' i '+N+' day', '.I A '+N+' B\n\n.I C '+N+' D\n\n.I E '+N+' F\n\n.E G '+N+' H '+N+' I '+N+' DAY');
rf('majority hyphen wins, spacing fixed', '.i a'+M+' b\n\n.i c -d\n\n.i e  -  f', '.I A - B\n\n.I C - D\n\n.I E - F');
rf('tie goes to the dash used first', '.i a '+M+' b\n\n.i c - d', '.I A '+M+' B\n\n.I C '+M+' D');
rf('hyphen inside a word untouched', '.i twenty-one '+N+' day\n\n.i x '+N+' y', '.I TWENTY-ONE '+N+' DAY\n\n.I X '+N+' Y');
rf('dashes outside sluglines untouched', '.i a '+N+' b\n\nShe waits - then '+M+' runs.\n\n,ANNA,\nNo - never.', '.I A '+N+' B\n\nShe waits - then '+M+' runs.\n\n,ANNA,\nNo - never.');
rf('no separators, nothing changes', '.i house\n\nAction.', '.I HOUSE\n\nAction.');

// Enter: a new paragraph after sluglines, actions and dialogue; a plain new line in cues, parentheticals and mid-line
const enter = () => key('Enter', 13), shiftEnter = () => cm.triggerOnKeyDown({ type:'keydown', keyCode:13, key:'Enter', shiftKey:true, preventDefault(){}, stopPropagation(){} });
function doc(label, want){ const got = cm.getValue() + ' @' + cm.getCursor().line + ':' + cm.getCursor().ch; const ok = got === want; if (!ok) fails++; console.log((ok ? 'ok   ' : 'FAIL ') + label + ' -> ' + JSON.stringify(got) + (ok ? '' : '   wanted ' + JSON.stringify(want))); }
start('.i HOUSE - DAY'); enter(); doc('Enter after a slugline: new paragraph', '.i HOUSE - DAY\n\n @2:0');
start('She waits.'); enter(); doc('Enter after an action: new paragraph', 'She waits.\n\n @2:0');
start(',ANNA,\nHi.'); enter(); doc('Enter after dialogue: new paragraph', ',ANNA,\nHi.\n\n @3:0');
start(',ANNA,'); enter(); doc('Enter at the end of a cue: dialogue line', ',ANNA,\n @1:0');
start(',ANNA,\n(quiet)'); enter(); doc('Enter after a parenthetical: new dialogue line', ',ANNA,\n(quiet)\n @2:0');
start('She waits.\nThen goes.'); cm.setCursor({line:0, ch:10}); enter(); doc('Enter between two lines of a paragraph: separated on both sides', 'She waits.\n\n\n\nThen goes. @2:0');
start('She waits.'); cm.setCursor({line:0, ch:3}); enter(); doc('Enter in the middle of a line: plain new line', 'She\nwaits. @1:0');
start('She waits.'); shiftEnter(); doc('Shift+Enter: plain new line', 'She waits.\n @1:0');
start('// a note'); enter(); doc('Enter in a note: plain new line', '// a note\n @1:0');

// Spacing does not jump: Enter after dialogue above a slugline gives one empty line before the new paragraph and two before the slugline
{
  cm.setValue(',JOHN,\nhey.\n\n.e STREET - NIGHT'); cm.setCursor({line:1, ch:4}); enter();
  const w = cm.getLineHandle(2).wrapClass || '', w3 = cm.getLineHandle(4).wrapClass || '';
  const ok = cm.getCursor().line === 3 && !/sm-sp2/.test(w) && /sm-sp2/.test(w3);
  if (!ok) fails++; console.log((ok ? 'ok   ' : 'FAIL ') + 'Enter above a slugline: double space stays above the slugline (' + JSON.stringify([w, w3]) + ')');
  cm.setValue('Action.\n\n.e STREET - NIGHT'); cm.setCursor({line:1, ch:0});
  const ok2 = /sm-sp2/.test(cm.getLineHandle(1).wrapClass || '');
  if (!ok2) fails++; console.log((ok2 ? 'ok   ' : 'FAIL ') + 'cursor on the single empty line above a slugline keeps the double space');
}

{
  cm.setValue(',JOHN,\nhey.\n\n.e STREET - NIGHT'); cm.setCursor({line:1, ch:4}); enter();
  cm.triggerOnKeyDown({ type:'keydown', keyCode:8, key:'Backspace', preventDefault(){}, stopPropagation(){} });
  doc('Backspace after Enter returns to the end of the line above', ',JOHN,\nhey.\n\n.e STREET - NIGHT @1:4');
  cm.setValue('One.\nTwo.'); cm.setCursor({line:0, ch:4}); enter();
  cm.triggerOnKeyDown({ type:'keydown', keyCode:8, key:'Backspace', preventDefault(){}, stopPropagation(){} });
  doc('Backspace after Enter between two lines leaves two paragraphs (Cmd+Z restores one)', 'One.\n\nTwo. @0:4');
  cm.setValue('One.\n\nTwo.'); cm.setCursor({line:1, ch:0});
  cm.triggerOnKeyDown({ type:'keydown', keyCode:8, key:'Backspace', preventDefault(){}, stopPropagation(){} });
  doc('Backspace on a single empty line is a normal backspace', 'One.\nTwo. @0:4');
}

// Enter in a cue works like Tab: on to the dialogue line, completion kept, missing comma added
start(',JOHN,'); cm.setCursor({line:0, ch:5}); enter(); doc('Enter between name and closing comma goes to the dialogue line', ',JOHN,\n @1:0');
start(',JOHN'); enter(); doc('Enter after a name without closing comma adds it', ',JOHN,\n @1:0');
start('.i HOUSE - DAY\n\n,ANNA,\nHi.\n\n'); type(',a'); enter(); doc('Enter accepts a completed name', '.i HOUSE - DAY\n\n,ANNA,\nHi.\n\n,ANNA,\n @6:0');
start(',TOM (v.o,'); cm.setCursor({line:0, ch:9}); enter(); doc('Enter in an extension closes the bracket', ',TOM (v.o),\n @1:0');

start(',JANE,\nHi.\n(asda)'); cm.setCursor({line:2, ch:5}); enter(); doc('Enter inside a parenthetical: new dialogue line below', ',JANE,\nHi.\n(asda)\n @3:0');
start(',JANE,\n(asda'); enter(); doc('Enter in an unclosed parenthetical closes it', ',JANE,\n(asda)\n @2:0');
start(',JANE,\n(asda)\nHi.'); cm.setCursor({line:1, ch:2}); enter(); doc('Enter in a parenthetical with dialogue below moves there', ',JANE,\n(asda)\nHi. @2:0');
start(',JANE,\n(asda)'); enter(); enter(); doc('Enter twice after a parenthetical starts a new paragraph', ',JANE,\n(asda)\n\n @3:0');

// Option+Shift+Up/Down select whole paragraphs
{
  const ak = (code, shift) => cm.triggerOnKeyDown({ type:'keydown', keyCode:code, altKey:true, shiftKey:!!shift, preventDefault(){}, stopPropagation(){} });
  const sel = () => JSON.stringify(cm.getSelection()) + ' @' + cm.getCursor('head').line + ':' + cm.getCursor('head').ch;
  function chk(label, want){ const got = sel(); const ok = got === want; if (!ok) fails++; console.log((ok ? 'ok   ' : 'FAIL ') + label + ' -> ' + got + (ok ? '' : '   wanted ' + want)); }
  cm.setValue('One two.\nThree.\n\n,ANNA,\nHi.\n\nEnd.');
  cm.setCursor({line:0, ch:0}); ak(40, true); chk('Option+Shift+Down selects the paragraph', '"One two.\\nThree." @1:6');
  ak(40, true); chk('again extends to the next paragraph', '"One two.\\nThree.\\n\\n,ANNA,\\nHi." @4:3');
  ak(38, true); chk('Option+Shift+Up goes back to its start', '"One two.\\nThree.\\n\\n" @3:0');
  cm.setCursor({line:4, ch:1}); ak(38, true); chk('from inside a paragraph to its start', '",ANNA,\\nH" @3:0');
  cm.setCursor({line:0, ch:3}); ak(40); chk('Option+Down moves to the paragraph end', '"" @1:6');
  ak(40); chk('again to the end of the next one', '"" @4:3');
}

// Title page: Cmd+Option+9 (here Ctrl+Shift+9) shows it, the first time as the bare commands between two ---; again hides it
{
  const k9 = () => cm.triggerOnKeyDown({ type:'keydown', keyCode:57, key:'9', ctrlKey:true, shiftKey:true, preventDefault(){}, stopPropagation(){} });
  start('Action.'); k9();
  doc('Cmd+Option+9 shows the title page commands at the top', '---\n\nTitle: \n\nAuthor: \n\n---\n\nAction. @2:7');
  type('Night'); tab(); doc('Tab goes to the next command', '---\n\nTitle: Night\n\nAuthor: \n\n---\n\nAction. @4:8');
  tab(); doc('Tab stays on the last command', '---\n\nTitle: Night\n\nAuthor: \n\n---\n\nAction. @4:8');
  type('Fabrizio'); shiftEnter(); type('Peter'); doc('Shift+Enter adds a second line to the command', '---\n\nTitle: Night\n\nAuthor: Fabrizio\nPeter\n\n---\n\nAction. @5:5');
  enter(); type('Background: x'); doc('Enter after the last command starts a new command above the closing ---', '---\n\nTitle: Night\n\nAuthor: Fabrizio\nPeter\n\nBackground: x\n\n---\n\nAction. @7:13');
  k9();
  const hidden = [0,1,2,3,4,5,6,7,8,9,10].every(i => /sm-gone/.test(cm.getLineHandle(i).wrapClass || ''));
  const ok = hidden && cm.getCursor().line === 11;
  if (!ok) fails++; console.log((ok ? 'ok   ' : 'FAIL ') + 'pressed again: hidden without any height, cursor below it');
  cm.setCursor({line:0, ch:0});
  { const ok2 = cm.getCursor().line === 11; if (!ok2) fails++; console.log((ok2 ? 'ok   ' : 'FAIL ') + 'the cursor cannot enter the hidden title page'); }
  k9(); doc('shown again with what was typed, no second template', '---\n\nTitle: Night\n\nAuthor: Fabrizio\nPeter\n\nBackground: x\n\n---\n\nAction. @2:12');
  k9();
}
{
  const k9 = () => cm.triggerOnKeyDown({ type:'keydown', keyCode:57, key:'9', ctrlKey:true, shiftKey:true, preventDefault(){}, stopPropagation(){} });
  start('.i HOUSE - DAY\n\nAction.'); k9();
  const sp = cm.getLineHandle(7).wrapClass || '';
  { const ok = !/sm-sp2/.test(sp); if (!ok) fails++; console.log((ok ? 'ok   ' : 'FAIL ') + 'one empty line between title page and slugline'); }
  k9(); cm.setCursor({line:8, ch:0});
  cm.triggerOnKeyDown({ type:'keydown', keyCode:8, key:'Backspace', preventDefault(){}, stopPropagation(){} });
  doc('Backspace never joins a slugline to the hidden title page', '---\n\nTitle: \n\nAuthor: \n\n---\n\n.i HOUSE - DAY\n\nAction. @8:0');
  start('Background: she grew up here.\n\n.i HOUSE - DAY\n\nAction.');
  { const ok = !cm.getAllMarks().length && !/sm-t-note/.test(cm.getLineHandle(0).textClass || ''); if (!ok) fails++; console.log((ok ? 'ok   ' : 'FAIL ') + 'Background: in the script is plain action'); }
}

{
  const k9 = () => cm.triggerOnKeyDown({ type:'keydown', keyCode:57, key:'9', ctrlKey:true, shiftKey:true, preventDefault(){}, stopPropagation(){} });
  // a script opens with the cursor on line 0: the hidden title page stays hidden all of it
  cm.setValue('---\nTitle: A\n\nAuthor: B\n---\n\n.i HOUSE - DAY\n\nAction.'); cm.setCursor({line:0, ch:0});
  k9(); k9();
  cm.setValue('---\nTitle: A\n\nAuthor: B\n---\n\n.i HOUSE - DAY\n\nAction.'); cm.setCursor({line:0, ch:0});
  cm.triggerOnKeyDown({ type:'keydown', keyCode:57, key:'9', ctrlKey:true, shiftKey:true, preventDefault(){}, stopPropagation(){} });
  cm.triggerOnKeyDown({ type:'keydown', keyCode:57, key:'9', ctrlKey:true, shiftKey:true, preventDefault(){}, stopPropagation(){} });
  const gone = [0,1,2,3,4,5,6].every(i => /sm-gone/.test(cm.getLineHandle(i).wrapClass || ''));
  { const ok = gone; if (!ok) fails++; console.log((ok ? 'ok   ' : 'FAIL ') + 'hidden title page hides all its lines, cursor or not'); }
  doc('showing adds the empty lines after and before ---', '---\n\nTitle: A\n\nAuthor: B\n\n---\n\n.i HOUSE - DAY\n\nAction. @8:0');
}

// Page cap: three A4 pages hold 87 one line actions (29 per page); a 4th page is refused, typing within page 3 works
const full = Array.from({length:87}, (_, i) => 'Line ' + i + '.').join('\n\n');
cm.setValue(full); const endPos = () => ({line: cm.lastLine(), ch: cm.getLine(cm.lastLine()).length});
cm.replaceRange('\n\nOne more.', endPos(), endPos(), '+input');
{ const ok = cm.getValue() === full; if (!ok) fails++; console.log((ok ? 'ok   ' : 'FAIL ') + 'a fourth page is refused'); }
cm.replaceRange(' Yes.', endPos(), endPos(), '+input');
{ const ok = cm.getValue() === full + ' Yes.'; if (!ok) fails++; console.log((ok ? 'ok   ' : 'FAIL ') + 'typing that stays on page 3 works'); }
cm.setValue(full + '\n\nOne more.');
{ const ok = cm.getValue().endsWith('One more.'); if (!ok) fails++; console.log((ok ? 'ok   ' : 'FAIL ') + 'a loaded longer script is kept'); }
console.log(fails ? fails + ' failed' : 'all passed');
process.exit(fails ? 1 : 0); // jsdom keeps timers alive, so exit explicitly
}
