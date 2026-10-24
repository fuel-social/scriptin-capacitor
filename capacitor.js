// scriptin Machine editor (Capacitor). Colors come from window.SM_THEME, set in the Bubble element htmlCapacitor.
(function(){
  var T = window.SM_THEME || {};
  // Printed line lengths in characters (Cole & Haag, 10 cpi)
  var W_ACTION = 55, W_DIALOG = 35, W_PAREN = 19;
  var PAD = 32; // 16px left + 16px right inside each line
  var PREFIX = {I:'INT.', E:'EXT.', IE:'INT./EXT.', EI:'EXT./INT.'};
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
  function slugDelta(s){
    var m = s.match(/^\.(IE|EI|I|E)(\s|$)/i);
    if (!m) return -1;
    return PREFIX[m[1].toUpperCase()].length - m[1].length - 1;
  }
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
    var paras = [], cur = [];
    text.split('\n').map(normLine).forEach(function(l){
      if (l === ''){ if (cur.length){ paras.push(cur); cur = []; } }
      else cur.push(l);
    });
    if (cur.length) paras.push(cur);
    return paras.map(function(p){
      var h = p[0], m;
      if (/^\.(IE|EI|I|E)(\s|$)/i.test(h)){
        return p.map(function(l, i){
          l = l.toUpperCase();
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
  function defineMode(){
    CodeMirror.defineMode('scriptin', function(){
      return {
        startState: function(){ return {cue:false, prevBlank:true}; },
        blankLine: function(state){ state.prevBlank = true; },
        token: function(stream, state){
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
    for (var d = 0; d <= 8; d++) css += '#sm-editor pre.sm-t-s' + d + '{width:calc(' + (W_ACTION - d) + 'ch + ' + PAD + 'px)}\n';
    // Holding Option on a Mac would switch the mouse pointer to CodeMirror's rectangle selection crosshair; keep the text pointer
    css += '#sm-editor .CodeMirror-crosshair,#sm-editor .CodeMirror-crosshair *{cursor:text !important}\n';
    // Transition block: cue colour behind, shot colour for the letters, text right aligned at the page width;
    // the line spans the whole editor and the text's own padding carries the block on to the right frame line,
    // so the block is one piece with the same height as cue blocks (as shot blocks run to the left frame line)
    css += '#sm-editor .CodeMirror pre.CodeMirror-line.sm-t-trans{width:100%;padding-right:0;text-align:right}\n#sm-editor pre.sm-t-trans > span{background:var(--sm-frame);color:var(--sm-inactive);padding-right:var(--sm-trans-tail,67px) !important;box-shadow:-16px 0 0 var(--sm-frame);-webkit-box-decoration-break:clone;box-decoration-break:clone}\n';
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
    widthStyles();
    defineMode();
    var saved = '';
    try { saved = window.localStorage.getItem(STORE_KEY) || ''; } catch (e){}
    // An address ending in #<token>.<key> opens a script from the database: start empty and read only until it has arrived
    var linked = HASH.test(window.location.hash || '');
    var cm = CodeMirror(host, {value:linked ? '' : saved, readOnly:linked, mode:'scriptin', lineWrapping:true, autofocus:true, cursorBlinkRate:0, styleSelectedText:true});
    // The editor fills the htmlCapacitor element, leaving the same 80px gap at the bottom as at the top
    var box = host.parentNode, boxH = box ? box.clientHeight : 0;
    if (boxH > 240) cm.setSize(null, boxH - 160);
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
      host.style.setProperty('--sm-band', r.height + 'px');
      host.style.setProperty('--sm-gap', (r.top - lr.top) + 'px');
      // Distance from the page's right text edge to the editor's right frame line
      host.style.setProperty('--sm-trans-tail', (cm.display.lineDiv.clientWidth - (W_ACTION * cm.defaultCharWidth() + PAD / 2)) + 'px');
    }
    function line(ln){ return cm.getLine(ln); }
    function put(text, from, to){ cm.replaceRange(text, from, to, ORIGIN); }
    function caret(ln, ch){ cm.setCursor({line:ln, ch:ch}); }
    // A paragraph is a run of non-empty lines; its first line decides what the whole paragraph is
    function paraStart(ln){ return ln === 0 || isBlank(line(ln - 1)); }
    function paraHead(ln){ var i = ln; while (i > 0 && !isBlank(line(i - 1))) i--; return i; }
    function isSlugHead(ln){ return paraStart(ln) && slugDelta(line(ln)) >= 0; }
    function isSlugLn(ln){ return !isBlank(line(ln)) && isSlugHead(paraHead(ln)); }
    // Shot: paragraph starting with .s and a space; not part of the Tab ring
    function isShotHead(ln){ return paraStart(ln) && SHOT.test(line(ln)); }
    function isShotLn(ln){ return !isBlank(line(ln)) && isShotHead(paraHead(ln)); }
    function isTransHead(ln){ return paraStart(ln) && TRANS.test(line(ln)); }
    function isTransLn(ln){ return !isBlank(line(ln)) && isTransHead(paraHead(ln)); }
    function isNoteHead(ln){ return paraStart(ln) && NOTE.test(line(ln)); }
    function isNoteLn(ln){ return !isBlank(line(ln)) && isNoteHead(paraHead(ln)); }
    // Cursor in a shot block uses the other theme's colorBlue
    function barCursor(){
      cm.getWrapperElement().classList.toggle('sm-on-bar', isShotLn(cm.getCursor().line));
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
    var view = 1, who = '', marks = [], hid = [], home = null, viewPos = null, notesOff = false;
    function paragraphs(noCursor){
      var out = [], n = cm.lineCount(), i = 0;
      while (i < n){
        if (isBlank(line(i))){ i++; continue; }
        var s = i;
        while (i < n && !isBlank(line(i))) i++;
        var h = line(s), type = 'action', name = '', c;
        if (slugDelta(h) >= 0) type = 'slug';
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
      if (cl >= p.s && cl <= p.e) return true;
      // Notes: Cmd+Option+6 shows or hides them all; shown, a note appears only when its scene's slugline is visible
      // (before the first slugline only in view 1); the note holding the cursor always stays
      if (p.type === 'note') return !notesOff && p.keep;
      if (view === 1) return true;
      if (p.type === 'slug') return p.keep;
      return matches(p);
    }
    // Hidden runs collapse into the empty line that already separates the visible paragraphs; they are read only
    function hideRange(a, b, fromStart){
      if (b < a) return;
      marks.push(cm.markText({line:a, ch:fromStart ? 0 : line(a).length}, {line:b, ch:line(b).length}, {collapsed:true, readOnly:true, inclusiveLeft:false, inclusiveRight:false}));
      for (var i = a; i <= b; i++) hid[i] = 1;
    }
    function applyView(){
      for (var m = 0; m < marks.length; m++) marks[m].clear();
      marks = []; hid = [];
      if (view === 1 && !notesOff) return;
      var ps = paragraphs(), cl = cm.getCursor().line, prevEnd = -1, run = false;
      for (var k = 0; k < ps.length; k++){
        if (shows(ps[k], cl)){
          if (run) hideRange(prevEnd < 0 ? 0 : prevEnd + 1, ps[k].s - 1, prevEnd < 0);
          run = false; prevEnd = ps[k].e;
        } else run = true;
      }
      if (run) hideRange(prevEnd < 0 ? 0 : prevEnd + 1, cm.lineCount() - 1, prevEnd < 0);
    }
    function centerCursor(){
      var lc = cm.charCoords(cm.getCursor(), 'local'), info = cm.getScrollInfo();
      cm.scrollTo(null, Math.max(0, lc.top - info.clientHeight / 2));
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
    // In a view, Backspace and Delete never join a visible paragraph with hidden text
    function guard(dir){
      if (view === 1 || cm.somethingSelected()) return CodeMirror.Pass;
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
      if (isBlank(s)) return cm.getValue().trim() === '' ? -1 : 2;
      return null;
    }
    function tab(){
      var cur = cm.getCursor(), ln = cur.line, s = line(ln);
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
    function arrow(dir){
      var cur = cm.getCursor(), ln = cur.line;
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
      if (hits.length !== 1 || hits[0].length === typed.length) return;
      put(hits[0], {line:ln, ch:1}, {line:ln, ch:c.nameEnd});
      cm.setSelection({line:ln, ch:1 + hits[0].length}, {line:ln, ch:1 + typed.length});
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
      if (hits.length !== 1 || hits[0].length === typed.length) return;
      // The typed letters stay as typed; the rest follows in lowercase while the writer types lowercase (Reformat capitalizes)
      var from = s.length - typed.length, rest = hits[0].slice(typed.length);
      if (typed === typed.toLowerCase()) rest = rest.toLowerCase();
      put(rest, {line:ln, ch:s.length}, {line:ln, ch:s.length});
      cm.setSelection({line:ln, ch:from + hits[0].length}, {line:ln, ch:from + typed.length});
      slugPend = {line:ln, a:from + typed.length, b:from + hits[0].length, time:!!timeOf(hits[0]) && k > 0};
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
      var r = host.getBoundingClientRect();
      if (r.top < 0 || r.top > window.innerHeight) window.scrollTo(0, 0);
      var pos = cm.getCursor(), lc = cm.charCoords(pos, 'local'), info = cm.getScrollInfo();
      cm.scrollTo(null, Math.max(0, lc.top - info.clientHeight / 2));
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
      // Up/Down pick names or extensions on an active cue and move the cursor everywhere else
      'Down': function(){ return arrow(1); },
      'Up': function(){ return arrow(-1); },
      // All other commands: Cmd+Option on Mac, Ctrl+Shift on Windows
      'Cmd-Alt-Enter': function(){ reformat(); }, 'Shift-Ctrl-Enter': function(){ reformat(); },
      'Cmd-Alt-.': function(){ findCursor(); }, 'Shift-Ctrl-.': function(){ findCursor(); },
      'Cmd-Alt-1': function(){ setView(1); }, 'Shift-Ctrl-1': function(){ setView(1); },
      'Cmd-Alt-2': function(){ setView(2); }, 'Shift-Ctrl-2': function(){ setView(2); },
      'Cmd-Alt-3': function(){ setView(3); }, 'Shift-Ctrl-3': function(){ setView(3); },
      'Cmd-Alt-4': function(){ setView(4); }, 'Shift-Ctrl-4': function(){ setView(4); },
      // Cmd+Option+5 to 9 and 0 (Ctrl+Shift on Windows) are swallowed, so the browser does not open bookmarks or tabs while writing
      'Cmd-Alt-6': function(){ toggleNotes(); }, 'Shift-Ctrl-6': function(){ toggleNotes(); },
      'Cmd-Alt-5': function(){}, 'Cmd-Alt-7': function(){}, 'Cmd-Alt-8': function(){}, 'Cmd-Alt-9': function(){}, 'Cmd-Alt-0': function(){},
      'Shift-Ctrl-5': function(){}, 'Shift-Ctrl-7': function(){}, 'Shift-Ctrl-8': function(){}, 'Shift-Ctrl-9': function(){}, 'Shift-Ctrl-0': function(){},
      'Esc': function(){ if (view === 1) return CodeMirror.Pass; setView(1); },
      'Backspace': function(){ return guard(-1); },
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
    }, true);
    // Typed , and ( : take the character back out, apply the shortcut, or put it back; other characters may add the slug/shot space or complete a name
    cm.on('inputRead', function(_cm, ch){
      if (ch.text.length !== 1) return;
      if (cueParts(cm.getCursor().line) || isTransHead(cm.getCursor().line)) activeCue = cm.getCursor().line;
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
    var transKey = '';
    function decorate(){
      var tk = '', noted = {}, ps = paragraphs(true);
      // A scene holding notes shows // at the right end of its slugline bar, in the slugline's own colour
      for (var k = 0; k < ps.length; k++){ if (ps[k].type === 'note' && ps[k].scene >= 0) noted[ps[k].scene] = 1; }
      cm.operation(function(){
        for (var i = 0; i < cm.lineCount(); i++){
          cm.removeLineClass(i, 'wrap');
          cm.removeLineClass(i, 'text');
          var s = line(i);
          if (hid[i] || isBlank(s)) continue;
          if (isSlugLn(i)){
            cm.addLineClass(i, 'wrap', 'sm-l-slug' + (noted[i] ? ' sm-n-note' : ''));
            cm.addLineClass(i, 'text', isSlugHead(i) ? 'sm-t-s' + Math.min(slugDelta(s), 8) : 'sm-t-act');
          }
          else if (isNoteLn(i)) cm.addLineClass(i, 'text', 'sm-t-act sm-t-note');
          else if (isShotLn(i)) cm.addLineClass(i, 'text', 'sm-t-act sm-t-shot');
          else if (isTransLn(i)){ cm.addLineClass(i, 'text', 'sm-t-trans'); tk += i + ','; }
          else if (isCueLn(i)) {}
          else if (blockCue(i) >= 0) cm.addLineClass(i, 'text', /^\(/.test(s) ? 'sm-t-par' : 'sm-t-dlg');
          else cm.addLineClass(i, 'text', 'sm-t-act');
        }
      });
      if (tk !== transKey){ transKey = tk; cm.refresh(); }
      barCursor();
    }
    function refresh(){ cm.operation(function(){ applyView(); decorate(); }); }
    var timer = null;
    cm.on('changes', function(_cm, list){
      for (var k = 0; k < list.length; k++){ if (list[k].origin !== ORIGIN){ cyc = null; break; } }
      clearTimeout(timer); timer = setTimeout(refresh, 30);
      clearTimeout(saveTimer); saveTimer = setTimeout(save, SAVE_MS);
      sync.changed();
    });
    cm.on('cursorActivity', barCursor);
    // Notes on and off (Cmd+Option+6, Ctrl+Shift+6); Escape leaves it as it is.
    // A note hidden by Cmd+Option+6 or by the view stays visible while it holds the cursor, until the cursor leaves it.
    var noteCur = -1;
    function toggleNotes(){ notesOff = !notesOff; refresh(); }
    cm.on('cursorActivity', function(){
      var ln = cm.getCursor().line, inNote = isNoteLn(ln) ? paraHead(ln) : -1;
      if ((notesOff || view !== 1) && noteCur >= 0 && inNote !== noteCur){ noteCur = inNote; refresh(); }
      else noteCur = inNote;
    });
    // For now the text is capped about one line before the bottom of the editor: typing, Tab and pasting that would
    // go further are refused; deleting, undo, redo and Reformat always work
    cm.on('beforeChange', function(_cm, ch){
      if (ch.origin === 'setValue' || ch.origin === 'undo' || ch.origin === 'redo' || ch.origin === '+reformat' || ch.origin === '+restore') return;
      var add = ch.text.length - 1;
      if (add === 0 && ch.text[0] === '') return;
      var last = cm.lastLine(), bottom = cm.heightAtLine(last, 'local') + cm.getLineHandle(last).height;
      var lh = cm.defaultTextHeight(), limit = cm.getScrollInfo().clientHeight - 10 - lh;
      if (bottom + (add - (ch.to.line - ch.from.line)) * lh > limit) ch.cancel();
    });
    // Leaving the cue line ends the active cue; a click into a cue makes it active
    cm.on('mousedown', function(){
      clicked = true;
      setTimeout(function(){ clicked = false; var ln = cm.getCursor().line; activeCue = (cueParts(ln) || isTransHead(ln)) ? ln : -1; }, 0);
    });
    cm.on('cursorActivity', function(){
      if (!clicked && cm.getCursor().line !== activeCue) activeCue = -1;
    });
    decorate();
    measureBand();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function(){ cm.refresh(); measureBand(); });
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
