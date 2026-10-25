// Pagination tests: loads capacitor.js with paginate exposed
const fs = require('fs');
let src = fs.readFileSync(require('path').join(__dirname, '..', 'capacitor.js'), 'utf8');
src = src.replace('var PAGE_LINES = 58,', 'var PAGE_LINES = (global.__LINES || 58),');
src = src.replace('  function defineMode(){', '  globalThis.__pg = {layout:layout, paginate:paginate, els:pageElements, lines:elLines};\n  function defineMode(){');
global.window = { SM_THEME:{}, location:{hash:''}, addEventListener(){} };
global.document = { readyState:'complete', getElementById(){ return null; }, addEventListener(){}, createElement(){ return {}; }, head:{ appendChild(){} } };
global.CodeMirror = { defineMode(){} };
window.CodeMirror = global.CodeMirror; window.__smMarkSelection = 1;
global.__LINES = +(process.env.LINES || 54);
eval(src);
const P = globalThis.__pg.paginate;
let fails = 0;
function eq(label, got, want){ const g = JSON.stringify(got), w = JSON.stringify(want); const ok = g === w; if (!ok) fails++; console.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '\n     got  ' + g + '\n     want ' + w)); }
const act = n => Array.from({length:n}, (_, i) => 'Line ' + i + '.').join('\n\n');
const starts = t => P(t).map(p => p.line + ':' + p.ch);

eq('short script, one page', starts('.i HOUSE - DAY\n\nShe waits.'), []);
// 27 one line actions fill 53 lines (1 + 26 * 2), the 28th would end on 55
eq('28 actions: page 2 at the 28th', starts(act(28)), ['54:0']);
eq('notes take no space', starts(act(26) + '\n\n// a note\n// two\n\nLast.'), []);
// 26 actions = 51 lines, then a slugline needs 2 + 1 + 1 + 1 = 5 more: moves to page 2 with its action
eq('slugline never alone at the bottom', starts(act(26) + '\n\n.i HOUSE - DAY\n\nShe waits.'), ['52:0']);
eq('slugline fits with its action', starts(act(25) + '\n\n.i HOUSE - DAY\n\nShe waits.'), []);
// 26 actions = 51 lines; dialogue needs space 1 + cue 1 + line 1 = 3 -> 54 fits
eq('cue with one line fits exactly', starts(act(26) + '\n\n,ANNA,\nHi.'), []);
// 26 actions + cue + 2 sentences on 2 lines: 1+1+2 = 4 > 3; break needs cue + line + MORE = 3 + space = 4 > 3 -> whole dialogue moves
eq('cue never alone, whole dialogue moves', starts(act(26) + '\n\n,ANNA,\nHi.\nYes.'), ['52:0']);
// 24 actions = 47 lines; dialogue 1 + cue + 6 lines = 8 > 7 left; break after sentence 2: space+cue+2+MORE = 5 fits... largest fitting
eq('dialogue breaks at a sentence, (MORE) counted', starts(act(24) + '\n\n,ANNA,\nOne.\nTwo.\nThree.\nFour.\nFive.\nSix.'), ['53:0']);
// a page never ends with a parenthetical: break before it
eq('break falls before the parenthetical', starts(act(24) + '\n\n,ANNA,\nOne.\nTwo.\nThree.\n(quiet)\nFour.\nFive.\nSix.'), ['52:0']);
// action breaks inside a line at the end of a sentence
const long = 'He runs. ' + Array.from({length:12}, (_, i) => 'Then he stops number ' + i + ' and looks back.').join(' ');
const r = starts(act(25) + '\n\n' + long);
eq('long action breaks after a sentence inside its line', r.length === 1 && r[0].startsWith('50:') && +r[0].split(':')[1] > 0, true);
eq('the break lands right after a period', (() => { const ch = +r[0].split(':')[1]; return long.slice(ch - 2, ch); })(), '. ');
const many = act(300);
const pg = P(many);
eq('300 actions: 11 page starts (27 per page)', pg.length, Math.ceil(300 / 27) - 1);
const big = 'x'.repeat(10) + ' ' + Array.from({length:1000}, () => 'word').join(' ');
eq('element taller than a page is forced over pages', P(big).length >= 1, true);

eq('same without the notes', starts(act(26) + '\n\nLast.'), []);
eq('one more line with notes breaks', starts(act(27) + '\n\n// a note\n\nLast.'), ['56:0']);

eq('the title page takes no space', starts('---\nTitle: Night\n\nAuthor: F.\n---\n\n' + act(28)), ['60:0']);
eq('without its closing --- there is no title page', starts('---\nTitle: Night\n\n' + act(28)).length, 1);
eq('=== starts a new page', starts('One.\n\n===\n\nTwo.'), ['4:0']);
eq('=== right below text works too', starts('One.\n===\nTwo.'), ['2:0']);
eq('a section marker takes no space and breaks nothing', starts('=== Ending\n\n' + act(27) + '\n\n=== Ending'), []);
eq('=== at the very top adds no empty page', starts('===\n\nOne.'), []);

// Final Draft 13 reference (Untitled_Screenplay.pdf, A4): the same block four times; Final Draft starts page 2 at the
// second EXT. STREET - DAY and page 3 at the last JOHN of the fourth block
{
  const block = '.i HOUSE - DAY\n\n,JOHN,\n(slow)\nHallo.\n\nAction.\n\nAction.\n\nAction.\n\n,MARY,\nHallo.\n\n,JOHN,\nHallo.\n\nAction.\n\nAction.\n\n.t CUT TO:\n\n.e STREET - DAY\n\nAction.\n\nAction.\n\nAction.';
  const text = [block, block, block, block].join('\n\n'), lines = text.split('\n');
  const saved = global.__LINES;
  const src2 = src.replace('(global.__LINES || 58)', '58');
  const P58 = (function(){ eval(src2); return globalThis.__pg.paginate; })();
  const got = P58(text).map(p => lines[p.line]);
  const ex = lines.map((l, i) => [l, i]);
  const streets = ex.filter(x => x[0] === '.e STREET - DAY'), johns = ex.filter(x => x[0] === ',JOHN,');
  eq('Final Draft A4: page 2 at the second EXT. STREET', P58(text)[0].line, streets[1][1]);
  eq('Final Draft A4: page 3 at the last JOHN', P58(text)[1].line, johns[7][1]);
  // Page size on the title page: US Letter has 54 lines (A4 here has __LINES); the title page itself takes no space
{
  const pre = (size) => '---\n\n//TITLE PAGE\nTitle: X\n\n//SCRIPT SETTINGS\nPage size: ' + size + '\nLanguage: English\n\n---\n\n';
  const off = pre('A4').split('\n').length - 1;
  eq('US Letter: 54 lines, the 28th action starts page 2', P(pre('US Letter') + act(40)).map(p => p.line - off), [54]);
  eq('Deutsch labels read too: Seitenformat: US Letter', P(pre('x').replace('Page size: x', 'Seitenformat: US Letter') + act(40)).map(p => p.line - off), [54]);
}
eq('Final Draft A4: three pages', P58(text).length, 2);
}

// Printed layout (PDF): the same page breaks, (MORE) and (CONT'D), sluglines in the script's language
{
  const Lay = globalThis.__pg.layout;
  const big = act(24) + '\n\n,ANNA (V.O.),\n' + Array.from({length:12}, (_, i) => 'Sentence ' + i + ' is said here.').join('\n');
  const lay = Lay(big, true);
  eq('layout: page starts equal paginate', JSON.stringify(lay.starts), JSON.stringify(globalThis.__pg.paginate(big)));
  eq('layout: one page per start plus one', lay.pages.length, lay.starts.length + 1);
  const p1 = lay.pages[0], p2 = lay.pages[1];
  eq('layout: (MORE) at the bottom under the dialogue', p1[p1.length - 1].kind + ' ' + p1[p1.length - 1].s, 'cue (MORE)');
  eq('layout: (MORE) is on the last counted line or above', p1[p1.length - 1].y < 58, true);
  eq("layout: cue with (CONT'D) on top of the next page", p2[0].y + ' ' + p2[0].kind + ' ' + p2[0].s, "0 cue ANNA (V.O.) (CONT'D)");
  const de = '---\n\n//TITELSEITE\nTitel: X\nAutor:in: Y\n\n//EINSTELLUNGEN\nSeitenformat: A4\nSprache: Deutsch\n\n---\n\n.ie auto - tag\n\nShe waits.\n\n// note\n\n.t cut to:\n\n,anna,\n(quiet)\nHi.';
  const d = Lay(de, true).pages[0].map(x => x.y + ' ' + x.kind + ' ' + x.s);
  eq('layout: German slugline word, note not printed, transition in capitals, title and author read',
    JSON.stringify(d) + ' ' + Lay(de, true).title + '/' + Lay(de, true).author,
    JSON.stringify(['0 act INNEN/AUSSEN. AUTO - TAG', '2 act She waits.', '4 trans CUT TO:', '6 cue ANNA', '7 par (quiet)', '8 dlg Hi.']) + ' X/Y');
  eq('layout: English I/E. without a title page', Lay('.ie car - day', true).pages[0][0].s, 'I/E. CAR - DAY');
}

{
  const Lay = globalThis.__pg.layout;
  const t = '.i ROOM - DAY\n\n,VALERIA,\nOkay.\n\nShe checks her wallet.\n\n,VALERIA,\nGoodbye.\n\n,JASON,\nBye.\n\n,VALERIA (V.O.),\nNo.\n\n.e STREET - DAY\n\n,VALERIA,\nHi.\n\n.s THE PHONE RINGS\n\nAction.';
  const pg = Lay(t, true).pages[0].map(x => x.y + ' ' + x.s);
  eq("layout: (CONT'D) for the same character again in the scene, not after another cue or a new scene; two lines before a shot",
    JSON.stringify(pg.filter(x => /VALERIA|JASON|PHONE/.test(x))),
    JSON.stringify(['2 VALERIA', "7 VALERIA (CONT'D)", '10 JASON', '13 VALERIA (V.O.)', '19 VALERIA', '23 THE PHONE RINGS']));
}

{
  const Lay = globalThis.__pg.layout;
  const head = (lang) => '---\n\n//X\nTitle: A\nAuthor: \n\nPage size: A4\nLanguage: ' + lang + '\n\n---\n\n';
  const t = '.i ROOM - DAY\n\n,VALERIA,\nOkay.\n\nShe waits.\n\n,VALERIA,\nGoodbye.';
  const cues = (lang) => Lay(head(lang) + t, true).pages[0].filter(x => x.kind === 'cue').map(x => x.s).join(' | ');
  eq("layout: (CONT'D) in the script's language", ['English', 'Deutsch', 'Français', 'Italiano'].map(cues).join(' / '),
    "VALERIA | VALERIA (CONT'D) / VALERIA | VALERIA (WEITER) / VALERIA | VALERIA (SUITE) / VALERIA | VALERIA (CONT.)");
  eq('layout: a typed (WEITER) is not doubled', Lay(head('Deutsch') + '.i ROOM - DAY\n\n,VALERIA,\nOkay.\n\nShe waits.\n\n,VALERIA (WEITER),\nGoodbye.', true).pages[0].filter(x => x.kind === 'cue').map(x => x.s).join(' | '), 'VALERIA | VALERIA (WEITER)');
}

{
  const Lay = globalThis.__pg.layout;
  const head = (lang) => '---\n\n//X\nTitle: A\nAuthor: \n\nPage size: A4\nLanguage: ' + lang + '\n\n---\n\n';
  const big = act(24) + '\n\n,ANNA,\n' + Array.from({length:12}, (_, i) => 'Sentence ' + i + ' is said here.').join('\n');
  const more = (lang) => { const p = Lay(head(lang) + big, true).pages; const a = p[0][p[0].length - 1], b = p[1][0]; return a.s + ' ' + b.s; };
  eq('layout: (MORE) and (CONT\'D) in the script\'s language', ['English', 'Deutsch', 'Français', 'Italiano'].map(more).join(' / '),
    "(MORE) ANNA (CONT'D) / (MEHR) ANNA (WEITER) / (À SUIVRE) ANNA (SUITE) / (CONTINUA) ANNA (CONT.)");
}

{
  const Lay = globalThis.__pg.layout;
  const t = '.i ROOM - DAY\n\n,VALERIA,\nOkay.\n\n.s HER HAND\n\n,VALERIA,\nGoodbye.\n\nShe leaves.\n\n,VALERIA,\nBye.';
  eq("layout: no (CONT'D) across a shot, again after action", Lay(t, true).pages[0].filter(x => x.kind === 'cue').map(x => x.s).join(' | '), "VALERIA | VALERIA | VALERIA (CONT'D)");
}

console.log(fails ? fails + ' failed' : 'all passed');
process.exitCode = fails ? 1 : 0;
