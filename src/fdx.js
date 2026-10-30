// Final Draft (.fdx) import: reads the XML of a Final Draft script into scriptin's markup. Pure functions (no editor),
// so the tests can call them; the editor (src/editor.js) adds the title page, cuts to the page limit and puts it in.
//
// Final Draft's elements and what they become (as agreed for scriptin Machine):
//   Scene Heading            .i .e .ie .ei (from INT. EXT. INT./EXT. and the German, French and Italian words);
//                            a heading without one of them stays as action
//   Action, General          action
//   Character                ,NAME (EXT),  V.O., O.S. and O.C. in the script's language, (CONT'D) dropped
//                            (scriptin adds its own), any other extension kept as written
//   Parenthetical, Dialogue  the lines below the cue
//   Transition               .t      Shot  .s
//   New Act, End of Act      .act_new  .act_end
//   Note, Summary, Outline 1 to 3, Sequence   // notes (hidden with Cmd+Option+6)
//   Cast List                dropped
//   anything else            action
// Italic and underlined text keep their emphasis (*italic*, _underlined_); bold is dropped. Dual dialogue becomes
// two dialogues one after the other.

// Words that only one language uses often: the language with the most of them in the script wins. Languages scriptin
// does not support are counted too, so a Spanish script is recognised as Spanish and refused, not taken for French
var STOP = {
  en:'the and you is to of it that he she his her with what this are was for have at be not',
  de:'der die das und ist nicht ich sie er ein eine zu mit den dem auf du es was wir sich auch',
  fr:'le la les et est pas je vous une des du il elle que qui dans sur ce ne au tu nous',
  it:'il la che non è di un una per sono mi ti gli lo della con come ma si io lei cosa',
  es:'el los las que y en es por una pero con lo se del muy su está qué yo tú',
  pt:'o os as que não uma você é com para do da em ele ela eu está muito',
  nl:'de het een en niet ik je van dat is zijn op hij ze wat met maar'
};
var STOP_SETS = {};
Object.keys(STOP).forEach(function(k){ var s = {}; STOP[k].split(' ').forEach(function(w){ s[w] = 1; }); STOP_SETS[k] = s; });

var NOTE_TYPES = {'note':1, 'summary':1, 'outline 1':1, 'outline 2':1, 'outline 3':1, 'sequence':1, 'outline body':1};
// Scene heading words: .ie / .ei first (they begin with the shorter ones)
var SLUG_WORDS = [
  [/^(INT\.?\s*\/\s*EXT\.?|INT\.?\s*\/\s*EST\.?|I\s*\/\s*E\.?|INNEN\s*\/\s*AU(SS|ß)EN\.?)(?=[\s.\-–—]|$)/i, 'ie'],
  [/^(EXT\.?\s*\/\s*INT\.?|EST\.?\s*\/\s*INT\.?|E\s*\/\s*I\.?|AU(SS|ß)EN\s*\/\s*INNEN\.?)(?=[\s.\-–—]|$)/i, 'ei'],
  [/^(INT\.?|INNEN\.?)(?=[\s.\-–—]|$)/i, 'i'],
  [/^(EXT\.?|EST\.?|AU(SS|ß)EN\.?)(?=[\s.\-–—]|$)/i, 'e']
];

// The text of one Final Draft paragraph with its emphasis as scriptin markers
function paraText(p){
  var runs = [];
  Array.prototype.forEach.call(p.childNodes, function(n){
    if (n.nodeType !== 1 || n.nodeName !== 'Text') return;
    var st = n.getAttribute('Style') || '', t = (n.textContent || '').replace(/[\t\r\n ]+/g, ' ');
    if (/AllCaps/i.test(st)) t = t.toUpperCase();
    var u = /Underline/i.test(st), i = /Italic/i.test(st), last = runs[runs.length - 1];
    if (last && last.u === u && last.i === i) last.t += t; else runs.push({t:t, u:u, i:i});
  });
  var out = '';
  runs.forEach(function(r){
    var core = r.t.trim(), lead = r.t.slice(0, r.t.length - r.t.replace(/^\s+/, '').length), tail = r.t.slice(lead.length + core.length);
    // markers only where scriptin reads them as markers: at word boundaries
    var before = (out + lead).slice(-1), wordBefore = /[0-9A-Za-zÀ-ɏ]/.test(before);
    if (!core || (!r.u && !r.i) || wordBefore){ out += r.t; return; }
    var m = (r.u ? '_' : '') + (r.i ? '*' : ''), mc = (r.i ? '*' : '') + (r.u ? '_' : '');
    out += lead + m + core + mc + tail;
  });
  return out.replace(/\s+/g, ' ').trim();
}
function typeOf(p){ return (p.getAttribute('Type') || '').trim().toLowerCase(); }

// All paragraphs of the script in order, dual dialogue flattened
function paragraphsOf(content){
  var out = [];
  (function walk(node){
    Array.prototype.forEach.call(node.childNodes, function(n){
      if (n.nodeType !== 1) return;
      if (n.nodeName === 'Paragraph'){
        var dual = Array.prototype.filter.call(n.childNodes, function(c){ return c.nodeType === 1 && c.nodeName === 'DualDialogue'; });
        if (dual.length){ dual.forEach(walk); return; }
        out.push({type:typeOf(n), text:paraText(n)});
      } else if (n.nodeName === 'DualDialogue') walk(n);
    });
  })(content);
  return out;
}

// The script's language from its words and from the words of its elements (scene headings, times of day, extensions,
// transitions); null when it is a language scriptin does not support
function detectLang(paras, LANGS){
  var score = {en:0, de:0, fr:0, it:0, es:0, pt:0, nl:0}, words = 0;
  paras.forEach(function(p){
    if (p.type === 'action' || p.type === 'dialogue' || p.type === 'general' || p.type === 'parenthetical'){
      (p.text.toLowerCase().match(/[a-zà-öø-ÿœ]+/g) || []).forEach(function(w){
        words++;
        for (var k in STOP_SETS) if (STOP_SETS[k][w]) score[k]++;
      });
    }
  });
  function hint(code, n){ score[code] += n; }
  paras.forEach(function(p){
    var u = p.text.toUpperCase();
    if (p.type === 'scene heading'){
      if (/^INNEN|^AU(SS|ß)EN/.test(u)) hint('de', 5);
      if (/^EST\.|\/\s*EST\./.test(u)) hint('it', 5);
      // the time of day at the end, when only one language uses that word (MAGIC HOUR and CONTINUOUS are in several)
      var tail = u.split(/\s+[-–—]+\s*|[-–—]+\s+/).pop().trim();
      var users = LANGS.filter(function(L){ return L.time.indexOf(tail) >= 0; });
      if (users.length === 1) hint(users[0].code, 3);
    }
    if (p.type === 'character'){
      if (/\(\s*OFF\s*\)/.test(u)) hint('de', 2);
      if (/\(\s*(VOIX OFF|H\.C\.)\s*\)/.test(u)) hint('fr', 2);
      if (/\(\s*F\.C\.\s*\)/.test(u)) hint('it', 2);
      if (/\(\s*(O\.S\.|O\.C\.)\s*\)/.test(u)) hint('en', 2);
    }
    if (p.type === 'transition') LANGS.forEach(function(L){ if (L.trans.indexOf(u.replace(/\s+/g, ' ').trim()) >= 0 && !/^(MATCH|JUMP) CUT/.test(u)) hint(L.code, 2); });
  });
  var best = null, second = 0;
  Object.keys(score).forEach(function(k){ if (!best || score[k] > score[best]){ second = best ? score[best] : 0; best = k; } else if (score[k] > second) second = score[k]; });
  // nothing to go by (a page of scene headings only): English, scriptin's default
  if (!score[best]) return LANGS[0];
  var L = LANGS.filter(function(x){ return x.code === best; })[0];
  return L || null;
}

// Name and extensions of a Final Draft cue: DAVID (V.O.) (CONT'D)
function cueOf(text, L, LANGS, extIndex){
  var name = text.replace(/\([^)]*\)?/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase(), exts = [];
  (text.match(/\(([^)]*)\)?/g) || []).forEach(function(x){
    var e = x.replace(/^\(|\)$/g, '').trim().toUpperCase().replace(/[’‘ʼ`´]/g, "'");
    if (!e) return;
    // (CONT'D) in any language or spelling: scriptin prints its own
    if (/^CONT'?D\.?$|^CONT\.?$|^CONTINUED$|^WEITER$|^SUITE$|^CONT'D$/.test(e) || LANGS.some(function(M){ return M.ext[3] === e; })) return;
    var i = extIndex(e);
    exts.push(i >= 0 && i < 3 ? L.ext[i] : e);
  });
  return ',' + name + (exts.length ? ' (' + exts[0] + ')' : '') + ',';
}

function slugOf(text){
  var t = text.trim();
  for (var k = 0; k < SLUG_WORDS.length; k++){
    var m = t.match(SLUG_WORDS[k][0]);
    if (m) return ('.' + SLUG_WORDS[k][1] + ' ' + t.slice(m[0].length).replace(/^[\s.\-–—]+/, '')).trim();
  }
  return null;
}

// Title and author from the title page: the first line is the title, the author follows a "Written by" line
function titlePageOf(doc){
  var tp = doc.getElementsByTagName('TitlePage')[0], title = '', author = '', content = null;
  // only the page itself (its Content), not its header and footer (the page number there is a lone period)
  if (tp) Array.prototype.forEach.call(tp.childNodes, function(n){ if (n.nodeType === 1 && n.nodeName === 'Content' && !content) content = n; });
  if (!content) return {title:title, author:author};
  var lines = Array.prototype.filter.call(content.childNodes, function(n){ return n.nodeType === 1 && n.nodeName === 'Paragraph'; }).map(paraText).map(function(s){ return s.replace(/[_*]/g, '').trim(); }).filter(Boolean);
  if (lines.length) title = lines[0];
  // the credit line alone (Written by) with the name on the next line, or with the name after it on the same line
  var CREDIT = /^((written|screenplay|story|teleplay)\s+by|by|(drehbuch|geschrieben|buch)(\s+von)?|von|(écrit|scénario)\s+(par|de)|par|(scritto|sceneggiatura|soggetto)\s+(da|di)|di)\b\s*:?\s*/i;
  for (var i = 1; i < lines.length; i++){
    var m = lines[i].match(CREDIT);
    if (!m) continue;
    author = lines[i].slice(m[0].length).trim() || lines[i + 1] || '';
    break;
  }
  return {title:title, author:author};
}

// US Letter or A4 from the page layout (11 inch high is US Letter); null when the file does not say
function sizeOfDoc(doc){
  var pl = doc.getElementsByTagName('PageLayout')[0], h = NaN;
  ['PageSize', 'PaperSize'].forEach(function(n){ var e = doc.getElementsByTagName(n)[0]; if (e && isNaN(h)) h = parseFloat(e.getAttribute('Height')); });
  if (isNaN(h) && pl) h = parseFloat(pl.getAttribute('PageHeight') || pl.getAttribute('Height'));
  if (isNaN(h)) return null;
  return Math.abs(h - 11) < 0.2 ? 'US Letter' : 'A4';
}

// The script in scriptin's markup, without title page: {ok:true, body, lang, title, author, size} or
// {ok:false, reason:'notfdx' | 'language'}
export function readFdx(xml, DOMParserCtor, LANGS, extIndex){
  var doc;
  try { doc = new DOMParserCtor().parseFromString(xml, 'application/xml'); } catch (e){ return {ok:false, reason:'notfdx'}; }
  var root = doc && doc.documentElement;
  if (!root || root.nodeName !== 'FinalDraft' || doc.getElementsByTagName('parsererror').length) return {ok:false, reason:'notfdx'};
  var content = null;
  Array.prototype.forEach.call(root.childNodes, function(n){ if (n.nodeType === 1 && n.nodeName === 'Content' && !content) content = n; });
  if (!content) return {ok:false, reason:'notfdx'};
  var paras = paragraphsOf(content), L = detectLang(paras, LANGS);
  if (!L) return {ok:false, reason:'language'};
  var blocks = [], dlg = null;
  paras.forEach(function(p){
    var t = p.text, ty = p.type;
    if (ty === 'parenthetical' || ty === 'dialogue'){
      if (!t) return;
      if (ty === 'parenthetical' && !/^\(/.test(t)) t = '(' + t + ')';
      if (dlg){ dlg.push(t); return; }
      blocks.push([t]); return;
    }
    dlg = null;
    if (!t || ty === 'cast list') return;
    if (ty === 'character'){ dlg = [cueOf(t, L, LANGS, extIndex)]; blocks.push(dlg); return; }
    if (ty === 'scene heading'){ var sl = slugOf(t); blocks.push([sl ? sl.replace(/^(\.\w+ )(.*)$/, function(_, a, b){ return a + b.toUpperCase(); }) : t.toUpperCase()]); return; }
    if (ty === 'transition'){ blocks.push(['.t ' + t.toUpperCase()]); return; }
    if (ty === 'shot'){ blocks.push(['.s ' + t.toUpperCase()]); return; }
    if (ty === 'new act'){ blocks.push(['.act_new ' + t.toUpperCase()]); return; }
    if (ty === 'end of act'){ blocks.push(['.act_end ' + t.toUpperCase()]); return; }
    if (NOTE_TYPES[ty]){ blocks.push(['// ' + t]); return; }
    blocks.push([t]);
  });
  var body = blocks.map(function(b){ return b.join('\n'); }).join('\n\n');
  var tp = titlePageOf(doc);
  return {ok:true, body:body, lang:L, title:tp.title, author:tp.author, size:sizeOfDoc(doc)};
}

// ---- Export (/fdx): the script as a Final Draft file ----
// Final Draft 13's settings for every element (fonts, indents, spacing), taken from a Final Draft 13 export, so Final
// Draft lays the script out as its own
var ELEMENT_SETTINGS = "<ElementSettings Type=\"General\"><FontSpec AdornmentStyle=\"0\" Font=\"Courier Final Draft\" RevisionID=\"0\" Size=\"12\" Style=\"\"/><ParagraphSpec Alignment=\"Left\" FirstIndent=\"0.00\" Leading=\"Regular\" LeftIndent=\"1.50\" RightIndent=\"7.50\" SpaceBefore=\"0\" Spacing=\"1\" StartsNewPage=\"No\" Type=\"General\"/><Behavior PaginateAs=\"General\" ReturnKey=\"General\" Shortcut=\"0\" TabKey=\"General\" WinShortcut=\"0\"/><Outline CanHide=\"No\" Level=\"1\"/></ElementSettings><ElementSettings Type=\"Scene Heading\"><FontSpec AdornmentStyle=\"0\" Font=\"Courier Final Draft\" RevisionID=\"0\" Size=\"12\" Style=\"AllCaps\"/><ParagraphSpec Alignment=\"Left\" FirstIndent=\"0.00\" Leading=\"Regular\" LeftIndent=\"1.50\" RightIndent=\"7.50\" SpaceBefore=\"24\" Spacing=\"1\" StartsNewPage=\"No\" Type=\"Scene Heading\"/><Behavior PaginateAs=\"Scene Heading\" ReturnKey=\"Action\" Shortcut=\"1\" TabKey=\"Action\" WinShortcut=\"1\"/><Outline CanHide=\"No\" Level=\"2\"/></ElementSettings><ElementSettings Type=\"Action\"><FontSpec AdornmentStyle=\"0\" Font=\"Courier Final Draft\" RevisionID=\"0\" Size=\"12\" Style=\"\"/><ParagraphSpec Alignment=\"Left\" FirstIndent=\"0.00\" Leading=\"Regular\" LeftIndent=\"1.50\" RightIndent=\"7.50\" SpaceBefore=\"12\" Spacing=\"1\" StartsNewPage=\"No\" Type=\"Action\"/><Behavior PaginateAs=\"Action\" ReturnKey=\"Action\" Shortcut=\"2\" TabKey=\"Character\" WinShortcut=\"2\"/><Outline CanHide=\"No\" Level=\"1\"/></ElementSettings><ElementSettings Type=\"Character\"><FontSpec AdornmentStyle=\"0\" Font=\"Courier Final Draft\" RevisionID=\"0\" Size=\"12\" Style=\"AllCaps\"/><ParagraphSpec Alignment=\"Left\" FirstIndent=\"0.00\" Leading=\"Regular\" LeftIndent=\"3.50\" RightIndent=\"7.25\" SpaceBefore=\"12\" Spacing=\"1\" StartsNewPage=\"No\" Type=\"Character\"/><Behavior PaginateAs=\"Character\" ReturnKey=\"Dialogue\" Shortcut=\"3\" TabKey=\"Transition\" WinShortcut=\"3\"/><Outline CanHide=\"No\" Level=\"1\"/></ElementSettings><ElementSettings Type=\"Parenthetical\"><FontSpec AdornmentStyle=\"0\" Font=\"Courier Final Draft\" RevisionID=\"0\" Size=\"12\" Style=\"\"/><ParagraphSpec Alignment=\"Left\" FirstIndent=\"-0.10\" Leading=\"Regular\" LeftIndent=\"3.00\" RightIndent=\"5.50\" SpaceBefore=\"0\" Spacing=\"1\" StartsNewPage=\"No\" Type=\"Parenthetical\"/><Behavior PaginateAs=\"Parenthetical\" ReturnKey=\"Dialogue\" Shortcut=\"4\" TabKey=\"Dialogue\" WinShortcut=\"4\"/><Outline CanHide=\"No\" Level=\"1\"/></ElementSettings><ElementSettings Type=\"Dialogue\"><FontSpec AdornmentStyle=\"0\" Font=\"Courier Final Draft\" RevisionID=\"0\" Size=\"12\" Style=\"\"/><ParagraphSpec Alignment=\"Left\" FirstIndent=\"0.00\" Leading=\"Regular\" LeftIndent=\"2.50\" RightIndent=\"6.00\" SpaceBefore=\"0\" Spacing=\"1\" StartsNewPage=\"No\" Type=\"Dialogue\"/><Behavior PaginateAs=\"Dialogue\" ReturnKey=\"Action\" Shortcut=\"5\" TabKey=\"Parenthetical\" WinShortcut=\"5\"/><Outline CanHide=\"No\" Level=\"1\"/></ElementSettings><ElementSettings Type=\"Transition\"><FontSpec AdornmentStyle=\"0\" Font=\"Courier Final Draft\" RevisionID=\"0\" Size=\"12\" Style=\"AllCaps\"/><ParagraphSpec Alignment=\"Right\" FirstIndent=\"0.00\" Leading=\"Regular\" LeftIndent=\"5.50\" RightIndent=\"7.10\" SpaceBefore=\"12\" Spacing=\"1\" StartsNewPage=\"No\" Type=\"Transition\"/><Behavior PaginateAs=\"Transition\" ReturnKey=\"Scene Heading\" Shortcut=\"6\" TabKey=\"Scene Heading\" WinShortcut=\"6\"/><Outline CanHide=\"No\" Level=\"1\"/></ElementSettings><ElementSettings Type=\"Shot\"><FontSpec AdornmentStyle=\"0\" Font=\"Courier Final Draft\" RevisionID=\"0\" Size=\"12\" Style=\"AllCaps\"/><ParagraphSpec Alignment=\"Left\" FirstIndent=\"0.00\" Leading=\"Regular\" LeftIndent=\"1.50\" RightIndent=\"7.50\" SpaceBefore=\"12\" Spacing=\"1\" StartsNewPage=\"No\" Type=\"Shot\"/><Behavior PaginateAs=\"Scene Heading\" ReturnKey=\"Action\" Shortcut=\"7\" TabKey=\"Action\" WinShortcut=\"7\"/><Outline CanHide=\"No\" Level=\"1\"/></ElementSettings><ElementSettings Type=\"Cast List\"><FontSpec AdornmentStyle=\"0\" Font=\"Courier Final Draft\" RevisionID=\"0\" Size=\"12\" Style=\"AllCaps\"/><ParagraphSpec Alignment=\"Left\" FirstIndent=\"0.00\" Leading=\"Regular\" LeftIndent=\"1.50\" RightIndent=\"7.50\" SpaceBefore=\"0\" Spacing=\"1\" StartsNewPage=\"No\" Type=\"Cast List\"/><Behavior PaginateAs=\"Action\" ReturnKey=\"Action\" Shortcut=\"8\" TabKey=\"Action\" WinShortcut=\"8\"/><Outline CanHide=\"No\" Level=\"1\"/></ElementSettings><ElementSettings Type=\"New Act\"><FontSpec AdornmentStyle=\"0\" Font=\"Courier Final Draft\" RevisionID=\"0\" Size=\"12\" Style=\"Bold+Underline+AllCaps\"/><ParagraphSpec Alignment=\"Center\" FirstIndent=\"0.00\" Leading=\"Regular\" LeftIndent=\"1.00\" RightIndent=\"7.50\" SpaceBefore=\"12\" Spacing=\"1\" StartsNewPage=\"Yes\" Type=\"New Act\"/><Behavior PaginateAs=\"Scene Heading\" ReturnKey=\"Scene Heading\" Shortcut=\"9\" TabKey=\"Scene Heading\" WinShortcut=\"9\"/><Outline CanHide=\"No\" Level=\"6\"/></ElementSettings><ElementSettings Type=\"Sequence\"><FontSpec AdornmentStyle=\"0\" Font=\"Courier Final Draft\" RevisionID=\"0\" Size=\"12\" Style=\"Bold+Underline+AllCaps\"/><ParagraphSpec Alignment=\"Left\" FirstIndent=\"0.00\" Leading=\"Regular\" LeftIndent=\"1.25\" RightIndent=\"7.50\" SpaceBefore=\"24\" Spacing=\"1\" StartsNewPage=\"No\" Type=\"Sequence\"/><Behavior PaginateAs=\"Scene Heading\" ReturnKey=\"Scene Heading\" Shortcut=\"Ctrl+8\" TabKey=\"Scene Heading\" WinShortcut=\"Shift+8\"/><Outline CanHide=\"No\" Level=\"4\"/></ElementSettings><ElementSettings Type=\"End of Act\"><FontSpec AdornmentStyle=\"0\" Font=\"Courier Final Draft\" RevisionID=\"0\" Size=\"12\" Style=\"Bold+Underline+AllCaps\"/><ParagraphSpec Alignment=\"Center\" FirstIndent=\"0.00\" Leading=\"Regular\" LeftIndent=\"1.00\" RightIndent=\"7.50\" SpaceBefore=\"24\" Spacing=\"1\" StartsNewPage=\"No\" Type=\"End of Act\"/><Behavior PaginateAs=\"Character\" ReturnKey=\"New Act\" Shortcut=\"Ctrl+9\" TabKey=\"New Act\" WinShortcut=\"Shift+9\"/><Outline CanHide=\"No\" Level=\"6\"/></ElementSettings><ElementSettings Type=\"Summary\"><FontSpec AdornmentStyle=\"0\" Color=\"#87878F8FE0E0\" Font=\"Arial\" RevisionID=\"0\" Size=\"12\" Style=\"HiddenText\"/><ParagraphSpec Alignment=\"Left\" FirstIndent=\"0.00\" Leading=\"Regular\" LeftIndent=\"0.88\" RightIndent=\"7.50\" SpaceBefore=\"12\" Spacing=\"1\" StartsNewPage=\"No\" Type=\"Summary\"/><Behavior PaginateAs=\"Outline Body\" ReturnKey=\"Summary\" Shortcut=\"Ctrl+0\" TabKey=\"Outline 1\" WinShortcut=\"Shift+0\"/><Outline CanHide=\"Yes\" Level=\"0\"/></ElementSettings><ElementSettings Type=\"Outline 1\"><FontSpec AdornmentStyle=\"0\" Color=\"#87878F8FE0E0\" Font=\"Arial\" RevisionID=\"0\" Size=\"16\" Style=\"Bold+HiddenText\"/><ParagraphSpec Alignment=\"Left\" FirstIndent=\"0.00\" Leading=\"Regular\" LeftIndent=\"0.88\" RightIndent=\"7.50\" SpaceBefore=\"16\" Spacing=\"1\" StartsNewPage=\"No\" Type=\"Outline 1\"/><Behavior PaginateAs=\"Outline\" ReturnKey=\"Summary\" Shortcut=\"Ctrl+1\" TabKey=\"Outline 2\" WinShortcut=\"Shift+1\"/><Outline CanHide=\"Yes\" Level=\"7\"/></ElementSettings><ElementSettings Type=\"Outline 2\"><FontSpec AdornmentStyle=\"0\" Color=\"#87878F8FE0E0\" Font=\"Arial\" RevisionID=\"0\" Size=\"14\" Style=\"Bold+HiddenText\"/><ParagraphSpec Alignment=\"Left\" FirstIndent=\"0.00\" Leading=\"Regular\" LeftIndent=\"1.12\" RightIndent=\"7.50\" SpaceBefore=\"14\" Spacing=\"1\" StartsNewPage=\"No\" Type=\"Outline 2\"/><Behavior PaginateAs=\"Outline\" ReturnKey=\"Summary\" Shortcut=\"Ctrl+2\" TabKey=\"Outline 3\" WinShortcut=\"Shift+2\"/><Outline CanHide=\"Yes\" Level=\"5\"/></ElementSettings><ElementSettings Type=\"Outline 3\"><FontSpec AdornmentStyle=\"0\" Color=\"#87878F8FE0E0\" Font=\"Arial\" RevisionID=\"0\" Size=\"12\" Style=\"Bold+HiddenText\"/><ParagraphSpec Alignment=\"Left\" FirstIndent=\"0.00\" Leading=\"Regular\" LeftIndent=\"1.38\" RightIndent=\"7.50\" SpaceBefore=\"12\" Spacing=\"1\" StartsNewPage=\"No\" Type=\"Outline 3\"/><Behavior PaginateAs=\"Outline\" ReturnKey=\"Summary\" Shortcut=\"Ctrl+3\" TabKey=\"Note\" WinShortcut=\"Shift+3\"/><Outline CanHide=\"Yes\" Level=\"3\"/></ElementSettings><ElementSettings Type=\"Note\"><FontSpec AdornmentStyle=\"0\" Color=\"#87878F8FE0E0\" Font=\"Arial\" RevisionID=\"0\" Size=\"12\" Style=\"Italic+HiddenText\"/><ParagraphSpec Alignment=\"Left\" FirstIndent=\"0.00\" Leading=\"Regular\" LeftIndent=\"1.62\" RightIndent=\"7.50\" SpaceBefore=\"12\" Spacing=\"1\" StartsNewPage=\"No\" Type=\"Note\"/><Behavior PaginateAs=\"Outline\" ReturnKey=\"Summary\" Shortcut=\"Ctrl+4\" TabKey=\"Summary\" WinShortcut=\"Shift+4\"/><Outline CanHide=\"Yes\" Level=\"1\"/></ElementSettings>";
function xmlEsc(s){ return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function uuid(){
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c){ var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });
}
// doc: {title, author, credit, letter, paras: [{type: Final Draft element type, segs: [{t, u, i}], newPage}]}
export function writeFdx(doc){
  var body = doc.paras.map(function(p){
    var runs = p.segs.filter(function(g){ return g.t !== ''; }).map(function(g){
      var st = (g.i ? 'Italic' : '') + (g.i && g.u ? '+' : '') + (g.u ? 'Underline' : '');
      return '      <Text' + (st ? ' Style="' + st + '"' : '') + '>' + xmlEsc(g.t) + '</Text>';
    });
    return '    <Paragraph Type="' + p.type + '"' + (p.newPage ? ' StartsNewPage="Yes"' : '') + ' id="' + uuid() + '">\n' + (runs.length ? runs.join('\n') : '      <Text></Text>') + '\n    </Paragraph>';
  });
  // Title page as Final Draft lays out its own: the title on line 18, the credit 4 lines below, the author 3 below that
  function tp(t, st){ return '      <Paragraph Alignment="Center" FirstIndent="0.00" Leading="Regular" LeftIndent="1.00" RightIndent="7.50" SpaceBefore="0" Spacing="1" StartsNewPage="No" id="' + uuid() + '">' + (t ? '<Text' + (st ? ' Style="' + st + '"' : '') + '>' + xmlEsc(t) + '</Text>' : '') + '</Paragraph>'; }
  var title = [];
  if (doc.title || doc.author){
    for (var k = 0; k < 17; k++) title.push(tp(''));
    title.push(tp(doc.title, 'Underline+AllCaps'), tp(''), tp(''), tp(''), tp(doc.author ? doc.credit : ''), tp(''), tp(''), tp(doc.author));
  }
  return '<?xml version="1.0" encoding="UTF-8" standalone="no" ?>\n<FinalDraft DocumentType="Script" Template="No" Version="6">\n\n  <Content>\n' + body.join('\n') + '\n  </Content>\n\n' +
    '  <PageLayout BottomMargin="72" BreakDialogueAndActionAtSentences="Yes" DocumentLeading="Normal" FooterMargin="36" HeaderMargin="36" TopMargin="72" UsesSmartQuotes="Yes">\n' +
    '    <PageSize Height="' + (doc.letter ? '11.00' : '11.69') + '" Width="' + (doc.letter ? '8.50' : '8.27') + '"/>\n  </PageLayout>\n\n  ' + ELEMENT_SETTINGS + '\n\n' +
    '  <TitlePage>\n    <Content>\n' + title.join('\n') + '\n    </Content>\n  </TitlePage>\n\n</FinalDraft>\n';
}
