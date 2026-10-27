// Simulated typing in a jsdom CodeMirror: completion, Tab, Reformat. Run with: npm test
const { w, cm } = require('./harness')();
setTimeout(main, 100);
function main(){
const type = cm.type;
function key(name, code){ cm.triggerOnKeyDown({ type:'keydown', keyCode: code, key: name, preventDefault(){}, stopPropagation(){} }); }
const tab = () => key('Tab', 9), right = () => key('ArrowRight', 39);
function state(){
  const c = cm.getCursor(), sel = cm.getSelection();
  return JSON.stringify(cm.getLine(c.line)) + ' cursor ' + c.line + ':' + c.ch + (sel ? ' selected ' + JSON.stringify(sel) : '');
}
let fails = 0;
function eq2(label, got, want){ const ok = got === want; if (!ok) fails++; console.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : ' -> ' + JSON.stringify(got) + '   wanted ' + JSON.stringify(want))); }
function check(label, want){ const got = state(); const ok = got === want; if (!ok) fails++; console.log((ok ? 'ok   ' : 'FAIL ') + label + ' -> ' + got + (ok ? '' : '   wanted ' + want)); }
function start(text){ cm.setValue(text); cm.setCursor({line: cm.lastLine(), ch: cm.getLine(cm.lastLine()).length}); }

const base = '.i HOUSE - LIVING ROOM - DAY\n\nAction.\n\n.e GARDEN - NIGHT\n\nMore.\n\n';
// First DAY is never completed: only GARDEN and HOUSE as locations, times DAY and NIGHT
start('.i HOUSE\n\nAction.\n\n'); type('.id'); check('no time words in script yet, d stays D (capitals while typing)', '".i D" cursor 4:4');
start(base); type('.ih'); check('h completes house (typed lowercase)', '".i HOUSE" cursor 8:4 selected "OUSE"');
tab(); check('Tab after location stays on the line', '".i HOUSE" cursor 8:8');
type(' - l'); check('l completes living room under HOUSE', '".i HOUSE - LIVING ROOM" cursor 8:12 selected "IVING ROOM"');
right(); check('Right arrow keeps it', '".i HOUSE - LIVING ROOM" cursor 8:22');
type(' - d'); check('d completes day (only time with D)', '".i HOUSE - LIVING ROOM - DAY" cursor 8:26 selected "AY"');
tab(); check('Tab after time moves on to action', '"" cursor 10:0');
start(base); type('.iH'); check('typed capital keeps stored case', '".i HOUSE" cursor 8:4 selected "OUSE"');
start(base); type('.il'); check('L at the start offers a location from any position', '".i LIVING ROOM" cursor 8:4 selected "IVING ROOM"');
start(base); type('.el'); check('EXT. offers INT. locations too', '".e LIVING ROOM" cursor 8:4 selected "IVING ROOM"');
start(base); type('.ih'); right(); type(' - h'); check('a location already on the line is not offered again', '".i HOUSE - H" cursor 8:12');
start(base); type('.in'); check('no time at the start', '".i N" cursor 8:4');
start(base); type('.egx'); check('typing overwrites the completion', '".e GX" cursor 8:5');
start(base); type('.egarden'); check('typing the whole word leaves it as typed', '".e GARDEN" cursor 8:9');
type(' - n'); check('n completes night', '".e GARDEN - NIGHT" cursor 8:13 selected "IGHT"');
start(base); type('.ihouse - k'); check('unknown room, nothing', '".i HOUSE - K" cursor 8:12');
start(base); type('.ioffice - d'); check('time words come from the whole script', '".i OFFICE - DAY" cursor 8:13 selected "AY"');
start(base + '.i HOUSE - DUSK\n\nX.\n\n'); type('.ihouse - d'); check('DAY and DUSK used, d ambiguous', '".i HOUSE - D" cursor 12:12');
type('u'); check('du completes dusk', '".i HOUSE - DUSK" cursor 12:13 selected "SK"');
start(base); type('.ihouse - day - x'); check('nothing after the time', '".i HOUSE - DAY - X" cursor 8:18');
start('.i HOUSE - SAME\n\n.i HOUSE - SAME TIME\n\n'); type('.ihouse - same'); check('SAME and SAME TIME, same stays', '".i HOUSE - SAME" cursor 4:15');
type(' '); check('same + space completes same time', '".i HOUSE - SAME TIME" cursor 4:16 selected "TIME"');
start('.i TWENTY-ONE CLUB - DAY\n\n'); type('.it'); check('hyphen inside a word is not a separator', '".i TWENTY-ONE CLUB" cursor 2:4 selected "WENTY-ONE CLUB"');
start('.i HOUSE - DAY (FLASHBACK)\n\n'); type('.ex - d'); check('completion stops at the time word', '".e X - DAY" cursor 2:8 selected "AY"');
start('.i HOUSE – DAY\n\n'); type('.ex -d'); check('en dash and missing space still separate', '".e X -DAY" cursor 2:7 selected "AY"');
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
rf('separators become en dashes', '.i a - b\n\n.i c '+N+' d\n\n.i e '+N+' f\n\n.e g - h '+N+' i '+N+' day', '.i A '+N+' B\n\n.i C '+N+' D\n\n.i E '+N+' F\n\n.e G '+N+' H '+N+' I '+N+' DAY');
rf('hyphens and em dashes become en dashes, spacing fixed', '.i a'+M+' b\n\n.i c -d\n\n.i e  -  f', '.i A '+N+' B\n\n.i C '+N+' D\n\n.i E '+N+' F');
rf('em dash and hyphen both become en dashes', '.i a '+M+' b\n\n.i c - d', '.i A '+N+' B\n\n.i C '+N+' D');
rf('hyphen inside a word untouched', '.i twenty-one '+N+' day\n\n.i x '+N+' y', '.i TWENTY-ONE '+N+' DAY\n\n.i X '+N+' Y');
rf('dashes outside sluglines untouched', '.i a '+N+' b\n\nShe waits - then '+M+' runs.\n\n,ANNA,\nNo - never.', '.i A '+N+' B\n\nShe waits - then '+M+' runs.\n\n,ANNA,\nNo - never.');
rf('no separators, nothing changes', '.i house\n\nAction.', '.i HOUSE\n\nAction.');

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
start('She waits.'); shiftEnter(); doc('Shift+Enter after action: new paragraph with an empty cue, cursor on the dialogue line', 'She waits.\n\n,,\n @3:0');
type('Wie gehts?'); shiftEnter(); doc('Shift+Enter after the dialogue: the next empty cue', 'She waits.\n\n,,\nWie gehts?\n\n,,\n @6:0');
start('.i HOUSE - DAY\n\nShe waits.'); cm.setCursor({line:0, ch:14}); shiftEnter(); doc('from a slugline, text below stays apart', '.i HOUSE - DAY\n\n,,\n\n\nShe waits. @3:0');
start('She waits.\n\n// a note'); shiftEnter(); doc('after a note too', 'She waits.\n\n// a note\n\n,,\n @5:0');
start('She waits.\n\n'); shiftEnter(); doc('on an empty paragraph line: the cue goes right there', 'She waits.\n\n,,\n @3:0');
start('She waits.'); cm.setCursor({line:0, ch:3}); shiftEnter(); doc('in the middle of a line: a plain new line', 'She\nwaits. @1:0');
start('She waits.'); cm.triggerOnKeyDown({ type:'keydown', keyCode:13, key:'Enter', altKey:true, preventDefault(){}, stopPropagation(){} }); doc('Option+Enter: plain new line', 'She waits.\n @1:0');
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
const TP = (t, a, size, lang, mode, auto) => '---\n\n//TITLE PAGE\nTitle: ' + t + '\nAuthor: ' + a + '\n\n//SETTINGS\nPage size: ' + (size || 'A4') + '\nLanguage: ' + (lang || 'English') + '\nAutocomplete: ' + (auto || 'On') + '\nMode: ' + (mode || 'Day') + '\n\n---';
{
  const k9 = () => cm.triggerOnKeyDown({ type:'keydown', keyCode:57, key:'9', ctrlKey:true, shiftKey:true, preventDefault(){}, stopPropagation(){} });
  start('Action.'); k9();
  doc('Cmd+Option+9 shows the title page with headings and settings, cursor after Title:', TP('', '') + '\n\nAction. @3:7');
  type('Night'); tab(); doc('Tab goes to the next command', TP('Night', '') + '\n\nAction. @4:8');
  type('Fabrizio'); shiftEnter(); type('Peter'); doc('Shift+Enter adds a second line to the command', TP('Night', 'Fabrizio\nPeter') + '\n\nAction. @5:5');
  tab(); doc('Tab skips the heading and goes to Page size', TP('Night', 'Fabrizio\nPeter') + '\n\nAction. @8:13');
  tab(); doc('Tab goes on to Language', TP('Night', 'Fabrizio\nPeter') + '\n\nAction. @9:17');
  tab(); doc('Tab goes on to Autocomplete', TP('Night', 'Fabrizio\nPeter') + '\n\nAction. @10:16');
  tab(); doc('Tab goes on to Mode', TP('Night', 'Fabrizio\nPeter') + '\n\nAction. @11:9');
  tab(); doc('Tab stays on the last command', TP('Night', 'Fabrizio\nPeter') + '\n\nAction. @11:9');
  enter(); type('Background: x'); doc('Enter after the last command starts a new command line right below', TP('Night', 'Fabrizio\nPeter', 'A4', 'English', 'Day\nBackground: x') + '\n\nAction. @12:13');
  k9();
  const hidden = [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15].every(i => /sm-gone/.test(cm.getLineHandle(i).wrapClass || ''));
  const ok = hidden && cm.getCursor().line === 16;
  if (!ok) fails++; console.log((ok ? 'ok   ' : 'FAIL ') + 'pressed again: hidden without any height, cursor below it');
  cm.setCursor({line:0, ch:0});
  { const ok2 = cm.getCursor().line === 16; if (!ok2) fails++; console.log((ok2 ? 'ok   ' : 'FAIL ') + 'the cursor cannot enter the hidden title page'); }
  k9(); doc('shown again with what was typed, no second template', TP('Night', 'Fabrizio\nPeter', 'A4', 'English', 'Day\nBackground: x') + '\n\nAction. @3:12');
  cm.setCursor({line:5, ch:2}); tab(); doc('Tab from a second line goes to the next command', TP('Night', 'Fabrizio\nPeter', 'A4', 'English', 'Day\nBackground: x') + '\n\nAction. @8:13');
  k9();
}
// Settings: Up/Down on an active Page size or Language line; Language renames the headings and commands
{
  const k9 = () => cm.triggerOnKeyDown({ type:'keydown', keyCode:57, key:'9', ctrlKey:true, shiftKey:true, preventDefault(){}, stopPropagation(){} });
  const up = () => cm.triggerOnKeyDown({ type:'keydown', keyCode:38, key:'ArrowUp', preventDefault(){}, stopPropagation(){} });
  const down = () => cm.triggerOnKeyDown({ type:'keydown', keyCode:40, key:'ArrowDown', preventDefault(){}, stopPropagation(){} });
  start(''); k9(); type('Night'); tab(); tab();
  down(); doc('Down on Page size: US Letter', TP('Night', '', 'US Letter') + ' @7:20');
  down(); doc('again: back to A4', TP('Night', '', 'A4') + ' @7:13');
  tab(); down();
  doc('Down on Language: Deutsch, the title page in German', '---\n\n//TITELSEITE\nTitel: Night\nAutor:in: \n\n//EINSTELLUNGEN\nSeitenformat: A4\nSprache: Deutsch\nAutovervollständigung: Ein\nModus: Tag\n\n--- @8:16');
  down(); doc('Français', '---\n\n//PAGE DE TITRE\nTitre: Night\nAuteur: \n\n//PARAMÈTRES\nFormat: A4\nLangue: Français\nAutocomplétion: Activée\nMode: Jour\n\n--- @8:16');
  down(); doc('Italiano', '---\n\n//FRONTESPIZIO\nTitolo: Night\nAutore: \n\n//IMPOSTAZIONI\nFormato: A4\nLingua: Italiano\nAutocompletamento: Attivo\nModalità: Giorno\n\n--- @8:16');
  up(); up(); doc('Up goes back to Deutsch', '---\n\n//TITELSEITE\nTitel: Night\nAutor:in: \n\n//EINSTELLUNGEN\nSeitenformat: A4\nSprache: Deutsch\nAutovervollständigung: Ein\nModus: Tag\n\n--- @8:16');
  up(); doc('and to English', TP('Night', '') + ' @8:17');
  cm.setCursor({line:6, ch:0}); cm.setCursor({line:7, ch:3}); up();
  { const ok = cm.getValue() === TP('Night', ''); if (!ok) fails++; console.log((ok ? 'ok   ' : 'FAIL ') + 'reached with the arrow keys the setting stays as it is'); }
  cm.setCursor({line:8, ch:12}); type('x');
  cm.triggerOnKeyDown({ type:'keydown', keyCode:8, key:'Backspace', preventDefault(){}, stopPropagation(){} });
  doc('the values cannot be typed or deleted', TP('Night', '') + ' @8:12');
  cm.replaceRange('', {line:7, ch:0}, {line:8, ch:5}, '+delete');
  { const ok = cm.getValue() === TP('Night', ''); if (!ok) fails++; console.log((ok ? 'ok   ' : 'FAIL ') + 'a selection into a setting line cannot delete it'); }
  cm.setCursor({line:8, ch:3});
  { const ok = !/sm-set-on/.test(cm.getLineHandle(8).wrapClass || ''); if (!ok) fails++; console.log((ok ? 'ok   ' : 'FAIL ') + 'reached without click or Tab the chip is not active'); }
  cm.setCursor({line:7, ch:3}); tab();
  { const ok = /sm-set-on/.test(cm.getLineHandle(8).wrapClass || ''); if (!ok) fails++; console.log((ok ? 'ok   ' : 'FAIL ') + 'reached with Tab the chip is active (blue)'); }
  k9(); // hide again, then load an older script
  cm.setValue('---\nTitle: A\n---\n\nAction.'); cm.setCursor({line:6, ch:0}); k9();
  doc('an older title page gets the heading and settings when shown', '---\n\n//TITLE PAGE\nTitle: A\n\n//SETTINGS\nPage size: A4\nLanguage: English\nAutocomplete: On\nMode: Day\n\n---\n\nAction. @3:8');
  k9();
}
{
  const k9 = () => cm.triggerOnKeyDown({ type:'keydown', keyCode:57, key:'9', ctrlKey:true, shiftKey:true, preventDefault(){}, stopPropagation(){} });
  start('.i HOUSE - DAY\n\nAction.'); k9();
  const sp = cm.getLineHandle(12).wrapClass || '';
  { const ok = !/sm-sp2/.test(sp); if (!ok) fails++; console.log((ok ? 'ok   ' : 'FAIL ') + 'one empty line between title page and slugline'); }
  k9(); cm.setCursor({line:13, ch:0});
  cm.triggerOnKeyDown({ type:'keydown', keyCode:8, key:'Backspace', preventDefault(){}, stopPropagation(){} });
  doc('Backspace never joins a slugline to the hidden title page', TP('', '') + '\n\n.i HOUSE - DAY\n\nAction. @14:0');
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
  doc('showing adds the empty lines after and before ---', '---\n\n//TITLE PAGE\nTitle: A\n\nAuthor: B\n\n//SETTINGS\nPage size: A4\nLanguage: English\nAutocomplete: On\nMode: Day\n\n---\n\n.i HOUSE - DAY\n\nAction. @15:0');
}

{
  const k9 = () => cm.triggerOnKeyDown({ type:'keydown', keyCode:57, key:'9', ctrlKey:true, shiftKey:true, preventDefault(){}, stopPropagation(){} });
  // empty page: show the title page, type nothing, hide it again; the cursor goes to an empty script line at the left edge
  start(''); k9(); k9();
  doc('hiding an untouched title page on an empty page leaves an empty script line below it', TP('', '') + '\n\n @14:0');
  type('F');
  doc('typing then starts the script, the closing --- stays intact', TP('', '') + '\n\nF @14:1');
  { const ok = [0,1,2,3,4,5,6,7,8,9,10,11,12].every(i => /sm-gone/.test(cm.getLineHandle(i).wrapClass || '')); if (!ok) fails++; console.log((ok ? 'ok   ' : 'FAIL ') + 'the title page stays hidden while typing below it'); }
}

{
  // a loaded script is hidden and coloured at once, before the browser paints: no flash of the title page
  cm.setValue('---\n\nTitle: A\n\n---\n\nAction.');
  { const ok = [0,1,2,3,4,5].every(i => /sm-gone/.test(cm.getLineHandle(i).wrapClass || '')); if (!ok) fails++; console.log((ok ? 'ok   ' : 'FAIL ') + 'a loaded script hides its title page at once'); }
}

{
  cm.setValue('---\nTitle: A\n---\n\nAction.'); cm.setCursor({line:6, ch:7});
  doc('a loaded title page gets its empty lines at once', '---\n\nTitle: A\n\n---\n\nAction. @6:7');
}

// An older title page like the one in the screenshot: mixed languages, D typed as the language, the first German heading
{
  cm.setValue('---\n\n//TITLE PAGE\nTitel: \nAutor:in: \n\n//SKRIPTEINSTELLUNGEN\nSeitenformat: US Letter\nSprache: D\n\n---');
  { const want = '---\n\n//TITELSEITE\nTitel: \nAutor:in: \n\n//EINSTELLUNGEN\nSeitenformat: US Letter\nSprache: Deutsch\n\n---\n\n'; const ok = cm.getValue() === want; if (!ok) fails++; console.log((ok ? 'ok   ' : 'FAIL ') + 'D is read as Deutsch, everything in German, the old heading renamed'); }
  cm.setValue('---\n\n//TITLE PAGE\nTitle: \nAuthor: \n\n//SETTINGS\nPage size: letter\nLanguage: Klingon\n\n---');
  { const ok = cm.getValue() === '---\n\n//TITLE PAGE\nTitle: \nAuthor: \n\n//SETTINGS\nPage size: US Letter\nLanguage: English\n\n---\n\n'; if (!ok) fails++; console.log((ok ? 'ok   ' : 'FAIL ') + 'unknown values become English and US Letter in their proper form'); }
  if (/sm-gone/.test(cm.getLineHandle(2).wrapClass || '')) cm.triggerOnKeyDown({ type:'keydown', keyCode:57, key:'9', ctrlKey:true, shiftKey:true, preventDefault(){}, stopPropagation(){} });
  { const ok = /sm-head/.test(cm.getLineHandle(2).wrapClass || '') && /sm-head/.test(cm.getLineHandle(6).wrapClass || ''); if (!ok) fails++; console.log((ok ? 'ok   ' : 'FAIL ') + 'both headings have the gap below them'); }
  // Locked: the commands Title: and Author: and the headings; the values stay free
  cm.setCursor({line:3, ch:7}); type('Night');
  cm.triggerOnKeyDown({ type:'keydown', keyCode:8, key:'Backspace', preventDefault(){}, stopPropagation(){} });
  doc('the title can be typed and deleted', '---\n\n//TITLE PAGE\nTitle: Nigh\nAuthor: \n\n//SETTINGS\nPage size: US Letter\nLanguage: English\nAutocomplete: On\nMode: Day\n\n---\n\n @3:11');
  cm.setCursor({line:3, ch:7}); cm.triggerOnKeyDown({ type:'keydown', keyCode:8, key:'Backspace', preventDefault(){}, stopPropagation(){} });
  cm.setCursor({line:3, ch:2}); type('x');
  cm.setCursor({line:2, ch:5}); type('x');
  cm.setCursor({line:4, ch:0}); cm.triggerOnKeyDown({ type:'keydown', keyCode:8, key:'Backspace', preventDefault(){}, stopPropagation(){} });
  cm.replaceRange('', {line:3, ch:0}, {line:4, ch:3}, '+delete');
  { const ok = cm.getValue() === '---\n\n//TITLE PAGE\nTitle: Nigh\nAuthor: \n\n//SETTINGS\nPage size: US Letter\nLanguage: English\nAutocomplete: On\nMode: Day\n\n---\n\n'; if (!ok) fails++; console.log((ok ? 'ok   ' : 'FAIL ') + 'Title:, Author: and the headings cannot be changed or deleted' + (ok ? '' : ' -> ' + JSON.stringify(cm.getValue()))); }
}

// Tab on an empty script below a title page starts the ring at .i, like an empty page
{
  cm.setValue('---\n\n//TITLE PAGE\nTitle: \nAuthor: \n\n//SETTINGS\nPage size: A4\nLanguage: English\n\n---\n\n'); cm.setCursor({line:12, ch:0});
  tab(); doc('Tab below a title page on an empty script: .i', '---\n\n//TITLE PAGE\nTitle: \nAuthor: \n\n//SETTINGS\nPage size: A4\nLanguage: English\n\n---\n\n.i  @12:3');
}

// A script that ends with the closing --- of a hidden title page gets a script line below it; Tab works there
{
  const k9 = () => cm.triggerOnKeyDown({ type:'keydown', keyCode:57, key:'9', ctrlKey:true, shiftKey:true, preventDefault(){}, stopPropagation(){} });
  cm.setValue('---\n\n//TITLE PAGE\nTitle: A\nAuthor: \n\n//SETTINGS\nPage size: US Letter\nLanguage: English\n\n---');
  if (!/sm-gone/.test(cm.getLineHandle(0).wrapClass || '')) k9();
  { const ok = /sm-gone/.test(cm.getLineHandle(0).wrapClass || ''); if (!ok) fails++; console.log((ok ? 'ok   ' : 'FAIL ') + 'title page hidden'); }
  doc('nothing below a hidden title page: an empty script line is added, cursor on it', '---\n\n//TITLE PAGE\nTitle: A\nAuthor: \n\n//SETTINGS\nPage size: US Letter\nLanguage: English\n\n---\n\n @12:0');
  tab(); doc('Tab there starts with .i', '---\n\n//TITLE PAGE\nTitle: A\nAuthor: \n\n//SETTINGS\nPage size: US Letter\nLanguage: English\n\n---\n\n.i  @12:3');
}

// Opening a script with the cursor on line 0 of a hidden title page: Tab works on the script, not inside the title page
{
  const k9 = () => cm.triggerOnKeyDown({ type:'keydown', keyCode:57, key:'9', ctrlKey:true, shiftKey:true, preventDefault(){}, stopPropagation(){} });
  cm.setValue('---\n\n//TITLE PAGE\nTitle: A\nAuthor: \n\n//SETTINGS\nPage size: US Letter\nLanguage: English\n\n---\n\n');
  if (!/sm-gone/.test(cm.getLineHandle(0).wrapClass || '')) k9();
  cm.setCursor({line:0, ch:0}); cm.setValue(cm.getValue());
  tab(); doc('Tab right after opening starts the script with .i', '---\n\n//TITLE PAGE\nTitle: A\nAuthor: \n\n//SETTINGS\nPage size: US Letter\nLanguage: English\n\n---\n\n.i  @12:3');
}

// The newer local copy laid over the server version while the title page is hidden: no second title page
{
  const k9 = () => cm.triggerOnKeyDown({ type:'keydown', keyCode:57, key:'9', ctrlKey:true, shiftKey:true, preventDefault(){}, stopPropagation(){} });
  const srv = '---\n\n//TITLE PAGE\nTitle: A\nAuthor: B\n\n//SETTINGS\nPage size: US Letter\nLanguage: English\n\n---\n\n.i X - DAY\n\nfasdfa';
  const loc = srv.replace('US Letter', 'A4') + '\n\nMore.';
  cm.setValue(srv);
  if (!/sm-gone/.test(cm.getLineHandle(0).wrapClass || '')) k9();
  cm.replaceRange(loc, {line:0, ch:0}, {line:cm.lastLine(), ch:cm.getLine(cm.lastLine()).length}, '+restore');
  { const ok = cm.getValue() === loc; if (!ok) fails++; console.log((ok ? 'ok   ' : 'FAIL ') + 'restoring the local copy replaces everything, the hidden title page too' + (ok ? '' : ' -> ' + JSON.stringify(cm.getValue()))); }
  { const ok = /sm-gone/.test(cm.getLineHandle(0).wrapClass || ''); if (!ok) fails++; console.log((ok ? 'ok   ' : 'FAIL ') + 'and the title page is hidden again'); }
}

// Cmd+Z after a language switch takes back the value and the names together, and goes on further back
{
  const k9 = () => cm.triggerOnKeyDown({ type:'keydown', keyCode:57, key:'9', ctrlKey:true, shiftKey:true, preventDefault(){}, stopPropagation(){} });
  const undo = () => cm.triggerOnKeyDown({ type:'keydown', keyCode:90, key:'z', ctrlKey:true, preventDefault(){}, stopPropagation(){} });
  const down = () => cm.triggerOnKeyDown({ type:'keydown', keyCode:40, key:'ArrowDown', preventDefault(){}, stopPropagation(){} });
  const T = '---\n\n//TITLE PAGE\nTitle: A\nAuthor: B\n\n//SETTINGS\nPage size: A4\nLanguage: English\nAutocomplete: On\nMode: Day\n\n---\n\nAction.';
  cm.setValue(T); cm.clearHistory();
  if (/sm-gone/.test(cm.getLineHandle(0).wrapClass || '')) k9();
  cm.setCursor({line:3, ch:8}); type('x');
  cm.setCursor({line:7, ch:0}); cm.setCursor({line:7, ch:3}); tab(); down();
  { const ok = /Sprache: Deutsch/.test(cm.getValue()) && /Titel: Ax/.test(cm.getValue()); if (!ok) fails++; console.log((ok ? 'ok   ' : 'FAIL ') + 'switched to Deutsch'); }
  undo();
  { const ok = cm.getValue() === T.replace('Title: A', 'Title: Ax'); if (!ok) fails++; console.log((ok ? 'ok   ' : 'FAIL ') + 'one Cmd+Z: all English again' + (ok ? '' : ' -> ' + JSON.stringify(cm.getValue()))); }
  undo();
  { const ok = cm.getValue() === T; if (!ok) fails++; console.log((ok ? 'ok   ' : 'FAIL ') + 'next Cmd+Z goes on to the typed x' + (ok ? '' : ' -> ' + JSON.stringify(cm.getValue()))); }
  // deleting the empty line after the opening ---: it comes back, and Cmd+Z still gets past it
  cm.setValue(T); cm.clearHistory();
  cm.setCursor({line:14, ch:7}); type('y');
  cm.setCursor({line:2, ch:0}); cm.triggerOnKeyDown({ type:'keydown', keyCode:8, key:'Backspace', preventDefault(){}, stopPropagation(){} });
  undo(); undo(); undo();
  { const ok = cm.getValue() === T; if (!ok) fails++; console.log((ok ? 'ok   ' : 'FAIL ') + 'Cmd+Z gets past an automatic empty line' + (ok ? '' : ' -> ' + JSON.stringify(cm.getValue()))); }
  k9();
}

// Undo history survives hidden text: Reformat with a hidden title page, and typing in a view, can both be taken back
{
  const undo = () => cm.triggerOnKeyDown({ type:'keydown', keyCode:90, key:'z', ctrlKey:true, preventDefault(){}, stopPropagation(){} });
  const k9 = () => cm.triggerOnKeyDown({ type:'keydown', keyCode:57, key:'9', ctrlKey:true, shiftKey:true, preventDefault(){}, stopPropagation(){} });
  const T = '---\n\n//TITLE PAGE\nTitle: A\nAuthor: B\n\n//SETTINGS\nPage size: A4\nLanguage: English\n\n---\n\n.i house  -  day\n\nshe   waits.';
  cm.setValue(T); cm.clearHistory();
  if (!/sm-gone/.test(cm.getLineHandle(0).wrapClass || '')) k9();
  cm.setCursor({line:15, ch:5}); type('x');
  cm.triggerOnKeyDown({ type:'keydown', keyCode:13, key:'Enter', ctrlKey:true, shiftKey:true, preventDefault(){}, stopPropagation(){} });
  { const ok = /\.i HOUSE \u2013 DAY/.test(cm.getValue()); if (!ok) fails++; console.log((ok ? 'ok   ' : 'FAIL ') + 'Reformat with a hidden title page'); }
  undo();
  { const ok = cm.getValue() === T + 'x'; if (!ok) fails++; console.log((ok ? 'ok   ' : 'FAIL ') + 'Cmd+Z takes Reformat back' + (ok ? '' : ' -> ' + JSON.stringify(cm.getValue()))); }
  undo();
  { const ok = cm.getValue() === T; if (!ok) fails++; console.log((ok ? 'ok   ' : 'FAIL ') + 'and then the typed x' + (ok ? '' : ' -> ' + JSON.stringify(cm.getValue()))); }
  // hidden text still cannot be changed
  cm.replaceRange('Z', {line:3, ch:2}, null, '+input');
  { const ok = cm.historySize().undo === 0 && cm.historySize().redo === 2; if (!ok) fails++; console.log((ok ? 'ok   ' : 'FAIL ') + 'the redo steps are still there' + (ok ? '' : ' ' + JSON.stringify(cm.historySize()))); }
  { const ok = cm.getValue() === T; if (!ok) fails++; console.log((ok ? 'ok   ' : 'FAIL ') + 'the hidden title page stays read only'); }
  // control characters are dropped, ordinary text stays
  cm.setCursor({line:15, ch:12}); type('a\u001ab');
  { const ok = /she {3}waits\.ab$/.test(cm.getValue()); if (!ok) fails++; console.log((ok ? 'ok   ' : 'FAIL ') + 'a control character typed in is dropped' + (ok ? '' : ' -> ' + JSON.stringify(cm.getValue().slice(-20)))); }
}

// Cmd+A and Backspace with a hidden title page: the script is deleted, the title page stays, one Cmd+Z brings it back
{
  const k9 = () => cm.triggerOnKeyDown({ type:'keydown', keyCode:57, key:'9', ctrlKey:true, shiftKey:true, preventDefault(){}, stopPropagation(){} });
  const T = '---\n\n//TITLE PAGE\nTitle: A\nAuthor: B\n\n//SETTINGS\nPage size: A4\nLanguage: English\n\n---\n\n.i HOUSE - DAY\n\nShe waits.';
  cm.setValue(T); cm.clearHistory();
  if (!/sm-gone/.test(cm.getLineHandle(0).wrapClass || '')) k9();
  cm.execCommand('selectAll');
  cm.triggerOnKeyDown({ type:'keydown', keyCode:8, key:'Backspace', preventDefault(){}, stopPropagation(){} });
  { const ok = cm.getValue() === T.split('\n').slice(0, 11).join('\n') + '\n\n'; if (!ok) fails++; console.log((ok ? 'ok   ' : 'FAIL ') + 'Cmd+A and Backspace delete the script, the hidden title page stays at the top' + (ok ? '' : ' -> ' + JSON.stringify(cm.getValue()))); }
  { const c = cm.getCursor().line, vis = !/sm-gone/.test(cm.getLineHandle(c).wrapClass || ''); const ok = vis && c > 10; if (!ok) fails++; console.log((ok ? 'ok   ' : 'FAIL ') + 'the cursor stays on a visible line below the title page (line ' + c + ')'); }
  cm.replaceRange('Z', cm.getCursor(), null, '+input'); { const ok = /---\n\nZ$/.test(cm.getValue()); if (!ok) fails++; console.log((ok ? 'ok   ' : 'FAIL ') + 'and typing starts the script there' + (ok ? '' : ' -> ' + JSON.stringify(cm.getValue().slice(-15)))); }
  cm.triggerOnKeyDown({ type:'keydown', keyCode:90, key:'z', ctrlKey:true, preventDefault(){}, stopPropagation(){} });
  cm.triggerOnKeyDown({ type:'keydown', keyCode:90, key:'z', ctrlKey:true, preventDefault(){}, stopPropagation(){} });
  { const ok = cm.getValue() === T; if (!ok) fails++; console.log((ok ? 'ok   ' : 'FAIL ') + 'one Cmd+Z brings it back' + (ok ? '' : ' -> ' + JSON.stringify(cm.getValue()))); }
  // in a view: Cmd+A and Backspace delete what is visible only, and Cmd+Z brings it back
  k9(); cm.setValue('.i HOUSE - DAY\n\nShe waits.\n\n,ANNA,\nHi.'); cm.clearHistory(); cm.setCursor({line:5, ch:3});
  cm.triggerOnKeyDown({ type:'keydown', keyCode:51, key:'3', ctrlKey:true, shiftKey:true, preventDefault(){}, stopPropagation(){} });
  cm.execCommand('selectAll'); cm.triggerOnKeyDown({ type:'keydown', keyCode:8, key:'Backspace', preventDefault(){}, stopPropagation(){} });
  { const ok = /She waits/.test(cm.getValue()) && !/Hi\./.test(cm.getValue()); if (!ok) fails++; console.log((ok ? 'ok   ' : 'FAIL ') + 'in the dialogue view only the visible dialogue is deleted' + (ok ? '' : ' -> ' + JSON.stringify(cm.getValue()))); }
  cm.triggerOnKeyDown({ type:'keydown', keyCode:90, key:'z', ctrlKey:true, preventDefault(){}, stopPropagation(){} });
  { const ok = cm.getValue() === '.i HOUSE - DAY\n\nShe waits.\n\n,ANNA,\nHi.'; if (!ok) fails++; console.log((ok ? 'ok   ' : 'FAIL ') + 'Cmd+Z brings it back in the view' + (ok ? '' : ' -> ' + JSON.stringify(cm.getValue()))); }
  cm.triggerOnKeyDown({ type:'keydown', keyCode:27, key:'Escape', preventDefault(){}, stopPropagation(){} });
}

// The --- of a visible title page stay intact; Cmd+A and Backspace still delete everything; unchanged lines are not redrawn
{
  const k9 = () => cm.triggerOnKeyDown({ type:'keydown', keyCode:57, key:'9', ctrlKey:true, shiftKey:true, preventDefault(){}, stopPropagation(){} });
  const bs = () => cm.triggerOnKeyDown({ type:'keydown', keyCode:8, key:'Backspace', preventDefault(){}, stopPropagation(){} });
  const T = '---\n\n//TITLE PAGE\nTitle: A\nAuthor: B\n\n//SETTINGS\nPage size: A4\nLanguage: English\n\n---\n\n.i HOUSE - DAY';
  cm.setValue(T); cm.clearHistory();
  if (/sm-gone/.test(cm.getLineHandle(0).wrapClass || '')) k9();
  cm.setCursor({line:12, ch:0}); bs(); bs();
  { const ok = cm.getValue().split('\n').filter(l => /^---\s*$/.test(l)).length === 2; if (!ok) fails++; console.log((ok ? 'ok   ' : 'FAIL ') + 'Backspace at the start of the script never joins it to the closing ---' + (ok ? '' : ' -> ' + JSON.stringify(cm.getValue().slice(-30)))); }
  cm.replaceRange('F', {line:10, ch:3}, null, '+input');
  cm.replaceRange('F', {line:0, ch:3}, null, '+input');
  { const ok = cm.getLine(0) === '---' && /^---$/m.test(cm.getValue().split('\n').slice(1).join('\n')); if (!ok) fails++; console.log((ok ? 'ok   ' : 'FAIL ') + 'nothing can be typed onto a ---'); }
  // a no-op redraw changes no line
  let n = 0; const orig = cm.removeLineClass; cm.removeLineClass = function(){ n++; return orig.apply(this, arguments); };
  cm.triggerOnKeyDown({ type:'keydown', keyCode:54, key:'6', ctrlKey:true, shiftKey:true, preventDefault(){}, stopPropagation(){} });
  cm.triggerOnKeyDown({ type:'keydown', keyCode:54, key:'6', ctrlKey:true, shiftKey:true, preventDefault(){}, stopPropagation(){} });
  cm.removeLineClass = orig;
  { const ok = n === 0; if (!ok) fails++; console.log((ok ? 'ok   ' : 'FAIL ') + 'a redraw that changes nothing leaves every line alone (' + n + ' lines touched)'); }
  cm.execCommand('selectAll'); bs();
  { const ok = cm.getValue() === ''; if (!ok) fails++; console.log((ok ? 'ok   ' : 'FAIL ') + 'with the title page shown, Cmd+A and Backspace delete everything' + (ok ? '' : ' -> ' + JSON.stringify(cm.getValue().slice(0, 30)))); }
  k9();
}

// The script directly below the closing --- (no empty line): still its own paragraph in every respect
{
  const k9 = () => cm.triggerOnKeyDown({ type:'keydown', keyCode:57, key:'9', ctrlKey:true, shiftKey:true, preventDefault(){}, stopPropagation(){} });
  const bs = () => cm.triggerOnKeyDown({ type:'keydown', keyCode:8, key:'Backspace', preventDefault(){}, stopPropagation(){} });
  const T = '---\n\n//TITLE PAGE\nTitle: A\nAuthor: B\n\n//SETTINGS\nPage size: A4\nLanguage: English\n\n---\n.i HOUSE - DAY\n\nShe waits.';
  cm.setValue(T); cm.clearHistory();
  if (!/sm-gone/.test(cm.getLineHandle(0).wrapClass || '')) k9();
  { const ok = /sm-l-slug/.test(cm.getLineHandle(11).wrapClass || '') && !/sm-gone/.test(cm.getLineHandle(11).wrapClass || ''); if (!ok) fails++; console.log((ok ? 'ok   ' : 'FAIL ') + 'a slugline right under --- is a slugline and stays visible when the title page is hidden'); }
  cm.execCommand('selectAll'); bs();
  { const ok = cm.getValue() === T.split('\n').slice(0, 11).join('\n') + '\n\n'; if (!ok) fails++; console.log((ok ? 'ok   ' : 'FAIL ') + 'the title page stays at the top, followed by an empty line and the cursor line' + (ok ? '' : ' -> ' + JSON.stringify(cm.getValue()))); }
  { const c = cm.getCursor().line, ok = !/She waits|HOUSE/.test(cm.getValue()) && !/sm-gone/.test(cm.getLineHandle(c).wrapClass || ''); if (!ok) fails++; console.log((ok ? 'ok   ' : 'FAIL ') + 'Cmd+A and Backspace delete it, the cursor stays visible' + (ok ? '' : ' -> ' + JSON.stringify(cm.getValue().slice(-20)) + ' line ' + c)); }
  cm.triggerOnKeyDown({ type:'keydown', keyCode:90, key:'z', ctrlKey:true, preventDefault(){}, stopPropagation(){} });
  { const ok = cm.getValue() === T && cm.historySize().undo === 0; if (!ok) fails++; console.log((ok ? 'ok   ' : 'FAIL ') + 'one Cmd+Z brings everything back' + (ok ? '' : ' -> ' + JSON.stringify(cm.getValue().slice(-30)) + JSON.stringify(cm.historySize()))); }
  k9(); cm.setCursor({line:12, ch:0});
  cm.triggerOnKeyDown({ type:'keydown', keyCode:13, key:'Enter', ctrlKey:true, shiftKey:true, preventDefault(){}, stopPropagation(){} });
  { const ok = /\n---\n\n\.i HOUSE \u2013 DAY/.test(cm.getValue()); if (!ok) fails++; console.log((ok ? 'ok   ' : 'FAIL ') + 'Reformat sets the script off from --- by an empty line' + (ok ? '' : ' -> ' + JSON.stringify(cm.getValue().slice(-40)))); }
  k9();
}

// Cmd+A with a hidden title page, then typing: the letters start the script below the title page, which stays intact
{
  const k9 = () => cm.triggerOnKeyDown({ type:'keydown', keyCode:57, key:'9', ctrlKey:true, shiftKey:true, preventDefault(){}, stopPropagation(){} });
  const T = '---\n\n//TITLE PAGE\nTitle: A\nAuthor: B\n\n//SETTINGS\nPage size: A4\nLanguage: English\n\n---\n\n.i HOUSE - DAY\n\nShe waits.';
  cm.setValue(T); cm.clearHistory();
  if (!/sm-gone/.test(cm.getLineHandle(0).wrapClass || '')) k9();
  cm.execCommand('selectAll');
  cm.replaceSelection('H', 'end', '+input');
  { const ok = cm.getValue() === T.split('\n').slice(0, 11).join('\n') + '\n\nH' && !cm.somethingSelected(); if (!ok) fails++; console.log((ok ? 'ok   ' : 'FAIL ') + 'Cmd+A and typing: the title page stays, the script begins with the letter' + (ok ? '' : ' -> ' + JSON.stringify(cm.getValue()))); }
  cm.replaceRange('i', cm.getCursor(), null, '+input');
  { const ok = /\n\nHi$/.test(cm.getValue()) && cm.getLine(0) === '---'; if (!ok) fails++; console.log((ok ? 'ok   ' : 'FAIL ') + 'the next letter follows it' + (ok ? '' : ' -> ' + JSON.stringify(cm.getValue()))); }
  cm.execCommand('selectAll');
  cm.triggerOnKeyDown({ type:'keydown', keyCode:8, key:'Backspace', preventDefault(){}, stopPropagation(){} });
  cm.replaceRange('N', cm.getCursor(), null, '+input');
  { const ok = cm.getValue() === T.split('\n').slice(0, 11).join('\n') + '\n\nN'; if (!ok) fails++; console.log((ok ? 'ok   ' : 'FAIL ') + 'Cmd+A, Backspace, then typing: the letter starts the script' + (ok ? '' : ' -> ' + JSON.stringify(cm.getValue()))); }
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

// /pdf + Enter on a line of its own: the line is emptied, nothing else changes
start('.i HOUSE - DAY\n\nShe waits.\n\n'); type('/pdf'); enter();
check('/pdf + Enter empties the line', '"" cursor 4:0');
eq2('/pdf + Enter leaves the script as it was', cm.getValue(), '.i HOUSE - DAY\n\nShe waits.\n\n');
start('She waits.\n/pdf'); enter();
check('/pdf inside a paragraph stays text', '"" cursor 3:0');
// Transitions in the script's language: .t gives the first one, Up/Down cycle the list, a change of language translates them
{
  const down = () => cm.triggerOnKeyDown({ type:'keydown', keyCode:40, key:'ArrowDown', preventDefault(){}, stopPropagation(){} });
  const DE = '---\n\n//TITELSEITE\nTitel: A\nAutor:in: \n\n//EINSTELLUNGEN\nSeitenformat: A4\nSprache: Deutsch\n\n---\n\nAction.\n\n';
  start(DE); type('.t');
  check('.t in a German script: SCHNITT AUF:', '".t SCHNITT AUF:" cursor 14:15');
  down(); check('Down: AUFBLENDE:', '".t AUFBLENDE:" cursor 14:13');
  const k9 = () => cm.triggerOnKeyDown({ type:'keydown', keyCode:57, key:'9', ctrlKey:true, shiftKey:true, preventDefault(){}, stopPropagation(){} });
  const toLang = () => { const ln = cm.getValue().split('\n').findIndex(l => /^(Seitenformat|Format|Formato|Page size):/.test(l)); cm.setCursor({line:ln, ch:3}); tab(); };
  const last = () => cm.getLine(cm.lastLine());
  k9(); toLang(); down();
  eq2('Language to Français translates the transition', last(), ".t FONDU D'OUVERTURE :");
  down(); eq2('Italiano', last(), '.t DISSOLVENZA IN ENTRATA:');
  cm.changeGeneration(true); down(); eq2('English', last(), '.t FADE IN:');
  cm.execCommand('undo'); eq2('one Cmd+Z takes the language and the transition back', last() + ' / ' + cm.getValue().split('\n').find(l => /^(Lingua|Language|Sprache):/.test(l)), '.t DISSOLVENZA IN ENTRATA: / Lingua: Italiano');
  k9(); cm.setValue(DE + '.t MY OWN TRANSITION:'); k9(); toLang(); down();
  eq2('a transition of your own stays as typed', last(), '.t MY OWN TRANSITION:');
}

// Cue extensions in the script's language: Up/Down cycle each word once, a change of language translates them
{
  const down = () => cm.triggerOnKeyDown({ type:'keydown', keyCode:40, key:'ArrowDown', preventDefault(){}, stopPropagation(){} });
  const k9 = () => cm.triggerOnKeyDown({ type:'keydown', keyCode:57, key:'9', ctrlKey:true, shiftKey:true, preventDefault(){}, stopPropagation(){} });
  const click = (ln, ch) => { cm.signal('mousedown', {}); cm.setCursor({line:ln, ch:ch}); };
  const DE = '---\n\n//TITELSEITE\nTitel: A\nAutor:in: \n\n//EINSTELLUNGEN\nSeitenformat: A4\nSprache: Deutsch\n\n---\n\n,ANNA (V.O.),\nHallo.';
  cm.setValue(DE);
  const cue = () => cm.getValue().split('\n').find(l => l.startsWith(',ANNA'));
  const cueLn = () => cm.getValue().split('\n').findIndex(l => l.startsWith(',ANNA'));
  click(cueLn(), 8); down(); eq2('German: Down after V.O. gives WEITER (OFF stands for V.O., O.S. and O.C.)', cue(), ',ANNA (WEITER),');
  down(); eq2('then OFF', cue(), ',ANNA (OFF),');
  down(); eq2('and WEITER again', cue(), ',ANNA (WEITER),');
  const ln = cm.getValue().split('\n').findIndex(l => /^Seitenformat:/.test(l)); cm.setCursor({line:ln, ch:3}); if (cm.getCursor().line !== ln){ k9(); cm.setCursor({line:ln, ch:3}); } tab(); down();
  eq2('Language to Français: WEITER becomes SUITE', cue(), ',ANNA (SUITE),');
  down(); eq2('Italiano: CONT.', cue(), ',ANNA (CONT.),');
  down(); eq2("English: CONT'D", cue(), ",ANNA (CONT'D),");
}

// Times of day in the script's language: a change of language translates the time in every slugline
{
  const down = () => cm.triggerOnKeyDown({ type:'keydown', keyCode:40, key:'ArrowDown', preventDefault(){}, stopPropagation(){} });
  const k9 = () => cm.triggerOnKeyDown({ type:'keydown', keyCode:57, key:'9', ctrlKey:true, shiftKey:true, preventDefault(){}, stopPropagation(){} });
  cm.setValue('---\n\n//TITELSEITE\nTitel: A\nAutor:in: \n\n//EINSTELLUNGEN\nSeitenformat: A4\nSprache: Deutsch\n\n---\n\n.i KÜCHE - NACHT\n\nAction.\n\n.e GARTEN - AM NÄCHSTEN TAG - REGEN\n\nAction.\n\n.i FLUR - TAGEBUCH');
  const ln = cm.getValue().split('\n').findIndex(l => /^Seitenformat:/.test(l));
  cm.setCursor({line:ln, ch:3}); if (cm.getCursor().line !== ln){ k9(); cm.setCursor({line:ln, ch:3}); } tab(); down();
  const slugs = () => cm.getValue().split('\n').filter(l => /^\.[ie] /.test(l)).join(' | ');
  eq2('Français: NUIT, LE LENDEMAIN, a word that only starts like a time stays', slugs(), '.i KÜCHE - NUIT | .e GARTEN - LE LENDEMAIN - REGEN | .i FLUR - TAGEBUCH');
  down(); eq2('Italiano', slugs(), '.i KÜCHE - NOTTE | .e GARTEN - IL GIORNO DOPO - REGEN | .i FLUR - TAGEBUCH');
  down(); eq2('English', slugs(), '.i KÜCHE - NIGHT | .e GARTEN - THE NEXT DAY - REGEN | .i FLUR - TAGEBUCH');
}

// A finished /pdf alone in its paragraph is shown as a command (colorRed)
cm.setValue('Action.\n\n/pdf'); eq2('/pdf alone: shown as a command', /sm-t-cmd/.test(cm.getLineHandle(2).textClass || ''), true);
eq2('/pdf alone: ↵ in the left margin', [...w.document.querySelectorAll('.sm-cmdmark')].map(e => e.textContent).join(''), '\u21b5');
cm.setValue('Action.\n\n/pd'); eq2('/pd not yet', /sm-t-cmd/.test(cm.getLineHandle(2).textClass || ''), false);
eq2('/pd: no ↵', w.document.querySelectorAll('.sm-cmdmark').length, 0);
cm.setValue('Action.\n/pdf'); eq2('/pdf inside a paragraph: not a command', /sm-t-cmd/.test(cm.getLineHandle(1).textClass || ''), false);

// Mode: Day or Night on the title page, Up/Down; the editor takes the colours of OptS_theme_ui light or dark at once
{
  w.app = { option_sets:{ _theme_ui:{ values:{ a:{db_value:'light', colorbackground:'#F9F9F9', colorforeground:'#1C2F42', colorblue:'#009ECE', colorframe:'#E2E2E2', colorinactive:'#929BA4', colorred:'#F2505D'},
    b:{db_value:'dark', colorbackground:'#323232', colorforeground:'#DFDFDF', colorblue:'#81C7E3', colorframe:'#454545', colorinactive:'#9B948D', colorred:'#FBA6B4'} } } } };
  const down = () => cm.triggerOnKeyDown({ type:'keydown', keyCode:40, key:'ArrowDown', preventDefault(){}, stopPropagation(){} });
  const k9 = () => cm.triggerOnKeyDown({ type:'keydown', keyCode:57, key:'9', ctrlKey:true, shiftKey:true, preventDefault(){}, stopPropagation(){} });
  const host = w.document.getElementById('sm-editor'), bg = () => host.style.getPropertyValue('--sm-bg') + ' ' + host.style.getPropertyValue('--sm-blue-alt');
  cm.setValue('---\n\n//TITELSEITE\nTitel: A\nAutor:in: \n\n//EINSTELLUNGEN\nSeitenformat: A4\nSprache: Deutsch\nModus: Tag\n\n---\n\nAction.');
  eq2('Tag: light colours, the dark blue for the shot cursor', bg(), '#F9F9F9 #81C7E3');
  const ln = cm.getValue().split('\n').findIndex(l => /^Sprache:/.test(l));
  cm.setCursor({line:ln, ch:3}); if (cm.getCursor().line !== ln){ k9(); cm.setCursor({line:ln, ch:3}); } tab(); down();
  eq2('Down on Modus: Nacht', cm.getLine(ln + 1), 'Modus: Nacht');
  eq2('Nacht: dark colours at once, the light blue for the shot cursor', bg(), '#323232 #009ECE');
  // the logo follows through bubble_fn_mode (JavaScript to Bubble element j2bMode)
  const sent = []; w.bubble_fn_mode = v => sent.push(v);
  down(); down(); eq2('logo: Bubble gets light, then dark', sent.join(' '), 'light dark');
  down(); eq2('again: Tag', cm.getLine(ln + 1) + ' ' + bg(), 'Modus: Tag #F9F9F9 #81C7E3');
  down(); cm.setCursor({line:ln, ch:3}); tab(); cm.setCursor({line:ln - 1, ch:3}); tab(); down();
  eq2('Language to Français: Nacht becomes Nuit', cm.getValue().split('\n').find(l => /^Mode:/.test(l)), 'Mode: Nuit');
  cm.setValue('---\n\nTitle: A\n\n---\n\nAction.'); eq2('no Mode line: Day', bg(), '#F9F9F9 #81C7E3');
  delete w.app;
}

// Autocomplete on the title page: Off stops name, location and time completion; transitions still work
{
  const k9 = () => cm.triggerOnKeyDown({ type:'keydown', keyCode:57, key:'9', ctrlKey:true, shiftKey:true, preventDefault(){}, stopPropagation(){} });
  const down = () => cm.triggerOnKeyDown({ type:'keydown', keyCode:40, key:'ArrowDown', preventDefault(){}, stopPropagation(){} });
  const off = lang => lang === 'de' ? '---\n\n//TITELSEITE\nTitel: A\nAutor:in: B\n\n//EINSTELLUNGEN\nSeitenformat: A4\nSprache: Deutsch\nAutovervollständigung: Aus\nModus: Tag\n\n---\n\n'
    : '---\n\n//TITLE PAGE\nTitle: A\nAuthor: B\n\n//SETTINGS\nPage size: A4\nLanguage: English\nAutocomplete: Off\nMode: Day\n\n---\n\n';
  const body = '.i HOUSE - LIVING ROOM - DAY\n\n,ANNA,\nHi.\n\n';
  start(off('en') + body); type('.ih'); check('Off: no location completion', '".i H" cursor 19:4');
  type('ouse - l'); check('Off: no second location', '".i HOUSE - L" cursor 19:12');
  type('iving room - d'); check('Off: no time of day', '".i HOUSE - LIVING ROOM - D" cursor 19:26');
  start(off('en') + body); type(',a'); check('Off: no name completion', '",A," cursor 19:2');
  start(off('en') + body); type('.t'); check('Off: transitions still come', '".t CUT TO:" cursor 19:10');
  start(off('de') + body); type(',a'); check('Aus (Deutsch): no name completion', '",A," cursor 19:2');
  start(off('en').replace('Off', 'On') + body); type(',a'); check('On: names complete', '",ANNA," cursor 19:2 selected "NNA"');
  // Up/Down on the active Autocomplete line, in the script's language
  start('Action.'); k9(); if (!/^---/.test(cm.getValue()) || /sm-gone/.test(cm.getLineHandle(0).wrapClass || '')) k9(); tab(); tab(); tab(); tab();
  eq2('Tab reaches Autocomplete: On', cm.getLine(cm.getCursor().line), 'Autocomplete: On');
  down(); eq2('Down: Off', cm.getLine(9), 'Autocomplete: Off');
  down(); eq2('again: On', cm.getLine(9), 'Autocomplete: On');
  down(); cm.setCursor({line:7, ch:3}); tab(); down();
  eq2('Language to Deutsch: Off becomes Aus', cm.getLine(9), 'Autovervollständigung: Aus');
  down(); eq2('Français: Désactivée', cm.getLine(9), 'Autocomplétion: Désactivée');
  down(); eq2('Italiano: Disattivo', cm.getLine(9), 'Autocompletamento: Disattivo');
  k9();
  // A title page from before Autocomplete gets it, on, right above Mode
  cm.setValue('---\n\n//TITLE PAGE\nTitle: A\nAuthor: B\n\n//SETTINGS\nPage size: A4\nLanguage: English\nMode: Night\n\n---\n\nAction.');
  if (!/sm-gone/.test(cm.getLineHandle(0).wrapClass || '')) k9();
  k9();
  eq2('an older title page gets Autocomplete: On above Mode', cm.getValue().split('\n').slice(7, 11).join(' | '), 'Page size: A4 | Language: English | Autocomplete: On | Mode: Night');
  k9();
  // Without a title page completion is on
  start('.i HOUSE - DAY\n\n'); type('.eh'); check('no title page: on', '".e HOUSE" cursor 2:4 selected "OUSE"');
}

// Tab on the closing --- of the title page starts the script with .i
{
  const T = '---\n\n//TITLE PAGE\nTitle: A\nAuthor: B\n\n//SETTINGS\nPage size: A4\nLanguage: English\nAutocomplete: On\nMode: Day\n\n---';
  const k9 = () => cm.triggerOnKeyDown({ type:'keydown', keyCode:57, key:'9', ctrlKey:true, shiftKey:true, preventDefault(){}, stopPropagation(){} });
  const show = () => { if (/sm-gone/.test(cm.getLineHandle(0).wrapClass || '')) k9(); };
  for (const [label, text, want] of [
    ['nothing below: .i two lines below ---', T, T + '\n\n.i  @14:3'],
    ['empty lines below: .i two lines below ---', T + '\n\n', T + '\n\n.i  @14:3'],
    ['script below: .i in front of it', T + '\n\nAction.', T + '\n\n.i \n\nAction. @14:3']]){
    cm.setValue(text); show(); cm.setCursor({line:12, ch:3}); tab(); doc(label, want);
  }
  cm.setValue(T); if (/sm-gone/.test(cm.getLineHandle(12).wrapClass || '') || cm.getCursor().line < 12) k9(); cm.setCursor({line:12, ch:3}); tab(); tab();
  doc('Tab again goes on in the ring: .e', T + '\n\n.e  @14:3');
  cm.setValue(T + '\n'); if (/sm-gone/.test(cm.getLineHandle(0).wrapClass || '')) k9(); cm.setCursor({line:13, ch:0}); tab();
  doc('Tab on the empty line right below ---: .i with an empty line between, cursor on it', T + '\n\n.i  @14:3');
  cm.setValue(T); if (/sm-gone/.test(cm.getLineHandle(0).wrapClass || '')) k9(); cm.setCursor({line:12, ch:3}); tab();
  doc('Tab on --- as the very last line: cursor on the new .i', T + '\n\n.i  @14:3');
  cm.setValue(T + '\n\nAction.'); if (/sm-gone/.test(cm.getLineHandle(0).wrapClass || '')) k9(); cm.setCursor({line:13, ch:0}); tab();
  doc('the same above existing text: .i in front of it', T + '\n\n.i \n\nAction. @14:3');
  k9();
}

// Emphasis tokens in the editor: faint markers without width, underlined and italic text between
{
  cm.setValue('She is _very_ *tired* and _*both*_ here.');
  const toks = cm.getLineTokens(0).filter(t => t.type).map(t => t.type + '[' + t.string + ']').join(' ');
  eq2('editor tokens for _ and *', toks, 'smmk smmk-o[_] smu[very] smmk smmk-c[_] smmk smmk-o[*] smi[tired] smmk smmk-c[*] smmk smmk-o[_*] smu smi[both] smmk smmk-c[*_]');
  cm.setValue(',ANNA,\nI _said_ no.');
  eq2('emphasis in dialogue', cm.getLineTokens(1).filter(t => t.type).map(t => t.type + '[' + t.string + ']').join(' '), 'smmk smmk-o[_] smu[said] smmk smmk-c[_]');
}

// Backspace or Delete on one marker of a pair removes both
{
  const bs = () => cm.triggerOnKeyDown({ type:'keydown', keyCode:8, key:'Backspace', preventDefault(){}, stopPropagation(){} });
  const del = () => cm.triggerOnKeyDown({ type:'keydown', keyCode:46, key:'Delete', preventDefault(){}, stopPropagation(){} });
  start('a _test_ b'); cm.setCursor({line:0, ch:8}); bs(); check('Backspace on the closing _ removes both', '"a test b" cursor 0:6');
  start('a _test_ b'); cm.setCursor({line:0, ch:3}); bs(); check('Backspace on the opening _ removes both', '"a test b" cursor 0:2');
  start('a *test* b'); cm.setCursor({line:0, ch:2}); del(); check('Delete on the opening * removes both', '"a test b" cursor 0:2');
  start('a *test* b'); cm.setCursor({line:0, ch:7}); del(); check('Delete on the closing * removes both', '"a test b" cursor 0:6');
  start('a _*x*_ b'); cm.setCursor({line:0, ch:7}); bs(); check('nested: only the _ pair', '"a *x* b" cursor 0:5');
  start('a_b c'); cm.setCursor({line:0, ch:2}); bs(); check('a single _ is deleted alone', '"ab c" cursor 0:1');
  cm.execCommand('undo'); start('a _test_ b'); cm.setCursor({line:0, ch:8}); bs(); cm.execCommand('undo'); check('one Cmd+Z brings both back', '"a _test_ b" cursor 0:8');
}

// Empty cues get a name on Reformat: the one who spoke before the last speaker, across scenes; one character: that one
start(',MARIA,\nHallo.\n\n,THOMAS,\nHi.\n\n,,\nWie gehts?\n\n,,\nGut, danke.\n\n.e STREET - DAY\n\n,,\nUnd jetzt?'); reformatAll();
eq2('Reformat fills empty cues alternately, across a scene change', cm.getValue().split('\n').filter(l => l.startsWith(',')).join(' '), ',MARIA, ,THOMAS, ,MARIA, ,THOMAS, ,MARIA,');
start(',ANNA,\nHallo.\n\n,,\nNoch da?'); reformatAll();
eq2('only one character so far: that one', cm.getValue().split('\n').filter(l => l.startsWith(',')).join(' '), ',ANNA, ,ANNA,');
start(',,\nHallo?\n\n,ANNA (V.O.),\nJa.\n\n,BEN,\nOkay.\n\n,(O.S.),\nHier.'); reformatAll();
eq2('no character before: stays empty; an extension stays', cm.getValue().split('\n').filter(l => l.startsWith(',')).join(' '), ',, ,ANNA (V.O.), ,BEN, ,ANNA (O.S.),');
start(',MARIA,\nHallo.\n\n,THOMAS,\nHi.\n\n,,\nWie gehts?'); cm.setCursor({line:7, ch:3}); reformatAll();
check('the cursor stays in the same word', '"Wie gehts?" cursor 7:3');
cm.execCommand('undo'); eq2('one Cmd+Z takes it back', cm.getLine(6), ',,');

// Capitals while typing: sluglines, shots, transitions after their short form, cues between the commas
start('Action.\n\n'); type('.sclose on her'); check('shot: description in capitals, .s stays', '".s CLOSE ON HER" cursor 2:15');
start('Action.\n\n'); type('.iehouse'); check('.ie stays lowercase, location in capitals', '".ie HOUSE" cursor 2:9');
start('Action.\n\n'); type('She waits.'); check('action stays as typed', '"She waits." cursor 2:10');
start('Action.\n\n,ANNA,\nHi.\n\n'); type(',b'); check('cue name in capitals', '",B," cursor 5:2');
start('Action.\n\n,ANNA,\nHi.\n\n,BEN (v.o.),'); cm.setCursor({line:5, ch:6}); type('x'); check('cue extension in capitals', '",BEN (Xv.o.)," cursor 5:7');
start('Action.\n\n,ANNA,\nhi'); check('dialogue below a cue stays as typed', '"hi" cursor 3:2');
start('Action.\n\n.i HOUSE\n'); type('garden'); check('second line of a slugline in capitals', '"GARDEN" cursor 3:6');
rf('a hyphen inside a word stays', '.i metro-station - day', '.i METRO-STATION \u2013 DAY');

console.log(fails ? fails + ' failed' : 'all passed');
process.exit(fails ? 1 : 0); // jsdom keeps timers alive, so exit explicitly
}
