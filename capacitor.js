// scriptin Machine editor (Capacitor). Colors come from window.SM_THEME, set in the Bubble element htmlCapacitor.
(function(){
  var T = window.SM_THEME || {};
  // Folder this file was loaded from (the same commit on jsDelivr): the PDF export loads jsPDF and Courier Prime from there
  var SELF = (function(){
    var c = document.currentScript, src = c && c.src;
    if (!src && document.querySelectorAll){ var all = document.querySelectorAll('script[src*="scriptin-capacitor"]'); src = all.length ? all[all.length - 1].src : ''; }
    return (src || '').replace(/[^\/]*$/, '');
  })();
  // Printed line lengths in characters (Cole & Haag, 10 cpi)
  var W_ACTION = 55, W_DIALOG = 35, W_PAREN = 19;
  var PAD = 32; // 16px left + 16px right inside each line
  var EXT = ['V.O.', 'O.S.', 'O.C.', "CONT'D"];
  // Tab ring for empty elements: slug INT, slug EXT, action, dialogue, action
  var RING = ['.i ', '.e ', '', ',,', ''];
  var ORIGIN = '+smtab';
  var FIND_MS = 800, FIND_PX = 32;
  var SHOT = /^\.s(\s|$)/i;
  // Transition: .t at the start of a paragraph, right aligned at the page edge; not part of the Tab ring
  var TRANS = /^\.t(\s|$)/i;
  // Note: paragraph starting with //, belongs to the element above it; blue, hidden and shown with Cmd+Option+6 (Ctrl+Shift+6)
  var NOTE = /^\/\//;
  // Title page: a block that starts with --- on the very first line and ends with the next ---; everything between the
  // two is title page, everything after the closing --- is script. One line per command: a line that starts with a word
  // and a colon (Title:, Author:) is a command, a line without one continues the command above (a second address line).
  // colorBlue, no space in the pagination, hidden until Cmd+Option+9 (Ctrl+Shift+9)
  var FENCE = /^---\s*$/, CMD = /^[A-Za-zÀ-ÿ][\wÀ-ÿ ]*:/;
  // Script settings on the title page. Language names the headings and commands of the title page in that language, and
  // (for the export, still to come) how .i .e .ie .ei are printed; English and A4 by default.
  // Up/Down on an active Page size or Language line steps through the values
  var LANGS = [
    {name:'English', code:'en', head:{title:'TITLE PAGE', settings:'SETTINGS'}, cmd:{title:'Title', author:'Author', size:'Page size', lang:'Language'}, slug:{I:'INT.', E:'EXT.', IE:'I/E.', EI:'I/E.'}, credit:'Written by'},
    {name:'Deutsch', code:'de', head:{title:'TITELSEITE', settings:'EINSTELLUNGEN'}, cmd:{title:'Titel', author:'Autor:in', size:'Seitenformat', lang:'Sprache'}, slug:{I:'INNEN.', E:'AUSSEN.', IE:'INNEN/AUSSEN.', EI:'INNEN/AUSSEN.'}, credit:'Drehbuch von'},
    {name:'Français', code:'fr', head:{title:'PAGE DE TITRE', settings:'PARAMÈTRES'}, cmd:{title:'Titre', author:'Auteur', size:'Format', lang:'Langue'}, slug:{I:'INT.', E:'EXT.', IE:'INT./EXT.', EI:'INT./EXT.'}, credit:'Scénario de'},
    {name:'Italiano', code:'it', head:{title:'FRONTESPIZIO', settings:'IMPOSTAZIONI'}, cmd:{title:'Titolo', author:'Autore', size:'Formato', lang:'Lingua'}, slug:{I:'INT.', E:'EST.', IE:'INT./EST.', EI:'INT./EST.'}, credit:'Sceneggiatura di'}
  ];
  var SIZES = ['A4', 'US Letter'];
  function preTemplate(L){
    return '---\n\n//' + L.head.title + '\n' + L.cmd.title + ': \n' + L.cmd.author + ': \n\n' + preSettings(L, 'A4') + '\n\n---';
  }
  function preSettings(L, size){ return '//' + L.head.settings + '\n' + L.cmd.size + ': ' + size + '\n' + L.cmd.lang + ': ' + L.name; }
  function bare(v){ return v.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
  // Language from a typed value: its own name or its two letter code, accents and case do not matter; null if unknown
  function langOf(v){
    var b = bare(v || '');
    for (var i = 0; i < LANGS.length; i++){ if (b === bare(LANGS[i].name) || b === LANGS[i].code) return LANGS[i]; }
    var hit = b ? LANGS.filter(function(L){ return bare(L.name).indexOf(b) === 0; }) : [];
    return hit.length === 1 ? hit[0] : null;
  }
  function sizeOf(v){ return /letter/i.test(v || '') ? 'US Letter' : 'A4'; }
  // Command on a title page line in any language: {key, label (as written, colon excluded), value}; the longest label
  // wins, so Autor:in: is read as Autor:in and not as Autor
  var CMD_LABELS = [];
  LANGS.forEach(function(L){ Object.keys(L.cmd).forEach(function(k){ CMD_LABELS.push({key:k, label:L.cmd[k]}); }); });
  CMD_LABELS.sort(function(a, b){ return b.label.length - a.label.length; });
  function cmdOf(s){
    for (var i = 0; i < CMD_LABELS.length; i++){
      var c = CMD_LABELS[i], n = c.label.length;
      if (s.length > n && s.charAt(n) === ':' && s.slice(0, n).toLowerCase() === c.label.toLowerCase()) return {key:c.key, label:s.slice(0, n), value:s.slice(n + 1)};
    }
    return null;
  }
  // A heading of the title page in any language: 'title' or 'settings', or null
  function headOf(s){
    var m = s.match(/^\/\/\s*(.*?)\s*$/);
    if (!m) return null;
    for (var i = 0; i < LANGS.length; i++){
      for (var k in LANGS[i].head){ if (bare(LANGS[i].head[k]) === bare(m[1])) return k; }
    }
    // earlier names are still read (and renamed)
    if (['skripteinstellungen', 'script settings', 'parametres du scenario'].indexOf(bare(m[1])) >= 0) return 'settings';
    return null;
  }
  // Value of a setting ('size' or 'lang') on the title page; te is the line of the closing ---
  function preValue(get, te, key){
    for (var k = 1; k < te; k++){ var c = cmdOf(get(k)); if (c && c.key === key) return c.value.trim(); }
    return null;
  }
  // Line of the closing ---, or -1 when the script has no title page; get(i) returns line i
  function titleEnd(get, n){
    if (!n || !FENCE.test(get(0))) return -1;
    for (var k = 1; k < n; k++) if (FENCE.test(get(k))) return k;
    return -1;
  }
  // Page break: a line of only === (as in Fountain). Section to share: === with the section title after it, the first
  // one opens the section, the next one with the same title closes it. Both take no space in the pagination
  var BREAK = /^={3,}\s*$/, SECTION = /^===\s+\S/;
  function isMark(s){ return BREAK.test(s) || SECTION.test(s); }
  var TRANS_LIST = ['CUT TO:', 'FADE IN:', 'FADE OUT.', 'FADE TO:', 'DISSOLVE TO:', 'BACK TO:', 'MATCH CUT TO:', 'JUMP CUT TO:', 'FADE TO BLACK.', 'SMASH CUT TO:', 'CUT TO BLACK.', 'TIME CUT:'];
  // Time of day in a slugline; slugline completion ends with it and offers only times already used in this script
  var TIME_LIST = ['DAY', 'NIGHT', 'MORNING', 'AFTERNOON', 'EVENING', 'DAWN', 'DUSK', 'MAGIC HOUR', 'CONTINUOUS', 'LATER', 'MOMENTS LATER', 'SAME', 'SAME TIME', 'THE NEXT DAY'];
  // Separator between slugline segments: a hyphen (or en/em dash) with a space on at least one side, so TWENTY-ONE stays one word
  var SLUG_SEP = /\s+[-–—]+\s*|[-–—]+\s+/g;
  // The script is kept in this browser's localStorage (no sync between browsers or devices)
  var STORE_KEY = 'scriptin.capacitor.text', SAVE_MS = 400;
  // The script is also kept in Bubble (DB Script), encrypted in this browser before it leaves:
  // the address ends in #<token>.<key>; the token names the record, the key stays in the URL fragment,
  // which browsers never send to a server, so the database only ever holds ciphertext
  var HASH = /^#([a-z0-9]{32})\.([A-Za-z0-9_-]{43})$/, SYNC_MS = 2000, LOAD_WAIT_MS = 15000, PEND_PREFIX = 'scriptin.capacitor.pending.';
  function isBlank(s){ return s.trim() === ''; }
  function alpha(a, b){ return a.localeCompare(b, undefined, {sensitivity:'base'}); }
  // colorBlue of the other theme in OptS_theme_ui, used for the cursor on shot blocks
  function altBlue(){
    try {
      var v = window.app.option_sets._theme_ui.values, cur = (T.blue || '#009ECE').toUpperCase(), out = '';
      Object.keys(v).forEach(function(k){ var b = v[k].colorblue || ''; if (!out && b && b.toUpperCase() !== cur) out = b; });
      return out;
    } catch (e){ return ''; }
  }
  // colorBlue of the night theme (the one with the darker colorBackground): the bars behind title page values
  function nightBlue(){
    try {
      var v = window.app.option_sets._theme_ui.values, best = null, lum = 2;
      Object.keys(v).forEach(function(k){
        var b = (v[k].colorbackground || '').replace('#', ''), n = parseInt(b, 16);
        if (b.length !== 6 || isNaN(n)) return;
        var l = ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 255000;
        if (l < lum && v[k].colorblue){ lum = l; best = v[k].colorblue; }
      });
      return best || '';
    } catch (e){ return ''; }
  }
  // How many characters longer the printed slugline word (INT., INNEN., I/E. ... in the script's language) is than
  // what is typed (.i .e .ie .ei); the slugline's first line is that much shorter, so the editor wraps it as printed
  function slugDelta(s, L){
    var m = s.match(/^\.(IE|EI|I|E)(\s|$)/i);
    if (!m) return -1;
    return (L || LANGS[0]).slug[m[1].toUpperCase()].length - m[1].length - 1;
  }
  // Language set on the title page of these lines, English when there is none
  function langIn(get, te){ return langOf(preValue(get, te, 'lang') || '') || LANGS[0]; }
  // ---- Reformat (Cmd+Option+Enter, Ctrl+Shift+Enter on Windows): capitals, single spaces, one empty line between elements ----
  function normLine(s){ return s.replace(/[ \t ]+/g, ' ').trim(); }
  function splitParens(l){
    var res = [], re = /\(([^()]*)\)/g, last = 0, mm;
    while ((mm = re.exec(l))){
      var before = l.slice(last, mm.index).trim();
      if (before) res.push(before);
      res.push('(' + mm[1].trim() + ')');
      last = re.lastIndex;
    }
    var after = l.slice(last).trim();
    if (after) res.push(after);
    return res.length ? res : [l];
  }
  function reformatText(text){
    var paras = [], cur = [], src = text.split('\n'), te = titleEnd(function(k){ return src[k]; }, src.length);
    src.map(normLine).forEach(function(l, k){
      if (l === ''){ if (cur.length){ paras.push(cur); cur = []; } }
      else cur.push(l);
      // the closing --- of the title page ends a paragraph, so the script below it is set off by an empty line
      if (k === te && cur.length){ paras.push(cur); cur = []; }
    });
    if (cur.length) paras.push(cur);
    // Slugline separators all become the dash used most often in the script's sluglines (a tie goes to the one used first),
    // with one space on each side: 3 x - and 13 x – turn the three - into –
    var isSlugPara = function(p){ return /^\.(IE|EI|I|E)(\s|$)/i.test(p[0]); };
    var kindOf = function(run){ return run.indexOf('—') >= 0 ? '—' : run.indexOf('–') >= 0 ? '–' : '-'; };
    var count = {}, first = [];
    paras.forEach(function(p){
      if (!isSlugPara(p)) return;
      p.forEach(function(l){
        (l.match(new RegExp(SLUG_SEP.source, 'g')) || []).forEach(function(sep){
          var k = kindOf(sep);
          if (!count[k]){ count[k] = 0; first.push(k); }
          count[k]++;
        });
      });
    });
    var dash = first.reduce(function(best, k){ return count[k] > count[best] ? k : best; }, first[0] || '-');
    return paras.map(function(p){
      var h = p[0], m;
      if (isSlugPara(p)){
        return p.map(function(l, i){
          l = l.toUpperCase().replace(new RegExp(SLUG_SEP.source, 'g'), ' ' + dash + ' ').trim();
          if (i === 0) l = l.replace(/^\.(IE|EI|I|E)\s*/, function(_, x){ return '.' + x + ' '; }).trim();
          return l;
        }).join('\n');
      }
      if (SHOT.test(h)){
        // Shot: .s CLOSE ON THE LETTER, the .s stays lowercase, the description goes to capitals
        return p.map(function(l, i){
          if (i === 0) return ('.s ' + l.replace(/^\.s\s*/i, '').toUpperCase()).trim();
          return l.toUpperCase();
        }).join('\n');
      }
      if ((m = h.match(/^,([^,]*),(.*)$/))){
        // Cue: ,NAME (EXT), with the extension inside the commas
        var raw = m[1], o = raw.indexOf('('), ext = '', body = [];
        var name = (o < 0 ? raw : raw.slice(0, o)).trim().toUpperCase();
        if (o >= 0){
          var cl = raw.indexOf(')', o);
          ext = raw.slice(o + 1, cl < 0 ? raw.length : cl).trim().toUpperCase();
          if (cl >= 0 && raw.slice(cl + 1).trim()) body.push(raw.slice(cl + 1).trim());
        }
        if (m[2].trim() !== '') body.push(m[2].trim());
        var lines = [',' + name + (ext ? ' (' + ext + ')' : '') + ','];
        body.concat(p.slice(1)).forEach(function(l){ splitParens(l).forEach(function(x){ lines.push(x); }); });
        return lines.join('\n');
      }
      if (TRANS.test(h)){
        // Transition: .t CUT TO:, the .t stays lowercase
        return p.map(function(l, i){
          if (i === 0) return ('.t ' + l.replace(/^\.t\s*/i, '').toUpperCase()).trim();
          return l.toUpperCase();
        }).join('\n');
      }
      return p.join('\n');
    }).join('\n\n');
  }
  // ---- Pagination (reading script): where each printed page begins, as editor positions ----
  // The printed layout is built from the elements, not from the writer's own blank lines; notes (//) take no space.
  // Rules from the scriptin:flux documentation (Cole/Haag component): sluglines and shots never stand alone at the
  // bottom of a page; action breaks at the end of a sentence (or after ... or --); dialogue breaks at the end of a
  // sentence with (MORE) below and the cue with (CONT'D) on the next page, never right after a parenthetical;
  // a cue never stays alone at the bottom. Reading script: no (CONTINUED), page numbers from page 2.
  // Page size: DIN A4 (297 mm = 11.69 in), 1 inch top and bottom margin, 6 lines per inch (12 pt Courier) = 58 lines.
  // A4 is 210 mm wide: with 1.5 in left and 1 in right margin there is room for 57 characters, so the 55 character
  // line lengths stay as they are.
  var MAX_PAGES = 3;
  var PAGE_LINES = 58, SPACE_SLUG = 2, SPACE_OTHER = 1;
  // US Letter (11 in) by the same rule: 1 inch top and bottom, 6 lines per inch = 54 lines; the line lengths stay
  var LETTER_LINES = 54, A4_LINES = PAGE_LINES;
  var SENT_END = /(\.\.\.|--|[.!?]["'”’)\]]*)(?=\s+\S)/g, SENT_TAIL = /(\.\.\.|--|[.!?]["'”’)\]]*)\s*$/;
  // Start offsets of the printed lines of s, wrapped word by word at width characters
  function wrapStarts(s, width){
    var out = [], len = -1, re = /\S+/g, m;
    while ((m = re.exec(s))){
      var w = m[0].length, at = m.index;
      if (len >= 0 && len + 1 + w <= width){ len += 1 + w; continue; }
      while (w > width){ out.push(at); at += width; w -= width; }
      out.push(at); len = w;
    }
    return out.length ? out : [0];
  }
  function runLines(runs){ var n = 0; for (var i = 0; i < runs.length; i++) n += wrapStarts(runs[i].s, runs[i].w).length; return n; }
  function piece(s, ln, ch, w, par){
    var lead = s.length - s.replace(/^\s+/, '').length;
    return {s:s.trim(), line:ln, ch:ch + lead, w:w, par:!!par};
  }
  // A dialogue line, split like Reformat does: every parenthetical on its own printed line
  function dialogPieces(s, ln, ch, out){
    if (/^\s*\(/.test(s) && s.indexOf(')') < 0){ out.push(piece(s, ln, ch, W_PAREN, true)); return; }
    var re = /\(([^()]*)\)?/g, last = 0, m;
    while ((m = re.exec(s))){
      if (s.slice(last, m.index).trim()) out.push(piece(s.slice(last, m.index), ln, ch + last, W_DIALOG));
      out.push(piece(m[0], ln, ch + m.index, W_PAREN, true));
      last = re.lastIndex;
    }
    if (s.slice(last).trim()) out.push(piece(s.slice(last), ln, ch + last, W_DIALOG));
  }
  function pageElements(text){
    var lines = text.split('\n'), get = function(k){ return lines[k]; }, te = titleEnd(get, lines.length), L = langIn(get, te);
    var els = [], i = te + 1, brk = false, speaker = null;
    while (i < lines.length){
      if (lines[i].trim() === ''){ i++; continue; }
      if (isMark(lines[i])){ if (BREAK.test(lines[i])) brk = true; i++; continue; }
      var s0 = i, ps = [];
      while (i < lines.length && lines[i].trim() !== '' && !isMark(lines[i])) ps.push(lines[i++]);
      var h = ps[0], el = {pos:{line:s0, ch:0}, space:SPACE_OTHER, keep:false, split:false, cue:false, brk:false, runs:[], kind:'act'}, d, m;
      if (NOTE.test(h)) continue;
      el.brk = brk; brk = false;
      if ((d = slugDelta(h, L)) >= 0){
        speaker = null;
        el.keep = true; el.space = SPACE_SLUG; el.kind = 'slug'; el.slug = L.slug[h.match(/^\.(IE|EI|I|E)/i)[1].toUpperCase()];
        ps.forEach(function(l, k){ el.runs.push(piece(l, s0 + k, 0, k ? W_ACTION : W_ACTION - d)); });
      } else if (SHOT.test(h) || TRANS.test(h)){
        // A shot keeps with the element after it, but has one empty line before it like action
        el.keep = SHOT.test(h); el.kind = el.keep ? 'act' : 'trans'; el.shot = el.keep;
        // A shot has two empty lines before it, like a slugline (Final Draft PDF of 25.10.)
        if (el.shot) el.space = SPACE_SLUG;
        ps.forEach(function(l, k){
          var off = k ? 0 : l.match(/^\.[st]\s*/i)[0].length;
          if (l.slice(off).trim()) el.runs.push(piece(l.slice(off), s0 + k, off, W_ACTION));
        });
        if (!el.runs.length) el.runs.push(piece('', s0, 0, W_ACTION));
      } else if ((m = h.match(/^,([^,]*),(.*)$/))){
        el.cue = true; el.split = true; el.kind = 'cue'; el.name = m[1];
        // The same character speaking again in the same scene (no other cue in between) is printed with (CONT'D)
        var who = m[1].replace(/\([^)]*\)?/g, '').trim().toUpperCase();
        el.contd = !!who && who === speaker; speaker = who;
        var off = m[1].length + 2;
        if (m[2].trim()) dialogPieces(m[2], s0, off, el.runs);
        for (var k = 1; k < ps.length; k++) dialogPieces(ps[k], s0 + k, 0, el.runs);
      } else {
        el.split = true;
        ps.forEach(function(l, k){ el.runs.push(piece(l, s0 + k, 0, W_ACTION)); });
      }
      els.push(el);
    }
    return els;
  }
  function elLines(el){ return (el.cue ? 1 : 0) + runLines(el.runs); }
  // Allowed breaks of an action or dialogue element, from the smallest first part to the largest
  function breakOptions(el){
    var out = [], runs = el.runs;
    for (var j = 0; j < runs.length; j++){
      var r = runs[j], m, re = new RegExp(SENT_END.source, 'g');
      if (!r.par){
        while ((m = re.exec(r.s))){
          var e = m.index + m[0].length, rs = e + (r.s.slice(e).length - r.s.slice(e).replace(/^\s+/, '').length);
          out.push({first:runs.slice(0, j).concat([{s:r.s.slice(0, e), w:r.w, par:false, line:r.line, ch:r.ch}]),
            rest:[{s:r.s.slice(rs), w:r.w, par:false, line:r.line, ch:r.ch + rs}].concat(runs.slice(j + 1))});
        }
      }
      if (j < runs.length - 1 && !r.par && (SENT_TAIL.test(r.s) || (el.cue && runs[j + 1].par)))
        out.push({first:runs.slice(0, j + 1), rest:runs.slice(j + 1)});
    }
    // Dialogue: the part left at the bottom holds at least one line of dialogue
    if (el.cue) out = out.filter(function(o){ return o.first.some(function(r){ return !r.par; }); });
    return out;
  }
  // Lines a break leaves at the bottom: the cue and (MORE) come with dialogue
  function firstLines(el, o){ return runLines(o.first) + (el.cue ? 2 : 0); }
  function minHead(el){
    var o = el.split ? breakOptions(el) : [];
    return o.length ? Math.min(firstLines(el, o[0]), elLines(el)) : elLines(el);
  }
  // Last resort for an element taller than a page: break after as many printed lines as fit
  function forceBreak(el, room){
    var first = [], left = Math.max(1, room - (el.cue ? 2 : 0));
    for (var j = 0; j < el.runs.length; j++){
      var r = el.runs[j], st = wrapStarts(r.s, r.w);
      if (st.length <= left){ first.push(r); left -= st.length; if (!left) return {first:first, rest:el.runs.slice(j + 1)}; continue; }
      var cut = st[left];
      first.push({s:r.s.slice(0, cut), w:r.w, par:r.par, line:r.line, ch:r.ch});
      return {first:first, rest:[{s:r.s.slice(cut), w:r.w, par:r.par, line:r.line, ch:r.ch + cut}].concat(el.runs.slice(j + 1))};
    }
    return null;
  }
  // Printed lines of a run: wrapped as in the editor, words one space apart
  function runText(s, w){
    var st = wrapStarts(s, w);
    return st.map(function(a, i){ return s.slice(a, i + 1 < st.length ? st[i + 1] : s.length).trim().replace(/\s+/g, ' '); });
  }
  function cueText(name, cont){
    var n = (name || '').trim().replace(/\s+/g, ' ').toUpperCase();
    return cont && !/\(CONT'D\)/.test(n) ? (n ? n + ' ' : '') + "(CONT'D)" : n;
  }
  // The printed script: where each page begins (editor positions) and, with print, every printed line of every page as
  // {y: line on the page from the top margin, kind: act, slug, trans, cue, dlg or par, s: text}; the page numbers
  // beside the editor and the PDF both come from here, so they always agree
  function layout(text, print){
    var lines = text.split('\n'), get = function(k){ return lines[k]; }, te = titleEnd(get, lines.length);
    var size = sizeOf(preValue(get, te, 'size')), PAGE_LINES = size === 'US Letter' ? LETTER_LINES : A4_LINES;
    var els = pageElements(text), y = 0, starts = [], pages = [[]];
    function newPage(pos){ starts.push(pos); y = 0; if (print) pages.push([]); }
    function emit(el, runs, at, more, cont){
      if (!print) return;
      var pg = pages[pages.length - 1];
      if (el.cue) pg.push({y:at++, kind:'cue', s:cueText(el.name, cont || el.contd)});
      runs.forEach(function(r){
        var kind = el.cue ? (r.par ? 'par' : 'dlg') : el.kind, out = runText(r.s, r.w);
        if (kind === 'slug' || kind === 'trans' || el.shot) out = out.map(function(x){ return x.toUpperCase(); });
        // the typed .i .e .ie .ei becomes the slugline word of the script's language
        if (kind === 'slug' && !cont && r.line === el.pos.line && r.ch === 0) out[0] = out[0].replace(/^\.(IE|EI|I|E)(?=\s|$)/i, el.slug);
        out.forEach(function(x){ pg.push({y:at++, kind:kind === 'slug' ? 'act' : kind, s:x}); });
      });
      if (more) pg.push({y:at, kind:'cue', s:'(MORE)'});
    }
    for (var i = 0; i < els.length; i++){
      var el = els[i], guard = 0, cont = false;
      if (el.brk && y > 0) newPage(el.pos);
      while (guard++ < 1000){
        var sp = y === 0 ? 0 : el.space, h = elLines(el);
        if (el.keep){
          var nx = els[i + 1], need = sp + h + (nx && !nx.keep ? nx.space + minHead(nx) : 0);
          if (y > 0 && y + need > PAGE_LINES){ newPage(el.pos); continue; }
          emit(el, el.runs, y + sp, false, cont); y += sp + h; break;
        }
        if (y + sp + h <= PAGE_LINES || (y === 0 && !el.split)){ emit(el, el.runs, y + sp, false, cont); y += sp + h; break; }
        var room = PAGE_LINES - y - sp, best = null;
        if (el.split) breakOptions(el).forEach(function(o){ if (firstLines(el, o) <= room) best = o; });
        if (!best && y > 0){ newPage(el.pos); continue; }
        if (!best) best = forceBreak(el, room);
        if (!best || !best.rest.length){ emit(el, el.runs, y + sp, false, cont); y += sp + h; break; }
        emit(el, best.first, y + sp, el.cue, cont);
        el = {pos:{line:best.rest[0].line, ch:best.rest[0].ch}, space:0, keep:false, split:true, cue:el.cue, runs:best.rest, kind:el.kind, name:el.name, slug:el.slug, shot:el.shot, contd:el.contd};
        cont = true;
        newPage(el.pos);
      }
    }
    return {starts:starts, pages:pages, size:size, lang:langIn(get, te), title:(preValue(get, te, 'title') || '').trim(), author:(preValue(get, te, 'author') || '').trim()};
  }
  function paginate(text){ return layout(text, false).starts; }
  // ---- PDF export (/pdf + Enter on a line of its own): the reading script, Courier Prime 12 pt, page size from the
  // title page. 1 inch top and bottom, 1.5 inch left, 1 inch right; sluglines, shots and action at 1.5 inch, dialogue
  // 2.5, parentheticals 2.9, cues 3.5 inch from the edge, transitions flush right; page number top right from page 2,
  // 0.5 inch from the top, with a period. Title page only when Title and Author are both filled in: the title in
  // capitals on line 25, the credit (Written by ...) on line 30, the author on line 32, all centred. Notes, section
  // marks and scene numbers are never printed.
  var PT = 72, LH = 12, INDENT = {act:1.5, dlg:2.5, par:2.9, cue:3.5};
  var pdfKit = null;
  function fetchB64(url){
    return fetch(url).then(function(r){ if (!r.ok) throw new Error(url + ' ' + r.status); return r.arrayBuffer(); }).then(function(buf){
      var b = new Uint8Array(buf), s = '';
      for (var i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
      return btoa(s);
    });
  }
  function loadPdfKit(){
    if (pdfKit) return pdfKit;
    pdfKit = new Promise(function(res, rej){
      if (window.jspdf) return res();
      var s = document.createElement('script'); s.src = SELF + 'vendor/jspdf.umd.min.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s);
    }).then(function(){ return fetchB64(SELF + 'fonts/CourierPrime-Regular.ttf'); })
      .then(function(font){ return {jsPDF:window.jspdf.jsPDF, font:font}; });
    pdfKit.catch(function(){ pdfKit = null; });
    return pdfKit;
  }
  function fileName(title){ return (title.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim() || 'script') + '.pdf'; }
  function buildPdf(kit, lay){
    var doc = new kit.jsPDF({unit:'pt', format:lay.size === 'US Letter' ? 'letter' : 'a4', compress:true});
    doc.addFileToVFS('CourierPrime-Regular.ttf', kit.font);
    doc.addFont('CourierPrime-Regular.ttf', 'CourierPrime', 'normal');
    doc.setFont('CourierPrime', 'normal'); doc.setFontSize(12);
    doc.setProperties({title:lay.title || 'script', author:lay.author || ''});
    var W = doc.internal.pageSize.getWidth(), right = W - PT, used = false;
    function page(){ if (used) doc.addPage(); used = true; }
    function at(s, x, y){ if (s) doc.text(s, x, y, {baseline:'top'}); }
    function flushRight(s, y){ at(s, right - doc.getTextWidth(s), y); }
    function centred(s, y){ at(s, (W - doc.getTextWidth(s)) / 2, y); }
    var titled = !!(lay.title && lay.author);
    if (titled){
      page();
      var tl = runText(lay.title.toUpperCase(), W_ACTION), credit = Math.max(29, 24 + tl.length + 3);
      tl.forEach(function(s, i){ centred(s, (24 + i) * LH); });
      centred(lay.lang.credit, credit * LH);
      runText(lay.author, W_ACTION).forEach(function(s, i){ centred(s, (credit + 2 + i) * LH); });
    }
    var pages = lay.pages;
    if (titled && pages.length === 1 && !pages[0].length) pages = [];
    pages.forEach(function(items, n){
      page();
      if (n > 0) flushRight((n + 1) + '.', PT / 2);
      items.forEach(function(it){
        var y = PT + it.y * LH;
        if (it.kind === 'trans') flushRight(it.s, y); else at(it.s, INDENT[it.kind] * PT, y);
      });
    });
    if (!used) page();
    return doc;
  }
  function exportPdf(text){
    var lay = layout(text, true);
    return loadPdfKit().then(function(kit){ buildPdf(kit, lay).save(fileName(lay.title)); })
      .catch(function(e){ if (window.console) console.error('scriptin PDF export failed', e); });
  }
  function defineMode(){
    CodeMirror.defineMode('scriptin', function(){
      return {
        // pre: 0 first line not read yet, 1 inside the title page, 2 after it (or no title page)
        startState: function(){ return {cue:false, prevBlank:true, pre:0}; },
        copyState: function(st){ return {cue:st.cue, prevBlank:st.prevBlank, pre:st.pre}; },
        blankLine: function(state){ state.prevBlank = true; if (!state.pre) state.pre = 2; },
        token: function(stream, state){
          // Title page: the value of Page size and Language is a chip, changed only with Up/Down
          if (stream.sol() && state.pre === 0) state.pre = FENCE.test(stream.string) ? -1 : 2;
          else if (stream.sol() && state.pre === 1 && FENCE.test(stream.string)){ state.pre = 2; stream.skipToEnd(); state.prevBlank = true; return null; }
          if (state.pre === -1){ state.pre = 1; stream.skipToEnd(); return null; }
          if (state.pre === 1){
            var c = cmdOf(stream.string), at = c ? c.label.length + 1 : 0;
            if (!c){ stream.skipToEnd(); return null; }
            while (at < stream.string.length && stream.string.charAt(at) === ' ') at++;
            if (stream.pos < at){ stream.pos = at; return null; }
            stream.skipToEnd(); return c.key === 'size' || c.key === 'lang' ? 'smsetval' : 'smfield';
          }
          if (stream.sol()){
            var para = state.prevBlank;
            state.prevBlank = false; state.cue = false;
            if (stream.match(/^\s*$/, false)){ stream.skipToEnd(); state.prevBlank = true; return null; }
            if (para && stream.peek() === ','){ stream.next(); state.cue = true; return 'smcue'; }
            if (para && stream.match(/^\.s(?=\s|$)/i)) return 'smshotcmd';
            stream.skipToEnd(); return null;
          }
          if (state.cue){
            if (stream.peek() === ','){ stream.next(); state.cue = false; return 'smcue'; }
            stream.eatWhile(/[^,]/); return 'smcue';
          }
          stream.skipToEnd(); return null;
        }
      };
    });
  }
  function widthStyles(){
    var css = '#sm-editor pre.sm-t-act{width:calc(' + W_ACTION + 'ch + ' + PAD + 'px)}\n#sm-editor pre.sm-t-dlg{width:calc(' + W_DIALOG + 'ch + ' + PAD + 'px)}\n#sm-editor pre.sm-t-par{width:calc(' + W_PAREN + 'ch + ' + PAD + 'px)}\n';
    for (var d = 0; d <= 12; d++) css += '#sm-editor pre.sm-t-s' + d + '{width:calc(' + (W_ACTION - d) + 'ch + ' + PAD + 'px)}\n';
    // Holding Option on a Mac would switch the mouse pointer to CodeMirror's rectangle selection crosshair; keep the text pointer
    css += '#sm-editor .CodeMirror-crosshair,#sm-editor .CodeMirror-crosshair *{cursor:text !important}\n';
    // Transition block: cue colour behind, shot colour for the letters, text right aligned at the page width;
    // the line spans the whole editor and the text's own padding carries the block on to the right frame line,
    // so the block is one piece with the same height as cue blocks (as shot blocks run to the left frame line)
    css += '#sm-editor .CodeMirror pre.CodeMirror-line.sm-t-trans{width:100%;padding-right:0;text-align:right}\n#sm-editor pre.sm-t-trans > span{background:linear-gradient(to bottom,transparent var(--sm-inset),var(--sm-frame) var(--sm-inset),var(--sm-frame) calc(100% - var(--sm-inset) + var(--sm-under)),transparent calc(100% - var(--sm-inset) + var(--sm-under)));color:var(--sm-inactive);padding-right:var(--sm-trans-tail,67px) !important;box-shadow:calc(-16px + var(--sm-under) / 2 - var(--sm-inset)) calc(var(--sm-under) / 2) 0 calc(var(--sm-under) / 2 - var(--sm-inset)) var(--sm-frame);-webkit-box-decoration-break:clone;box-decoration-break:clone}\n';
    var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  }
  // ---- Database sync, encrypted (AES-GCM, 256 bit key made in this browser) ----
  // Bridge to Bubble through Toolbox "JavaScript to Bubble" elements and "Run javascript" actions on the page scriptin:
  //   bubble_fn_scriptCreate('new')            -> Bubble runs script-create, then calls window.smCreated('<token>')
  //   bubble_fn_scriptSave('<token>|<cipher>') -> Bubble runs script-save, then calls window.smSaved('yes'|'no')
  //   bubble_fn_scriptLoad('<token>')          -> Bubble runs script-load, then calls window.smLoaded('yes'|'no', <cipher as JSON-safe text>)
  // Cipher format: v2.<iv>.<ciphertext>, both base64url; the ciphertext holds {"t": text, "at": save time} (v1: text only)
  function b64u(bytes){
    var s = '', a = new Uint8Array(bytes);
    for (var i = 0; i < a.length; i++) s += String.fromCharCode(a[i]);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function unb64u(str){
    str = str.replace(/-/g, '+').replace(/_/g, '/');
    while (str.length % 4) str += '=';
    var s = atob(str), a = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) a[i] = s.charCodeAt(i);
    return a;
  }
  function makeSync(cm, localText){
    var m = HASH.exec(window.location.hash || '');
    var token = m ? m[1] : '', keyStr = m ? m[2] : '', key = null;
    var state = m ? 'loading' : 'idle', dirty = false, timer = null, quiet = false, inflight = false, inflightTimer = null, inflightAt = 0, inflightToken = '';
    var subtle = window.crypto && window.crypto.subtle;
    function getKey(){
      if (key) return Promise.resolve(key);
      if (!keyStr) keyStr = b64u(window.crypto.getRandomValues(new Uint8Array(32)));
      return subtle.importKey('raw', unb64u(keyStr), {name:'AES-GCM'}, false, ['encrypt', 'decrypt']).then(function(k){ key = k; return k; });
    }
    // v2 packs the text with its save time, so the time stays as private as the text; v1 (text only) is still read
    function encrypt(text, at){
      var iv = window.crypto.getRandomValues(new Uint8Array(12));
      var plain = JSON.stringify({t:text, at:at});
      return getKey().then(function(k){ return subtle.encrypt({name:'AES-GCM', iv:iv}, k, new TextEncoder().encode(plain)); })
        .then(function(ct){ return 'v2.' + b64u(iv) + '.' + b64u(ct); });
    }
    function decrypt(payload){
      var p = String(payload || '').split('.');
      if (p.length !== 3 || (p[0] !== 'v1' && p[0] !== 'v2')) return Promise.reject(new Error('format'));
      return getKey().then(function(k){ return subtle.decrypt({name:'AES-GCM', iv:unb64u(p[1])}, k, unb64u(p[2])); })
        .then(function(buf){
          var s = new TextDecoder().decode(buf);
          if (p[0] === 'v1') return {t:s, at:0};
          var o = JSON.parse(s);
          return {t:String(o.t || ''), at:Number(o.at) || 0};
        });
    }
    // A save not yet confirmed by Bubble is kept in this browser under the script's token until smSaved('yes')
    function pendKey(t){ return PEND_PREFIX + t; }
    function readPending(t){
      try { var o = JSON.parse(window.localStorage.getItem(pendKey(t)) || 'null'); return o && typeof o.t === 'string' ? o : null; } catch (e){ return null; }
    }
    function writePending(t, o){ try { window.localStorage.setItem(pendKey(t), JSON.stringify(o)); } catch (e){} }
    function dropPending(t, at){
      var o = readPending(t);
      if (o && (at === undefined || o.at === at)) { try { window.localStorage.removeItem(pendKey(t)); } catch (e){} }
    }
    function bridge(name, value){
      var fn = window['bubble_fn_' + name];
      if (typeof fn !== 'function') return false;
      fn(value); return true;
    }
    function setText(text){
      quiet = true;
      cm.setValue(text); cm.clearHistory();
      quiet = false;
      cm.setOption('readOnly', false);
      cm.focus();
    }
    function unlink(){
      token = ''; keyStr = ''; key = null;
      try { window.history.replaceState(null, '', window.location.pathname + window.location.search); } catch (e){}
    }
    function schedule(){ clearTimeout(timer); timer = setTimeout(flush, SYNC_MS); }
    function flush(){
      clearTimeout(timer);
      if (!subtle || !dirty || state !== 'idle') return;
      if (!token){
        // The first real text asks Bubble for a new record
        if (cm.getValue().trim() === '') return;
        state = 'creating';
        if (!bridge('scriptCreate', 'new')){ state = 'idle'; schedule(); return; }
        setTimeout(function(){ if (state === 'creating'){ state = 'idle'; schedule(); } }, LOAD_WAIT_MS);
        return;
      }
      // One save at a time: changes made meanwhile stay dirty and go out once Bubble has answered with smSaved
      if (inflight) return;
      dirty = false; inflight = true;
      var t = token, text = cm.getValue(), at = Date.now();
      inflightAt = at; inflightToken = t;
      writePending(t, {t:text, at:at});
      encrypt(text, at).then(function(c){
        if (!bridge('scriptSave', t + '|' + c)){ settle(false); return; }
        inflightTimer = setTimeout(function(){ settle(false); }, LOAD_WAIT_MS);
      }, function(){ settle(false); });
    }
    function settle(ok){
      clearTimeout(inflightTimer);
      inflight = false;
      if (ok) dropPending(inflightToken, inflightAt);
      else dirty = true;
      if (dirty) schedule();
    }
    window.smCreated = function(t){
      t = String(t || '').trim();
      if (!/^[a-z0-9]{32}$/.test(t)){ state = 'idle'; return; }
      token = t;
      getKey().then(function(){
        try { window.history.replaceState(null, '', window.location.pathname + window.location.search + '#' + token + '.' + keyStr); } catch (e){}
        state = 'idle'; dirty = true; flush();
      });
    };
    window.smSaved = function(ok){ if (inflight) settle(String(ok).trim() === 'yes'); };
    window.smLoaded = function(found, payload){
      if (state !== 'loading') return;
      var done = function(text){ state = 'idle'; setText(text); };
      if (String(found) !== 'yes' || !payload){ unlink(); done(localText); return; }
      var t = token;
      decrypt(payload).then(function(srv){
        done(srv.t);
        // A newer unconfirmed save from this browser goes on top as one undoable change (Cmd+Z returns to the server version)
        var p = readPending(t);
        if (p && p.at > srv.at && p.t !== srv.t){
          cm.replaceRange(p.t, {line:0, ch:0}, {line:cm.lastLine(), ch:cm.getLine(cm.lastLine()).length}, '+restore');
        } else dropPending(t);
      }, function(){ unlink(); done(localText); });
    };
    if (state === 'loading'){
      // Wait for Bubble's bridge elements, then ask for the record; without an answer the editor stays read only
      var start = Date.now();
      (function ask(){
        if (bridge('scriptLoad', token)) return;
        if (Date.now() - start < LOAD_WAIT_MS) setTimeout(ask, 100);
        else if (window.console) console.warn('scriptin: script could not be loaded');
      })();
    }
    return {
      changed: function(){ if (quiet || state === 'loading') return; dirty = true; schedule(); },
      flush: flush
    };
  }
  function init(){
    var host = document.getElementById('sm-editor');
    if (!host || host.getAttribute('data-ready')) return;
    host.setAttribute('data-ready', '1');
    if (T.bg) host.style.setProperty('--sm-bg', T.bg);
    if (T.fg) host.style.setProperty('--sm-fg', T.fg);
    if (T.blue) host.style.setProperty('--sm-blue', T.blue);
    if (T.frame) host.style.setProperty('--sm-frame', T.frame);
    if (T.inactive) host.style.setProperty('--sm-inactive', T.inactive);
    var alt = altBlue(); if (alt) host.style.setProperty('--sm-blue-alt', alt);
    var night = nightBlue(); if (night) host.style.setProperty('--sm-blue-night', night);
    widthStyles();
    defineMode();
    var saved = '';
    try { saved = window.localStorage.getItem(STORE_KEY) || ''; } catch (e){}
    // An address ending in #<token>.<key> opens a script from the database: start empty and read only until it has arrived
    var linked = HASH.test(window.location.hash || '');
    // The editor grows with its text (all lines rendered, no inner scroll bar): the browser page has the only scroll bar.
    // The text is capped at the end of page MAX_PAGES (see beforeChange below), so rendering every line stays cheap.
    var cm = CodeMirror(host, {value:linked ? '' : saved, readOnly:linked, mode:'scriptin', lineWrapping:true, autofocus:true, cursorBlinkRate:0, styleSelectedText:true, viewportMargin:Infinity});
    var cyc = null, lastAuto = -1, saveTimer = null;
    // Active cue (or transition): plain Up/Down pick names, extensions or transitions only where the writer is working
    // (created with Tab or comma, clicked into, typed in); moving onto a cue with the arrow keys never changes it
    var activeCue = -1, clicked = false;
    function save(){ try { window.localStorage.setItem(STORE_KEY, cm.getValue()); } catch (e){} }
    window.addEventListener('pagehide', save);
    var sync = makeSync(cm, saved);
    window.addEventListener('pagehide', function(){ sync.flush(); });
    // Slugline bars, shot blocks and the cursor get the same band height as cue blocks and selections (the text's own box inside the line)
    function measureBand(){
      var sp = host.querySelector('.CodeMirror-line > span');
      if (!sp) return;
      var r = sp.getBoundingClientRect(), lr = sp.parentNode.getBoundingClientRect();
      if (!r.height) return;
      host.style.setProperty('--sm-lh', cm.defaultTextHeight() + 'px');
      // Single spaced: the font's text box (r) can be taller than the line; bars and the cursor take the line's height,
      // and --sm-inset is how far the text box reaches beyond the line above and below
      var lh = cm.defaultTextHeight();
      host.style.setProperty('--sm-band', Math.min(r.height, lh) + 'px');
      host.style.setProperty('--sm-gap', Math.max(0, r.top - lr.top) + 'px');
      host.style.setProperty('--sm-inset', Math.max(0, lr.top - r.top) + 'px');
      // Descenders (g, j, p, q, y) reach below the line: bars go down that far too (never beyond the text box)
      try {
        var cx = document.createElement('canvas').getContext('2d'), fs = getComputedStyle(sp);
        cx.font = fs.fontSize + ' ' + fs.fontFamily;
        var mt = cx.measureText('gjpqy'), base = (mt.fontBoundingBoxAscent || 0) - Math.max(0, lr.top - r.top);
        var under = mt.fontBoundingBoxAscent ? Math.max(0, Math.min(Math.max(0, lr.top - r.top), base + mt.actualBoundingBoxDescent - lh)) : 0;
        host.style.setProperty('--sm-under', Math.ceil(under * 2) / 2 + 'px');
      } catch (e){}
      // Distance from the page's right text edge to the editor's right frame line
      host.style.setProperty('--sm-trans-tail', (cm.display.lineDiv.clientWidth - (W_ACTION * cm.defaultCharWidth() + PAD / 2)) + 'px');
    }
    function line(ln){ return cm.getLine(ln); }
    function put(text, from, to){ cm.replaceRange(text, from, to, ORIGIN); }
    function caret(ln, ch){ cm.setCursor({line:ln, ch:ch}); }
    // A paragraph is a run of non-empty lines; its first line decides what the whole paragraph is
    // The line right after the closing --- of the title page always begins one too, empty line or not
    function paraStart(ln){ return ln === 0 || isBlank(line(ln - 1)) || ln - 1 === preEnd(); }
    function paraHead(ln){ var te = preEnd(), i = ln; while (i > 0 && !isBlank(line(i - 1)) && i - 1 !== te) i--; return i; }
    function isSlugHead(ln){ return paraStart(ln) && slugDelta(line(ln)) >= 0; }
    function isSlugLn(ln){ return !isBlank(line(ln)) && isSlugHead(paraHead(ln)); }
    // Shot: paragraph starting with .s and a space; not part of the Tab ring
    function isShotHead(ln){ return paraStart(ln) && SHOT.test(line(ln)); }
    function isShotLn(ln){ return !isBlank(line(ln)) && isShotHead(paraHead(ln)); }
    function isTransHead(ln){ return paraStart(ln) && TRANS.test(line(ln)); }
    function isTransLn(ln){ return !isBlank(line(ln)) && isTransHead(paraHead(ln)); }
    function isNoteHead(ln){ return paraStart(ln) && NOTE.test(line(ln)); }
    function isNoteLn(ln){ return !isBlank(line(ln)) && isNoteHead(paraHead(ln)); }
    function preEnd(){ return titleEnd(line, cm.lineCount()); }
    function isPreLn(ln){ return ln <= preEnd(); }
    // A command of the title page: a line between the two --- that starts with a word and a colon
    function isPreHead(ln, te){ return ln > 0 && ln < te && CMD.test(line(ln)); }
    function isMarkLn(ln){ return isMark(line(ln)); }
    // The title page: from the opening to the closing ---; null if there is none
    function preRange(){
      var e = preEnd();
      return e < 0 ? null : {s:0, e:e};
    }
    function hasPre(){ return !!preRange(); }
    // Cursor in a shot block uses the other theme's colorBlue
    function chipCursor(){ var ln = cm.getCursor().line; cm.getWrapperElement().classList.toggle('sm-on-chip', activeCue === ln && !!settingOf(ln)); }
    function barCursor(){
      cm.getWrapperElement().classList.toggle('sm-on-bar', isShotLn(cm.getCursor().line));
      chipCursor();
    }
    // Cue: ,NAME, or ,NAME (EXT), with the extension inside the commas
    function cueParts(ln){
      if (!paraStart(ln)) return null;
      var m = line(ln).match(/^,([^,]*),(.*)$/);
      if (!m) return null;
      var raw = m[1], o = raw.indexOf('('), name = o < 0 ? raw : raw.slice(0, o), ext = null;
      if (o >= 0){
        var cl = raw.indexOf(')', o);
        ext = {open:1 + o, s:2 + o, e:1 + (cl < 0 ? raw.length : cl), closed:cl >= 0, text:raw.slice(o + 1, cl < 0 ? raw.length : cl)};
      }
      return {name:name, nameEnd:1 + name.replace(/\s+$/, '').length, second:1 + raw.length, rest:m[2], ext:ext};
    }
    function nameZone(c){ return c.ext ? c.ext.open : c.second; }
    function isCueLn(ln){ var c = cueParts(ln); return !!c && isBlank(c.rest); }
    // Index of the cue that heads the dialogue block containing ln, or -1
    function blockCue(ln){
      var i = paraHead(ln);
      return (i < ln && isCueLn(i)) ? i : -1;
    }
    // ---- Views (Cmd+Option+1 to 4, Ctrl+Shift+1 to 4 on Windows, Escape back to 1): whole paragraphs are hidden, the text itself stays untouched ----
    // 1 whole script, 2 sluglines and transitions, 3 dialogue (only one character when pressed between the commas of a cue),
    // 4 action and shots; views 3 and 4 show only the sluglines of scenes that hold such paragraphs.
    // The paragraph holding the cursor always stays visible, so text typed in a view does not vanish.
    var view = 1, who = '', marks = [], hid = [], home = null, viewPos = null, notesOff = false, preOn = false;
    function paragraphs(noCursor){
      var out = [], n = cm.lineCount(), i = 0, te = preEnd();
      while (i < n){
        if (isBlank(line(i))){ i++; continue; }
        var s = i;
        while (i < n && !isBlank(line(i)) && !(i > s && i - 1 === te)) i++;
        var h = line(s), type = 'action', name = '', c;
        if (s <= te) type = 'pre';
        else if (isMark(h)) type = 'mark';
        else if (slugDelta(h) >= 0) type = 'slug';
        else if (NOTE.test(h)) type = 'note';
        else if (SHOT.test(h)) type = 'shot';
        else if (TRANS.test(h)) type = 'trans';
        else if ((c = cueParts(s))){ type = 'dialog'; name = c.name.trim().toUpperCase(); }
        out.push({s:s, e:i - 1, type:type, name:name, scene:-1, owner:null});
      }
      // A note belongs to the nearest element above it that is not a note
      for (var q = 0, own = null; q < out.length; q++){
        if (out[q].type === 'note') out[q].owner = own; else own = out[q];
      }
      // In views 3 and 4 a slugline only shows when its scene holds something the view shows,
      // or when the cursor is in its scene (so text typed there never floats without its slugline)
      var scene = -1, has = {}, cl = noCursor ? -1 : cm.getCursor().line, curScene = -1;
      for (var k = 0; k < out.length; k++){
        if (out[k].type === 'slug') scene = out[k].s;
        out[k].scene = scene;
        if (out[k].s <= cl) curScene = scene;
        if (out[k].type !== 'slug' && out[k].type !== 'note' && matches(out[k])) has[scene] = 1;
      }
      var keepOf = {};
      for (k = 0; k < out.length; k++){
        if (out[k].type === 'slug') keepOf[out[k].s] = out[k].keep = view <= 2 || !!has[out[k].s] || out[k].s === curScene;
      }
      // A note shows only together with its scene's slugline; a note before the first slugline only in view 1
      for (k = 0; k < out.length; k++){
        if (out[k].type === 'note') out[k].keep = view === 1 || (out[k].scene >= 0 && !!keepOf[out[k].scene]);
      }
      return out;
    }
    function matches(p){
      if (view === 2) return p.type === 'trans';
      if (view === 3) return p.type === 'dialog' && (!who || p.name === who);
      if (view === 4) return p.type === 'action' || p.type === 'shot';
      return false;
    }
    function shows(p, cl){
      // The title page shows only with Cmd+Option+9, wherever the cursor is (a script opens with the cursor on line 0)
      if (p.type === 'pre') return preOn;
      if (cl >= p.s && cl <= p.e) return true;
      if (p.type === 'mark') return view === 1;
      // Notes: Cmd+Option+6 shows or hides them all; shown, a note appears only when its scene's slugline is visible
      // (before the first slugline only in view 1); the note holding the cursor always stays
      if (p.type === 'note') return !notesOff && p.keep;
      if (view === 1) return true;
      if (p.type === 'slug') return p.keep;
      return matches(p);
    }
    // Hidden runs collapse into the empty line that already separates the visible paragraphs; they are read only
    // Hidden text at the very top (a hidden preamble, or paragraphs a view hides before the first visible one) takes no
    // height at all: its lines get a zero height class instead of being collapsed into one empty line
    var topGone = -1;
    // Hidden text is read only (CodeMirror splits a change around it: Cmd+A and Backspace removes the visible text, the
    // hidden text stays). CodeMirror clears the whole undo history whenever a read only range is made, and hidden ranges
    // are made again on every redraw: the history is set aside for that moment, so Cmd+Z keeps working
    function roMark(from, to, opts){
      var d = cm.getDoc(), h = d.history;
      d.history = {done:[], undone:[]};
      try { return cm.markText(from, to, opts); } finally { d.history = h; }
    }
    function hideRange(a, b, fromStart){
      if (b < a) return;
      if (fromStart){
        marks.push(roMark({line:0, ch:0}, {line:b, ch:line(b).length}, {readOnly:true, inclusiveLeft:false, inclusiveRight:false}));
        for (var t = 0; t <= b; t++) hid[t] = 1;
        topGone = b;
        return;
      }
      marks.push(roMark({line:a, ch:fromStart ? 0 : line(a).length}, {line:b, ch:line(b).length}, {collapsed:true, readOnly:true, inclusiveLeft:false, inclusiveRight:false}));
      for (var i = a; i <= b; i++) hid[i] = 1;
    }
    function applyView(){
      for (var m = 0; m < marks.length; m++) marks[m].clear();
      marks = []; hid = []; topGone = -1;
      if (view === 1 && !notesOff && (preOn || !hasPre())) return;
      var ps = paragraphs(), cl = cm.getCursor().line, prevEnd = -1, run = false;
      for (var k = 0; k < ps.length; k++){
        if (shows(ps[k], cl)){
          if (run) hideRange(prevEnd < 0 ? 0 : prevEnd + 1, ps[k].s - 1, prevEnd < 0);
          run = false; prevEnd = ps[k].e;
        } else run = true;
      }
      // Nothing visible at all (only a hidden title page left, or a view with nothing to show): the last line stays
      // visible, so the cursor always has a place and typing can begin there
      // (a script that ends right at the closing --- first gets an empty script line from belowPre)
      var last = cm.lastLine(), keepLast = prevEnd < 0 && last > preEnd();
      if (run) hideRange(prevEnd < 0 ? 0 : prevEnd + 1, keepLast ? last - 1 : last, prevEnd < 0);
    }
    function centerCursor(){
      var c = cm.cursorCoords(cm.getCursor(), 'window');
      window.scrollBy(0, (c.top + c.bottom) / 2 - window.innerHeight / 2);
    }
    function setView(v){
      var cur = cm.getCursor();
      if (v === 3){
        var c = cueParts(cur.line);
        who = (c && cur.ch >= 1 && cur.ch <= c.second && c.name.trim()) ? c.name.trim().toUpperCase() : '';
      } else who = '';
      if (v === 1){
        var back = (home && viewPos && CodeMirror.cmpPos(cur, viewPos) === 0) ? home : null;
        view = 1; refresh();
        if (back) cm.setCursor(back);
        home = null; viewPos = null;
        centerCursor();
        return;
      }
      if (view === 1) home = cur;
      view = v;
      // Put the cursor into a paragraph that stays visible: the nearest one above, otherwise the first one below
      var ps = paragraphs(true), best = null;
      for (var k = 0; k < ps.length; k++){
        if (!shows(ps[k], -1)) continue;
        if (ps[k].s <= cur.line) best = ps[k];
        else { if (!best) best = ps[k]; break; }
      }
      if (best && !(cur.line >= best.s && cur.line <= best.e)) cm.setCursor({line:best.e, ch:line(best.e).length});
      refresh();
      viewPos = cm.getCursor();
      centerCursor();
    }
    // Hidden text (views, notes switched off, the hidden preamble) is never joined to visible text,
    // in any view: Backspace at the start or Delete at the end next to hidden lines does nothing
    function guard(dir){
      if (!marks.length || cm.somethingSelected()) return CodeMirror.Pass;
      var cur = cm.getCursor();
      if (dir < 0 && cur.ch === 0 && (hid[cur.line] || hid[cur.line - 1])) return;
      if (dir > 0 && cur.ch === line(cur.line).length && (hid[cur.line] || hid[cur.line + 1])) return;
      return CodeMirror.Pass;
    }
    function caretFor(t){ return t === ',,' ? 1 : t.length; }
    function goRing(ln, pos){
      var t = RING[pos];
      put(t, {line:ln, ch:0}, {line:ln, ch:line(ln).length});
      caret(ln, caretFor(t));
      cyc = {line:ln, pos:pos, text:t};
      if (t === ',,') activeCue = ln;
    }
    function newEl(ln, s, pos){
      var t = RING[pos];
      put('\n\n' + t, {line:ln, ch:s.length});
      caret(ln + 2, caretFor(t));
      cyc = {line:ln + 2, pos:pos, text:t};
      if (t === ',,') activeCue = ln + 2;
    }
    function ringPos(ln, s){
      if (cyc && cyc.line === ln && cyc.text === s) return cyc.pos;
      if (/^\.i\s*$/i.test(s)) return 0;
      if (/^\.e\s*$/i.test(s)) return 1;
      if (s === ',,') return 3;
      // An empty script (a title page above does not count) starts the ring at .i, existing text at ,,
      if (isBlank(s)){
        var te = preEnd(), rest = te < 0 ? cm.getValue() : cm.getRange({line:te + 1, ch:0}, {line:cm.lastLine(), ch:line(cm.lastLine()).length});
        return rest.trim() === '' ? -1 : 2;
      }
      return null;
    }
    // Tab and Enter on the title page go to the end of the next command; after the last one Enter starts a new command
    // line right below it, Tab stays. Shift+Enter adds a line to the command (a second address line)
    function preStep(ln, isEnter){
      var te = preEnd();
      for (var nx = ln + 1; nx < te; nx++) if (isPreHead(nx, te)){ caret(nx, line(nx).length); if (settingOf(nx)){ activeCue = nx; decorate(); } return; }
      // Tab on the last command stays there; on a setting it makes the chip active
      if (!isEnter && settingOf(ln)){ activeCue = ln; caret(ln, line(ln).length); decorate(); }
      if (!isEnter || ln >= te) return;
      var last = te - 1;
      while (last > 0 && isBlank(line(last))) last--;
      put('\n', {line:last, ch:line(last).length}); caret(last + 1, 0);
    }
    function tab(){
      var cur = cm.getCursor(), ln = cur.line, s = line(ln);
      if (isPreLn(ln) && ln < preEnd()){ preStep(ln, false); return; }
      if (tabSlug(ln)) return;
      var cb = blockCue(ln);
      if (cb >= 0){
        if (/^\(/.test(s)){
          if (/^\(\s*\)?\s*$/.test(s)){ put('', {line:ln, ch:0}, {line:ln, ch:s.length}); caret(ln, 0); return; }
          if (ln + 1 < cm.lineCount() && !isBlank(line(ln + 1))){ caret(ln + 1, 0); return; }
          put('\n', {line:ln, ch:s.length}); caret(ln + 1, 0); cyc = null; return;
        }
        if (isBlank(s)){
          if (cb === ln - 1){
            put('', {line:ln - 1, ch:0}, {line:ln, ch:s.length});
            caret(ln - 1, 0);
            cyc = {line:ln - 1, pos:4, text:''};
            return;
          }
          put('\n,,', {line:ln, ch:s.length}); caret(ln + 1, 1);
          cyc = {line:ln + 1, pos:3, text:',,'};
          activeCue = ln + 1;
          return;
        }
        newEl(ln, s, 3);
        return;
      }
      var p = ringPos(ln, s);
      if (p !== null){ goRing(ln, (p + 1) % RING.length); return; }
      if (isSlugLn(ln)){ newEl(ln, s, 2); return; }
      if (isShotLn(ln)){ newEl(ln, s, 2); return; }
      if (paraStart(ln) && /^,[^,]*$/.test(s)){ put(',', {line:ln, ch:s.length}); s = line(ln); }
      var c = cueParts(ln);
      if (c){
        if (isBlank(c.rest)){
          // Empty extension is removed, an unclosed one gets its closing bracket
          if (c.ext && isBlank(c.ext.text)) put('', {line:ln, ch:c.nameEnd}, {line:ln, ch:c.second});
          else if (c.ext && !c.ext.closed) put(')', {line:ln, ch:c.second}, {line:ln, ch:c.second});
          s = line(ln);
          if (ln + 1 < cm.lineCount() && !isBlank(line(ln + 1))){ caret(ln + 1, line(ln + 1).length); return; }
          put('\n', {line:ln, ch:s.length}); caret(ln + 1, 0); cyc = null;
          return;
        }
        if (cur.ch <= c.second){ caret(ln, c.second + 1); return; }
        newEl(ln, s, 3);
        return;
      }
      newEl(ln, s, 2);
    }
    // Enter at the end of a slugline, shot, transition, action or dialogue line starts a new paragraph (an empty line
    // between); in a cue or a parenthetical it moves on to the dialogue; in a note or in the middle of a line it is a plain
    // new line, and Shift+Enter always is one
    function enter(){
      var cur = cm.getCursor(), ln = cur.line, s = line(ln);
      if (isPreLn(ln) && ln < preEnd() && !cm.somethingSelected()){ preStep(ln, true); return; }
      // /pdf alone on a line (its own paragraph) and Enter: the line is emptied again and the PDF downloads; export
      // commands start with a slash, as a dot or a comma at the start of a line always means formatting
      if (!cm.somethingSelected() && /^\s*\/pdf\s*$/i.test(s) && ln > preEnd() && paraStart(ln) && (ln + 1 >= cm.lineCount() || isBlank(line(ln + 1)))){
        put('', {line:ln, ch:0}, {line:ln, ch:s.length});
        exportPdf(cm.getValue());
        return;
      }
      // In a cue Enter does what Tab does: keep a completed name, close the cue and go to its dialogue line
      if (paraStart(ln) && (isCueLn(ln) || /^,[^,]*$/.test(s)) && (!cm.somethingSelected() || cm.getSelection().indexOf('\n') < 0)){ tab(); return; }
      if (cm.somethingSelected()) return CodeMirror.Pass;
      // In a parenthetical (anywhere in it) Enter closes the bracket and goes on with the dialogue, as in Final Draft:
      // to the dialogue line below, or to a new one; Enter on that empty line then starts a new paragraph
      if (!isBlank(s) && blockCue(ln) >= 0 && /^\s*\(/.test(s)){
        if (s.indexOf(')') < 0){ put(')', {line:ln, ch:s.length}); s = line(ln); }
        if (ln + 1 < cm.lineCount() && !isBlank(line(ln + 1))) caret(ln + 1, 0);
        else { put('\n', {line:ln, ch:s.length}); caret(ln + 1, 0); }
        cyc = null;
        return;
      }
      if (isBlank(s) || cur.ch !== s.length || isNoteLn(ln) || isCueLn(ln)) return CodeMirror.Pass;
      var below = ln + 1 < cm.lineCount() && !isBlank(line(ln + 1));
      put(below ? '\n\n\n' : '\n\n', {line:ln, ch:s.length});
      caret(ln + 2, 0);
      cyc = null;
    }
    // Backspace on the empty line of a new paragraph (empty line above, text above that) takes back the whole break
    // Enter or Tab made: the cursor returns to the end of the paragraph above and the spacing is as before
    function backspace(){
      var cur = cm.getCursor(), ln = cur.line;
      if (!cm.somethingSelected() && cur.ch === 0 && ln >= 2 && isBlank(line(ln)) && isBlank(line(ln - 1)) && !isBlank(line(ln - 2)) && !hid[ln - 1] && !hid[ln - 2]){
        put('', {line:ln - 2, ch:line(ln - 2).length}, {line:ln, ch:0});
        cyc = null;
        return;
      }
      return guard(-1);
    }
    // Option+Up/Down (Ctrl+Up/Down on Windows) move to the start or end of the paragraph, then on to the next one;
    // with Shift they select, so Option+Shift+Down from the start of a paragraph selects all of it
    function paraTarget(dir){
      var h = cm.getCursor('head'), ln = h.line, n = cm.lineCount(), j;
      if (dir > 0){
        if (isBlank(line(ln)) || (h.ch === line(ln).length && (ln + 1 >= n || isBlank(line(ln + 1))))){
          j = ln + 1;
          while (j < n && isBlank(line(j))) j++;
          if (j >= n) return {line:n - 1, ch:line(n - 1).length};
          ln = j;
        }
        while (ln + 1 < n && !isBlank(line(ln + 1))) ln++;
        return {line:ln, ch:line(ln).length};
      }
      if (isBlank(line(ln)) || (h.ch === 0 && paraStart(ln))){
        j = ln - 1;
        while (j >= 0 && isBlank(line(j))) j--;
        if (j < 0) return {line:0, ch:0};
        ln = j;
      }
      return {line:paraHead(ln), ch:0};
    }
    function paraMove(dir, extend){
      var t = paraTarget(dir);
      if (extend) cm.setSelection(cm.getCursor('anchor'), t, {scroll:true});
      else cm.setCursor(t, null, {scroll:true});
    }
    function comma(){
      var ln = cm.getCursor().line, s = line(ln);
      if (s === '' && paraStart(ln) && blockCue(ln) < 0){
        put(',,', {line:ln, ch:0}, {line:ln, ch:0}); caret(ln, 1);
        cyc = {line:ln, pos:3, text:',,'};
        activeCue = ln;
        return;
      }
      return CodeMirror.Pass;
    }
    // Typing .i, .e or .s at the start of a paragraph adds the space; .i then e (or .e then i) becomes .ie / .ei
    function autoSpace(){
      var cur = cm.getCursor(), ln = cur.line, s = line(ln);
      if (cm.somethingSelected() || !paraStart(ln)) { lastAuto = -1; return false; }
      if (cur.ch === 2 && /^\.t$/i.test(s)){
        // .t becomes an active transition with the first entry of the list
        put('.t ' + TRANS_LIST[0], {line:ln, ch:0}, {line:ln, ch:2});
        caret(ln, line(ln).length);
        activeCue = ln; lastAuto = -1;
        refresh(); // right align at once, so CUT TO: never shows on the left first
        return true;
      }
      if (cur.ch === 2 && /^\.[ies]$/i.test(s)){
        put(' ', {line:ln, ch:2}, {line:ln, ch:2}); caret(ln, 3);
        lastAuto = ln;
        return true;
      }
      if (lastAuto === ln && cur.ch === 4 && /^\.(i e|e i)$/i.test(s)){
        put('.' + s.charAt(1) + s.charAt(3) + ' ', {line:ln, ch:0}, {line:ln, ch:4}); caret(ln, 4);
        lastAuto = -1;
        return true;
      }
      lastAuto = -1;
      return false;
    }
    function openParen(){
      var cur = cm.getCursor(), ln = cur.line, s = line(ln), c = cueParts(ln);
      if (c && cur.ch >= 1 && cur.ch <= nameZone(c) && c.name.trim() !== ''){
        // Extension inside the commas: ,Tom (|),
        activeCue = ln;
        if (c.ext){ caret(ln, c.ext.e); return; }
        put(' ()', {line:ln, ch:c.nameEnd}, {line:ln, ch:c.second}); caret(ln, c.nameEnd + 2); return;
      }
      if (blockCue(ln) >= 0 && !/^\(/.test(s)){
        // Parenthetical inside a dialogue: always on its own line
        var before = s.slice(0, cur.ch).replace(/\s+$/, ''), after = s.slice(cur.ch).replace(/^\s+/, '');
        var text = (before ? before + '\n' : '') + '()' + (after ? '\n' + after : '');
        put(text, {line:ln, ch:0}, {line:ln, ch:s.length});
        caret(before ? ln + 1 : ln, 1);
        return;
      }
      return CodeMirror.Pass;
    }
    // Character names used in other cues, unique, alphabetical
    function allNames(skipLn){
      var seen = {}, out = [];
      for (var i = 0; i < cm.lineCount(); i++){
        if (i === skipLn) continue;
        var c = cueParts(i);
        if (!c) continue;
        var n = c.name.trim(), k = n.toUpperCase();
        if (n && !seen[k]){ seen[k] = 1; out.push(n); }
      }
      return out.sort(alpha);
    }
    // One name ladder for Up/Down on an active cue, each name once:
    // names above the cursor ordered from the earliest to the most recent speaker, then names below in script order.
    // Up steps backwards along the ladder, Down forwards; both stop at the ends.
    // Empty cue: Up starts at the last speaker, Down at the speaker before him (the dialogue partner).
    function nameLadder(ln){
      var seen = {}, recent = [], below = [], i, c, n, k;
      for (i = ln - 1; i >= 0; i--){
        c = cueParts(i); if (!c) continue;
        n = c.name.trim(); k = n.toUpperCase();
        if (n && !seen[k]){ seen[k] = 1; recent.push(n); }
      }
      for (i = ln + 1; i < cm.lineCount(); i++){
        c = cueParts(i); if (!c) continue;
        n = c.name.trim(); k = n.toUpperCase();
        if (n && !seen[k]){ seen[k] = 1; below.push(n); }
      }
      var above = recent.slice().reverse();
      return {list:above.concat(below), aboveLen:above.length};
    }
    // Up/Down on an active transition cycle through TRANS_LIST
    function transArrow(ln, dir){
      var s = line(ln), text = s.replace(/^\.t\s*/i, ''), idx = -1;
      for (var i = 0; i < TRANS_LIST.length; i++){ if (TRANS_LIST[i] === text.trim().toUpperCase()){ idx = i; break; } }
      idx = idx < 0 ? 0 : (idx + dir + TRANS_LIST.length) % TRANS_LIST.length;
      put('.t ' + TRANS_LIST[idx], {line:ln, ch:0}, {line:ln, ch:s.length});
      caret(ln, line(ln).length);
    }
    // A Page size or Language line of the title page: 'size' or 'lang', else null
    function settingOf(ln){
      var te = preEnd();
      if (ln <= 0 || ln >= te) return null;
      var c = cmdOf(line(ln));
      return c && (c.key === 'size' || c.key === 'lang') ? c.key : null;
    }
    // Up/Down on an active setting step through its values, in a circle
    function settingArrow(ln, dir){
      var c = cmdOf(line(ln)), vals = c.key === 'size' ? SIZES : LANGS.map(function(L){ return L.name; });
      var cur = c.key === 'size' ? (c.value.trim() ? sizeOf(c.value) : '') : ((langOf(c.value) || {}).name || ''), i = vals.indexOf(cur);
      i = i < 0 ? 0 : (i + dir + vals.length) % vals.length;
      // the new value and the renamed headings and commands are one change, so one Cmd+Z takes both back
      cm.operation(function(){
        put(' ' + vals[i], {line:ln, ch:c.label.length + 1}, {line:ln, ch:line(ln).length});
        preLabels();
        caret(ln, line(ln).length);
      });
    }
    function isActiveLn(ln){ return !!(cueParts(ln) || isTransHead(ln) || settingOf(ln)); }
    function arrow(dir){
      var cur = cm.getCursor(), ln = cur.line;
      if (activeCue === ln && settingOf(ln) && !cm.somethingSelected()){ settingArrow(ln, dir); return; }
      if (activeCue === ln && isTransHead(ln) && !cm.somethingSelected()){ transArrow(ln, dir); return; }
      var c = cueParts(ln);
      if (!c || activeCue !== ln || cm.somethingSelected()) return CodeMirror.Pass;
      if (c.ext && cur.ch >= c.ext.s && cur.ch <= c.ext.e){
        var idx = EXT.indexOf(c.ext.text.trim().toUpperCase());
        idx = idx < 0 ? 0 : (idx + dir + EXT.length) % EXT.length;
        put(EXT[idx], {line:ln, ch:c.ext.s}, {line:ln, ch:c.ext.e});
        caret(ln, c.ext.s + EXT[idx].length);
        return;
      }
      // Anywhere else on the cue line (also before the first or after the last comma) the name changes
      {
        var L = nameLadder(ln), list = L.list, a = L.aboveLen;
        if (!list.length) return CodeMirror.Pass;
        var current = c.name.trim().toUpperCase(), j = -1;
        for (var i = 0; i < list.length; i++){ if (list[i].toUpperCase() === current){ j = i; break; } }
        if (j < 0){
          if (dir < 0) j = a > 0 ? a - 1 : 0;
          else j = a >= 2 ? a - 2 : 0;
        } else {
          j = Math.max(0, Math.min(list.length - 1, j + dir));
        }
        put(list[j], {line:ln, ch:1}, {line:ln, ch:c.nameEnd});
        caret(ln, 1 + list[j].length);
        return;
      }
      return CodeMirror.Pass;
    }
    // Typing inside a cue completes the name as soon as the typed letters match exactly one known name
    function completeName(){
      if (cm.somethingSelected()) return;
      var cur = cm.getCursor(), ln = cur.line, c = cueParts(ln);
      if (!c || cur.ch !== c.nameEnd) return;
      var typed = line(ln).slice(1, c.nameEnd), up = typed.toUpperCase();
      if (!typed.trim()) return;
      var hits = allNames(ln).filter(function(n){ return n.toUpperCase().indexOf(up) === 0; });
      if (hits.length !== 1) return;
      // A completed name is always in capitals, also the letters already typed
      var full = hits[0].toUpperCase();
      if (full.length === typed.length){ if (typed !== full) put(full, {line:ln, ch:1}, {line:ln, ch:c.nameEnd}); return; }
      put(full, {line:ln, ch:1}, {line:ln, ch:c.nameEnd});
      cm.setSelection({line:ln, ch:1 + full.length}, {line:ln, ch:1 + typed.length});
    }
    // ---- Slugline completion: one segment at a time (HOUSE, then LIVING ROOM, then DAY), never the whole chain ----
    // A segment is completed as soon as the typed letters match exactly one segment already used at the same place
    // (same segments before it); times of day come only from times already used anywhere in the script, and nothing
    // after the time is offered. The completed rest is selected: typing overwrites it, Right arrow keeps it, Tab keeps it
    // (after a time Tab also moves on to the action line, after a location the cursor stays for " - ").
    var slugPend = null;
    function slugBody(s){ var m = s.match(/^\.(IE|EI|I|E)\s*/i); return m ? m[0].length : -1; }
    function slugSplit(body){
      var segs = [], re = new RegExp(SLUG_SEP.source, 'g'), last = 0, m;
      while ((m = re.exec(body))){ segs.push(body.slice(last, m.index)); last = re.lastIndex; }
      return {segs:segs, tail:body.slice(last)};
    }
    // The time word a segment starts with (longest match: SAME TIME before SAME), or ''
    function timeOf(seg){
      var t = seg.trim(), u = t.toUpperCase(), best = '';
      TIME_LIST.forEach(function(w){
        if (u.indexOf(w) === 0 && !/[A-Z0-9']/.test(u.charAt(w.length)) && w.length > best.length) best = w;
      });
      return best ? t.slice(0, best.length) : '';
    }
    // Segments of another slugline, cut after its time of day; parts.time is the index of the time segment or -1
    function slugParts(ln){
      var s = line(ln), p = slugSplit(s.slice(slugBody(s))), all = p.segs.concat([p.tail]), out = [];
      out.time = -1;
      for (var i = 0; i < all.length; i++){
        var x = all[i].trim(), tm = i > 0 ? timeOf(x) : '';
        if (tm){ out.push(tm); out.time = i; break; }
        out.push(x);
      }
      return out;
    }
    function completeSlug(){
      slugPend = null;
      if (cm.somethingSelected()) return;
      var cur = cm.getCursor(), ln = cur.line, s = line(ln);
      if (!isSlugHead(ln) || cur.ch !== s.length) return;
      var off = slugBody(s);
      if (cur.ch <= off) return;
      var me = slugSplit(s.slice(off)), typed = me.tail.replace(/^\s+/, ''), up = typed.toUpperCase(), k = me.segs.length;
      if (!typed) return;
      var pre = me.segs.map(function(x){ return x.trim().toUpperCase(); });
      // Nothing is completed after the time of day
      for (var q = 1; q < k; q++){ if (timeOf(pre[q])) return; }
      var seen = {}, cands = [];
      function add(x){ var u = x.toUpperCase(); if (x && !seen[u]){ seen[u] = 1; cands.push(x); } }
      for (var i = 0; i < cm.lineCount(); i++){
        if (i === ln || !isSlugHead(i)) continue;
        var parts = slugParts(i);
        if (k > 0 && parts.time >= 0) add(parts[parts.time]);
        if (parts.length <= k) continue;
        var same = true;
        for (var j = 0; j < k; j++){ if (parts[j].toUpperCase() !== pre[j]){ same = false; break; } }
        if (same) add(parts[k]);
      }
      var hits = cands.filter(function(x){ return x.toUpperCase().indexOf(up) === 0; });
      if (hits.length !== 1) return;
      // A completed segment is always in capitals, also the letters already typed
      var from = s.length - typed.length, full = hits[0].toUpperCase();
      if (full.length === typed.length){ if (typed !== full) put(full, {line:ln, ch:from}, {line:ln, ch:s.length}); return; }
      put(full, {line:ln, ch:from}, {line:ln, ch:s.length});
      cm.setSelection({line:ln, ch:from + full.length}, {line:ln, ch:from + typed.length});
      slugPend = {line:ln, a:from + typed.length, b:from + full.length, time:!!timeOf(full) && k > 0};
    }
    // Tab on a pending slugline completion: keep it; after a location stay on the line, after a time go on as usual
    function tabSlug(ln){
      var p = slugPend; slugPend = null;
      if (!p || p.line !== ln || !cm.somethingSelected()) return false;
      var r = cm.listSelections()[0];
      if (r.head.line !== ln || r.anchor.line !== ln || r.head.ch !== p.a || r.anchor.ch !== p.b) return false;
      if (p.time) return false;
      caret(ln, line(ln).length);
      return true;
    }
    // Reformat the whole script in one undoable step, keeping the cursor on the same character
    function reformat(){
      var old = cm.getValue(), nt = reformatText(old);
      var pos = cm.getCursor(), idx = cm.indexFromPos(pos);
      var n = old.slice(0, idx).replace(/\s/g, '').length, onBlank = isBlank(line(pos.line));
      var lastText = -1;
      for (var q = cm.lineCount() - 1; q >= 0; q--){ if (!isBlank(line(q))){ lastText = q; break; } }
      // Empty lines below the last text that hold the cursor stay (at most one empty line plus the cursor line)
      var tail = (onBlank && lastText >= 0 && pos.line > lastText) ? Math.min(pos.line - lastText, 2) : 0;
      nt += new Array(tail + 1).join('\n');
      if (nt === old) return;
      // The cursor stays where the writer left it: after the same character, on the same empty line, or before the same word
      var k = 0, i = 0;
      for (; i < nt.length && k < n; i++){ if (!/\s/.test(nt.charAt(i))) k++; }
      var target;
      cm.operation(function(){
        for (var m = 0; m < marks.length; m++) marks[m].clear();
        marks = []; hid = [];
        cm.replaceRange(nt, {line:0, ch:0}, cm.posFromIndex(old.length), '+reformat');
        if (tail) target = {line:cm.lineCount() - 1, ch:0};
        else if (onBlank) target = n === 0 ? {line:0, ch:0} : {line:cm.posFromIndex(i).line + 1, ch:0};
        else {
          var j = i;
          if (idx > 0 && /\s/.test(old.charAt(idx - 1)) && idx < old.length && !/\s/.test(old.charAt(idx))){ while (j < nt.length && /\s/.test(nt.charAt(j))) j++; }
          target = cm.posFromIndex(j);
        }
        cm.setCursor(target);
        // Line classes (bars, widths, right aligned transitions) at once, so nothing shows in the wrong place first
        refresh();
      });
      cyc = null;
    }
    // Find the cursor (Cmd+Option+. or Ctrl+Shift+.): focus, center it in view, grow to the right from 3px to FIND_PX and back
    function findCursor(){
      cm.focus();
      var pos = cm.getCursor();
      centerCursor();
      requestAnimationFrame(function(){
        var c = cm.cursorCoords(pos, 'window'), cs = getComputedStyle(host);
        var gap = parseFloat(cs.getPropertyValue('--sm-gap')) || 0, band = parseFloat(cs.getPropertyValue('--sm-band')) || (c.bottom - c.top);
        var inShot = isShotLn(pos.line);
        var el = document.createElement('div');
        el.style.cssText = 'position:fixed;z-index:9999;pointer-events:none;left:' + c.left + 'px;top:' + (c.top + gap) + 'px;height:' + band + 'px;width:3px;background:' + cs.getPropertyValue(inShot ? '--sm-blue-alt' : '--sm-blue').trim();
        document.body.appendChild(el);
        if (el.animate){
          var a = el.animate([{width:'3px'}, {width:FIND_PX + 'px'}, {width:'3px'}], {duration:FIND_MS, easing:'ease-in-out'});
          a.onfinish = function(){ el.remove(); };
        } else setTimeout(function(){ el.remove(); }, FIND_MS);
      });
    }
    cm.setOption('extraKeys', {
      'Tab': function(){ tab(); },
      'Shift-Tab': function(){},
      'Enter': function(){ return enter(); },
      'Shift-Enter': 'newlineAndIndent',
      // Up/Down pick names or extensions on an active cue and move the cursor everywhere else
      'Down': function(){ return arrow(1); },
      'Alt-Up': function(){ paraMove(-1, false); }, 'Alt-Down': function(){ paraMove(1, false); },
      'Shift-Alt-Up': function(){ paraMove(-1, true); }, 'Shift-Alt-Down': function(){ paraMove(1, true); },
      'Ctrl-Up': function(){ paraMove(-1, false); }, 'Ctrl-Down': function(){ paraMove(1, false); },
      'Shift-Ctrl-Up': function(){ paraMove(-1, true); }, 'Shift-Ctrl-Down': function(){ paraMove(1, true); },
      'Up': function(){ return arrow(-1); },
      // All other commands: Cmd+Option on Mac, Ctrl+Shift on Windows
      'Cmd-Alt-Enter': function(){ reformat(); }, 'Shift-Ctrl-Enter': function(){ reformat(); },
      'Cmd-Alt-.': function(){ findCursor(); }, 'Shift-Ctrl-.': function(){ findCursor(); },
      'Cmd-Alt-1': function(){ setView(1); }, 'Shift-Ctrl-1': function(){ setView(1); },
      'Cmd-Alt-2': function(){ setView(2); }, 'Shift-Ctrl-2': function(){ setView(2); },
      'Cmd-Alt-3': function(){ setView(3); }, 'Shift-Ctrl-3': function(){ setView(3); },
      'Cmd-Alt-4': function(){ setView(4); }, 'Shift-Ctrl-4': function(){ setView(4); },
      // Cmd+Option+5 and 0 (Ctrl+Shift on Windows) are swallowed, so the browser does not open bookmarks or tabs while writing
      'Cmd-Alt-6': function(){ toggleNotes(); }, 'Shift-Ctrl-6': function(){ toggleNotes(); },
      'Cmd-Alt-7': function(){ togglePages(); }, 'Shift-Ctrl-7': function(){ togglePages(); },
      'Cmd-Alt-8': function(){ toggleScenes(); }, 'Shift-Ctrl-8': function(){ toggleScenes(); },
      'Cmd-Alt-9': function(){ togglePre(); }, 'Shift-Ctrl-9': function(){ togglePre(); },
      'Cmd-Alt-5': function(){}, 'Cmd-Alt-0': function(){},
      'Shift-Ctrl-5': function(){}, 'Shift-Ctrl-0': function(){},
      'Esc': function(){ if (view === 1) return CodeMirror.Pass; setView(1); },
      'Backspace': function(){ return backspace(); },
      'Delete': function(){ return guard(1); }
    });
    // Cursor finding, views and notes also work when the editor has lost focus; the other numbers are swallowed there too,
    // so the browser never opens bookmarks or other pages with Cmd+Option+number (Ctrl+Shift+number on Windows)
    document.addEventListener('keydown', function(e){
      var mac = e.metaKey && e.altKey && !e.ctrlKey, win = e.ctrlKey && e.shiftKey && !e.metaKey && !e.altKey;
      if (!(mac || win) || cm.hasFocus()) return;
      if (e.code === 'Period'){ e.preventDefault(); findCursor(); return; }
      var d = /^(Digit|Numpad)([0-9])$/.exec(e.code);
      if (!d) return;
      e.preventDefault(); e.stopPropagation();
      var n = +d[2];
      if (n >= 1 && n <= 4) setView(n);
      else if (n === 6) toggleNotes();
      else if (n === 7) togglePages();
      else if (n === 8) toggleScenes();
      else if (n === 9) togglePre();
    }, true);
    // Typed , and ( : take the character back out, apply the shortcut, or put it back; other characters may add the slug/shot space or complete a name
    cm.on('inputRead', function(_cm, ch){
      if (ch.text.length !== 1) return;
      if (isActiveLn(cm.getCursor().line)) activeCue = cm.getCursor().line;
      var t = ch.text[0];
      if (t !== ',' && t !== '('){
        if (t.length === 1 && !autoSpace()){ completeName(); completeSlug(); }
        return;
      }
      lastAuto = -1;
      var at = {line:ch.from.line, ch:ch.from.ch};
      if (line(at.line).charAt(at.ch) !== t) return;
      put('', at, {line:at.line, ch:at.ch + 1});
      caret(at.line, at.ch);
      var r = t === ',' ? comma() : openParen();
      if (r === CodeMirror.Pass){ put(t, at, at); caret(at.line, at.ch + 1); }
    });
    // Right aligned transition lines change where characters sit, so CodeMirror is told to measure again when they change
    var transKey = '', spacedFor = -1;
    // A new paragraph about to be written: the cursor on an empty line with another empty line above it (what Enter and Tab
    // make); it counts as a paragraph for the spacing, so nothing moves once typing starts. -1 if there is none
    function slotLine(){
      var c = cm.getCursor().line;
      return (c > 0 && isBlank(line(c)) && isBlank(line(c - 1))) ? c : -1;
    }
    cm.on('cursorActivity', function(){ if (slotLine() !== spacedFor) decorate(); });
    function decorate(){
      var tk = '', noted = {}, ps = paragraphs(true), curLn = slotLine(), te = preEnd(), lang = langIn(line, te);
      function empty(j){ return j !== curLn && isBlank(line(j)); }
      spacedFor = curLn;
      // A scene holding notes shows // at the right end of its slugline bar, in the slugline's own colour
      for (var k = 0; k < ps.length; k++){ if (ps[k].type === 'note' && ps[k].scene >= 0) noted[ps[k].scene] = 1; }
      // Each line's classes are worked out first and written only where they differ: rewriting every line on every
      // keystroke made CodeMirror draw the whole script again each time
      var W = [], X = [];
      function want(i, where, cls){ var a = where === 'wrap' ? W : X; a[i] = a[i] ? a[i] + ' ' + cls : cls; }
      cm.operation(function(){
        for (var i = 0; i < cm.lineCount(); i++){
          if (i <= topGone){ want(i, 'wrap', 'sm-gone'); continue; }
          var s = line(i);
          // Final Draft spacing: two empty lines before a slugline or a shot, one before everything else; the writer
          // types one, so the empty line right above a slugline is shown at double height
          // An empty line holding the cursor is a paragraph being written, so the spacing does not jump once typing starts
          if (empty(i) && !hid[i] && i > 0 && !empty(i - 1)){
            var nx = i + 1;
            while (nx < cm.lineCount() && empty(nx)) nx++;
            if (nx < cm.lineCount() && nx !== curLn && (isSlugHead(nx) || isShotHead(nx)) && i - 1 > te) want(i, 'wrap', 'sm-sp2');
          }
          if (hid[i] || isBlank(s)) continue;
          if (i <= te || isMarkLn(i)){
            want(i, 'text', 'sm-t-act sm-t-note');
            if (i < te && headOf(s)) want(i, 'wrap', 'sm-head');
            if (i === activeCue && settingOf(i)) want(i, 'wrap', 'sm-set-on');
          }
          else if (isSlugLn(i)){
            want(i, 'wrap', 'sm-l-slug' + (noted[i] ? ' sm-n-note' : ''));
            want(i, 'text', isSlugHead(i) ? 'sm-t-s' + Math.min(slugDelta(s, lang), 12) : 'sm-t-act');
          }
          else if (isNoteLn(i)) want(i, 'text', 'sm-t-act sm-t-note');
          else if (isShotLn(i)) want(i, 'text', 'sm-t-act sm-t-shot');
          else if (isTransLn(i)){ want(i, 'text', 'sm-t-trans'); tk += i + ','; }
          else if (isCueLn(i)) {}
          else if (blockCue(i) >= 0) want(i, 'text', /^\(/.test(s) ? 'sm-t-par' : 'sm-t-dlg');
          else want(i, 'text', 'sm-t-act');
        }
        for (var j = 0; j < cm.lineCount(); j++){
          var h = cm.getLineHandle(j), w = W[j] || '', x = X[j] || '';
          if ((h.wrapClass || '') !== w){ cm.removeLineClass(j, 'wrap'); if (w) cm.addLineClass(j, 'wrap', w); }
          if ((h.textClass || '') !== x){ cm.removeLineClass(j, 'text'); if (x) cm.addLineClass(j, 'text', x); }
        }
      });
      if (tk !== transKey){ transKey = tk; cm.refresh(); }
      barCursor();
    }
    // ---- Margin numbers: not part of the text, so never edited, copied or saved ----
    // Page numbers (reading script) right of the editor, at the line where each page begins: colorForeground with a
    // period; whole script only (hidden in views 2 to 4); Cmd+Option+7 (Ctrl+Shift+7).
    // Scene numbers left of the left frame line, at each slugline, in colorForeground, without a period; off until
    // Cmd+Option+8 (Ctrl+Shift+8); shown in every view for the sluglines that are visible.
    var pagesOn = true, scenesOn = false, pageStarts = [], sceneStarts = [];
    function marginLayer(cls){ var d = document.createElement('div'); d.className = cls; host.appendChild(d); return d; }
    var pageLayer = marginLayer('sm-pages'), sceneLayer = marginLayer('sm-scenes');
    function fill(layer, labels, cls){
      while (layer.children.length > labels.length) layer.removeChild(layer.lastChild);
      while (layer.children.length < labels.length){ var n = document.createElement('div'); n.className = cls; layer.appendChild(n); }
      for (var k = 0; k < labels.length; k++) if (layer.children[k].textContent !== labels[k]) layer.children[k].textContent = labels[k];
    }
    // The editor has no inner scrolling, so each number keeps its place next to its line: positions are worked out
    // in document coordinates whenever the text or the layout changes, and the page scrolls numbers and text together
    function placePages(){
      var showPages = pagesOn && view === 1;
      pageLayer.style.display = showPages ? '' : 'none';
      sceneLayer.style.display = scenesOn ? '' : 'none';
      if (!showPages && !scenesOn) return;
      var wrap = cm.getWrapperElement(), origin = {line:0, ch:0};
      // From the editor's top edge to the top of its first line (the lines' padding)
      var lead = cm.charCoords(origin, 'window').top - wrap.getBoundingClientRect().top - cm.charCoords(origin, 'local').top;
      function place(layer, starts){
        layer.style.top = wrap.offsetTop + 'px';
        for (var k = 0; k < starts.length; k++) layer.children[k].style.top = (cm.charCoords(starts[k], 'local').top + lead) + 'px';
      }
      if (showPages) place(pageLayer, pageStarts);
      if (scenesOn) place(sceneLayer, sceneStarts);
    }
    function paginatePages(){
      pageStarts = paginate(cm.getValue());
      fill(pageLayer, pageStarts.map(function(_, k){ return (k + 2) + '.'; }), 'sm-pagenum');
      // Scenes are counted over the whole script, so a number stays the same in every view
      var labels = [], scene = 0;
      sceneStarts = [];
      for (var i = 0; i < cm.lineCount(); i++){
        if (!isSlugHead(i)) continue;
        scene++;
        if (hid[i]) continue;
        sceneStarts.push({line:i, ch:0}); labels.push(String(scene));
      }
      fill(sceneLayer, labels, 'sm-scenenum');
      placePages();
    }
    function togglePages(){ pagesOn = !pagesOn; paginatePages(); }
    // Lines move without a text change too (views, notes on and off, the spacing around a new paragraph):
    // place the numbers again after every redraw, once CodeMirror has measured the lines
    cm.on('update', placePages);
    function toggleScenes(){ scenesOn = !scenesOn; paginatePages(); }
    // The title page always has an empty line right after the opening --- and right before the closing ---
    // Undo and redo leave the title page as they find it: the automatic fixes (empty lines, names, a script line below)
    // would otherwise be redone at once after every Cmd+Z, and Cmd+Z could never get past them
    var undoing = false;
    function preGaps(){
      if (undoing) return;
      var te = preEnd();
      if (te < 0) return;
      if (!isBlank(line(te - 1))) cm.replaceRange('\n', {line:te, ch:0}, {line:te, ch:0}, '+pre');
      if (!isBlank(line(1))) cm.replaceRange('\n', {line:0, ch:line(0).length}, {line:0, ch:line(0).length}, '+pre');
    }
    // The language on the title page names its headings and commands: switching Language: English to Deutsch turns
    // Title: into Titel: and //TITLE PAGE into //TITELSEITE; values stay as written
    function preLabels(){
      if (undoing) return;
      var te = preEnd();
      if (te < 0) return;
      var lv = preValue(line, te, 'lang');
      if (lv === null) return;
      var L = langOf(lv) || LANGS[0];
      for (var k = 1; k < te; k++){
        var s = line(k), h = headOf(s), c = cmdOf(s);
        // values only come from Up/Down; anything else (an older typed value) becomes the proper one
        if (c && (c.key === 'lang' || c.key === 'size')){
          var want = ' ' + (c.key === 'lang' ? L.name : sizeOf(c.value));
          if (c.value !== want){ cm.replaceRange(want, {line:k, ch:c.label.length + 1}, {line:k, ch:s.length}, '+pre'); s = line(k); c = cmdOf(s); }
        }
        if (h && s !== '//' + L.head[h]) cm.replaceRange('//' + L.head[h], {line:k, ch:0}, {line:k, ch:s.length}, '+pre');
        else if (c && c.label !== L.cmd[c.key]) cm.replaceRange(L.cmd[c.key], {line:k, ch:0}, {line:k, ch:c.label.length}, '+pre');
      }
    }
    function refresh(){ preGaps(); cm.operation(function(){ applyView(); decorate(); }); belowPre(); paginatePages(); undoing = false; }
    // A hidden title page always has a script line below it: with nothing after the closing --- the cursor would stay
    // invisible inside the hidden title page, and Tab or typing would go there
    function belowPre(){
      var te = preEnd();
      if (te < 0 || topGone < te) return;
      if (te === cm.lastLine() && !undoing){ cm.replaceRange('\n\n', {line:te, ch:line(te).length}, null, '+pre'); cm.setCursor({line:cm.lastLine(), ch:0}); return; }
      // a script opens with the cursor on line 0, inside the hidden title page: it goes to the first script line
      if (cm.getCursor().line <= te && !cm.somethingSelected()) cm.setCursor({line:Math.min(topGone + 1, cm.lastLine()), ch:0});
    }
    var timer = null;
    cm.on('changes', function(_cm, list){
      if (collapseAfter){ collapseAfter = false; cm.setCursor(CodeMirror.changeEnd(list[list.length - 1])); }
      undoing = list.some(function(c){ return c.origin === 'undo' || c.origin === 'redo'; });
      preGaps(); preLabels();
      for (var k = 0; k < list.length; k++){ if (list[k].origin !== ORIGIN){ cyc = null; break; } }
      // A whole new text (a script arriving from the database, or the newer local copy laid over it) is hidden and
      // coloured before the browser paints, so a hidden title page never flashes up as plain text
      var whole = false;
      // the title page is short and its bars follow every letter, so it is redrawn at once too
      var te = preEnd();
      for (var w = 0; w < list.length; w++){ if (list[w].origin === 'setValue' || list[w].origin === '+restore' || list[w].from.line <= te + 1) whole = true; }
      clearTimeout(timer);
      if (whole) refresh(); else timer = setTimeout(refresh, 30);
      clearTimeout(saveTimer); saveTimer = setTimeout(save, SAVE_MS);
      sync.changed();
    });
    cm.on('cursorActivity', barCursor);
    // The cursor never rests in hidden lines at the top (they have no height); it goes to the first visible line
    cm.on('cursorActivity', function(){
      if (topGone >= 0 && cm.getCursor().line <= topGone && !cm.somethingSelected() && topGone + 1 < cm.lineCount()) cm.setCursor({line:topGone + 1, ch:0});
    });
    // Notes on and off (Cmd+Option+6, Ctrl+Shift+6); Escape leaves it as it is.
    // A note hidden by Cmd+Option+6 or by the view stays visible while it holds the cursor, until the cursor leaves it.
    var noteCur = -1;
    function toggleNotes(){ notesOff = !notesOff; refresh(); }
    // Cmd+Option+9 (Ctrl+Shift+9): show or hide the preamble at the top; the first time it is just the commands
    function togglePre(){
      preOn = !preOn;
      var r = preRange();
      if (preOn){
        if (!r){
          var rest = cm.getValue().replace(/^\s+/, '');
          cm.replaceRange(preTemplate(LANGS[0]) + (rest ? '\n\n' : ''), {line:0, ch:0}, {line:0, ch:0}, '+pre');
          r = preRange();
        } else if (preValue(line, r.e, 'size') === null && preValue(line, r.e, 'lang') === null){
          // A title page from before the settings gets them, in English and A4 (unhidden first, hidden text is read only)
          refresh();
          var last = r.e - 1;
          while (last > 0 && isBlank(line(last))) last--;
          cm.replaceRange('\n\n' + preSettings(LANGS[0], 'A4'), {line:last, ch:line(last).length}, null, '+pre');
          r = preRange();
        }
        // A title page without its heading gets it, in its own language
        var hasHead = false;
        for (var hk = 1; hk < r.e; hk++){ if (headOf(line(hk)) === 'title') hasHead = true; }
        if (!hasHead){
          refresh();
          var HL = langOf(preValue(line, r.e, 'lang') || '') || LANGS[0];
          cm.replaceRange('//' + HL.head.title + '\n', {line:2, ch:0}, null, '+pre');
          r = preRange();
        }
        refresh(); // unhide first, a cursor cannot be placed inside hidden lines
        var first = 1;
        while (first < r.e - 1 && !isPreHead(first, r.e)) first++;
        cm.setCursor({line:first, ch:line(first).length});
        window.scrollTo(0, 0);
      } else if (r){
        // Nothing below the closing ---: add an empty line and an empty script line, or the cursor would land on the
        // hidden --- and typing there would break the fence
        if (r.e === cm.lastLine()) cm.replaceRange('\n\n', {line:r.e, ch:line(r.e).length}, null, '+pre');
        var c = cm.getCursor().line;
        if (c >= r.s && c <= r.e + 1){
          var nx = r.e + 1;
          while (nx < cm.lineCount() - 1 && isBlank(line(nx))) nx++;
          cm.setCursor({line:nx, ch:0});
        }
      }
      refresh();
      cm.focus();
    }
    cm.on('cursorActivity', function(){
      var ln = cm.getCursor().line, inNote = isNoteLn(ln) ? paraHead(ln) : -1;
      if ((notesOff || view !== 1) && noteCur >= 0 && inNote !== noteCur){ noteCur = inNote; refresh(); }
      else noteCur = inNote;
    });
    // The text ends with page MAX_PAGES: typing, Tab and pasting that would start another page are refused;
    // deleting, undo, redo, Reformat and loading a script always work
    // Page size and Language lines cannot be typed in or deleted on their own; Up/Down change the value. A change that
    // takes the whole line with it (a selection from above to below it) still works
    // Invisible control characters (Ctrl+Option+Z on a Mac types one, CodeMirror shows them as red dots) never get in
    var CTRL = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F\u200B-\u200F\u2028\u2029\uFEFF]/g;
    cm.on('beforeChange', function(_cm, ch){
      if (!ch.update || !/^(\+input|paste|\*compose|drag)/.test(ch.origin || '')) return;
      var t = ch.text.join('\n');
      if (!CTRL.test(t)) return;
      CTRL.lastIndex = 0;
      var clean = t.replace(CTRL, '');
      if (clean === '' && CodeMirror.cmpPos(ch.from, ch.to) === 0){ ch.cancel(); return; }
      ch.update(ch.from, ch.to, clean.split('\n'));
    });
    // A change that starts inside the hidden title page and reaches into the script (Cmd+A, then typing or Backspace)
    // is moved to start right after the hidden lines, with the script set off by an empty line: CodeMirror would put the
    // new text in front of the read only title page and break it. Afterwards the cursor stands after the new text, so the
    // old selection over the hidden title page is gone. The result is one change, so one Cmd+Z takes it all back
    var collapseAfter = false;
    cm.on('beforeChange', function(_cm, ch){
      var o = ch.origin || '';
      if (!ch.update || o === 'setValue' || o === 'undo' || o === 'redo' || o === '+restore' || o === '+reformat') return;
      var te = preEnd();
      if (te < 0 || topGone < te) return;
      var P = CodeMirror.cmpPos, first = {line:topGone + 1, ch:0};
      if (topGone + 1 > cm.lastLine() || P(ch.from, first) >= 0 || P(ch.to, first) < 0) return;
      ch.update({line:topGone, ch:line(topGone).length}, ch.to, (topGone > te ? [''] : ['', '']).concat(ch.text));
      ch.smKeep = true; collapseAfter = true;
    });
    // A whole new text laid over the old one (the newer local copy over the server version) must replace everything:
    // hidden text is read only, and CodeMirror would keep it and put the new text in front of it (a second title page)
    cm.on('beforeChange', function(_cm, ch){
      if (ch.origin !== '+restore') return;
      for (var m = 0; m < marks.length; m++) marks[m].clear();
      marks = []; hid = []; topGone = -1;
    });
    cm.on('beforeChange', function(_cm, ch){
      if (ch.origin === 'setValue' || ch.origin === 'undo' || ch.origin === 'redo' || ch.origin === ORIGIN || ch.origin === '+pre' || ch.origin === '+reformat' || ch.origin === '+restore') return;
      if (ch.smKeep) return; // the editor's own delete of everything below a hidden title page
      var a = ch.from.line, b = ch.to.line;
      if (settingOf(a) || settingOf(b)) { ch.cancel(); return; }
      // The commands Title: and Author: (with the space after them) and the // headings are fixed, the values are free
      var te = preEnd();
      function locked(pos){
        if (pos.line <= 0 || pos.line >= te) return false;
        var s = line(pos.line);
        if (headOf(s)) return true;
        var c = cmdOf(s);
        return !!c && (c.key === 'title' || c.key === 'author') && pos.ch < c.label.length + 1 + (s.charAt(c.label.length + 1) === ' ' ? 1 : 0);
      }
      if (te > 0 && (locked(ch.from) || (b !== a || ch.to.ch !== ch.from.ch) && locked(ch.to))) { ch.cancel(); return; }
      // The opening and the closing --- stay as they are (Backspace at the start of the script would join it to the
      // closing --- and the title page would be gone); a change that takes the whole title page with it still works
      if (te > 0){
        var whole = a === 0 && ch.from.ch === 0 && (b > te || (b === te && ch.to.ch === line(te).length));
        var fence = function(l){ return l === 0 || l === te; };
        if (!whole && (fence(a) || fence(b))) ch.cancel();
      }
    });
    cm.on('beforeChange', function(_cm, ch){
      if (ch.origin === 'setValue' || ch.origin === 'undo' || ch.origin === 'redo' || ch.origin === '+reformat' || ch.origin === '+restore') return;
      if (ch.text.join('') === '') return;
      var from = cm.indexFromPos(ch.from), to = cm.indexFromPos(ch.to), old = cm.getValue();
      var next = old.slice(0, from) + ch.text.join('\n') + old.slice(to);
      var pages = paginate(next).length + 1;
      if (pages > MAX_PAGES && pages > paginate(old).length + 1) ch.cancel();
    });
    // Leaving the cue line ends the active cue; a click into a cue makes it active
    cm.on('mousedown', function(){
      clicked = true;
      setTimeout(function(){ clicked = false; var ln = cm.getCursor().line; activeCue = isActiveLn(ln) ? ln : -1; }, 0);
    });
    cm.on('cursorActivity', function(){
      var was = activeCue, ln = cm.getCursor().line;
      if (clicked) activeCue = isActiveLn(ln) ? ln : -1; // at once, an arrow key right after the click already counts
      else if (ln !== activeCue) activeCue = -1;
      if ((settingOf(was) || settingOf(activeCue)) && was !== activeCue) decorate();
    });
    refresh(); // the text from this browser is hidden and coloured at once too
    measureBand();
    paginatePages();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function(){ cm.refresh(); measureBand(); placePages(); });
    window.addEventListener('resize', function(){ measureBand(); placePages(); });
  }
  // Load CodeMirror plus the mark-selection addon (selected text gets its own class, so the highlight can match the text height)
  var BASE = 'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/';
  function loadScript(src, cb){ var s = document.createElement('script'); s.src = src; s.onload = cb; document.head.appendChild(s); }
  function withAddon(){
    if (window.__smMarkSelection) return init();
    loadScript(BASE + 'addon/selection/mark-selection.min.js', function(){ window.__smMarkSelection = 1; init(); });
  }
  function load(){
    if (window.CodeMirror) return withAddon();
    loadScript(BASE + 'codemirror.min.js', withAddon);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load); else load();
})();
