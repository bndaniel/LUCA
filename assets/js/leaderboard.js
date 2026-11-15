/* LUCA on the web (GitHub Pages): the leaderboard.

   The game was written for a claude.ai artifact, which gives the page a small
   database (window.claude.use('db')) and a player id (use('user')). This file
   provides the same few calls on top of a free Supabase project, so the game
   file itself is the same in both places.

   Fill in the two values below from the Supabase dashboard (Project Settings
   -> API): the project URL and the anon / publishable key. That key is meant
   to be public; the rules in schema.sql only let players add runs and read
   the board. Left blank, the game runs with no online board and shows each
   player their best on this device. Protist Predator, the second mini game,
   keeps its points in a second table (pp_scores, also in schema.sql). */
(function(){
  'use strict';
  var SUPABASE_URL = 'https://imesiyxvvkiqjyxjqihf.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_d2YpS03faI6HEnHmz3LqPg_4x0_hpPH';

  window.LUCA_HOST = {
    offline: 'The online leaderboard is unavailable right now.',
    noDebugKeys: true,     // Shift+E/S/P (jump to a stage) are off for players
    allowSkip: true        // but Shift+K (finish the current stage) is on for now
  };
  if(!SUPABASE_URL || !SUPABASE_KEY) return;

  var API = SUPABASE_URL.replace(/\/+$/, '') + '/rest/v1/';
  var ID_KEY = 'luca.player';
  var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

  // Each browser gets a random id, kept so a player keeps one row on the board.
  function newId(){
    if(window.crypto && crypto.randomUUID) return crypto.randomUUID();
    var b = new Uint8Array(16);
    crypto.getRandomValues(b);
    b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
    var h = Array.prototype.map.call(b, function(x){ return (x + 256).toString(16).slice(1); }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }
  var me = null;
  try { me = localStorage.getItem(ID_KEY); } catch(e){}
  if(!me || !UUID.test(me)){
    me = newId();
    try { localStorage.setItem(ID_KEY, me); } catch(e){}
  }

  function req(method, path, body){
    var ctl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function(){ if(ctl) ctl.abort(); }, 10000);
    var headers = { apikey: SUPABASE_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' };
    if(/^eyJ/.test(SUPABASE_KEY)) headers.Authorization = 'Bearer ' + SUPABASE_KEY;   // older JWT-style keys
    return fetch(API + path, {
      method: method, headers: headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: ctl ? ctl.signal : undefined
    }).then(function(r){
      clearTimeout(timer);
      if(!r.ok) throw { code: 'http_' + r.status };
      return method === 'GET' ? r.json() : null;
    }, function(){
      clearTimeout(timer);
      throw { code: 'offline' };
    });
  }

  function docOf(row){
    return { id: row.player, exists: true,
             data: function(){ return { initials: row.name, best: Number(row.best) }; } };
  }
  var NONE = { exists: false, data: function(){ return {}; } };
  var COLS = 'select=player,name,best';
  // Two boards: time evaded ('scores', the game and the evasion mini game) and
  // Protist Predator's points ('minigame'). schema.sql makes both. Until the
  // Protist Predator table exists its board reads as empty rather than broken.
  var TABLES = { scores: { table: 'scores', board: 'board' },
                 minigame: { table: 'pp_scores', board: 'pp_board', whole: true } };
  function missingOk(name){
    return function(e){ if(name === 'minigame' && e && e.code === 'http_404') return []; throw e; };
  }

  var db = {
    collection: function(name){
      var n = 200, q = {
        orderBy: function(){ return q; },           // the board is always best first
        limit: function(k){ n = k; return q; },
        get: function(){
          var T = TABLES[name];
          if(!T) return Promise.resolve({ docs: [] });
          return req('GET', T.board + '?' + COLS + '&order=best.desc,at.asc&limit=' + n)
            .catch(missingOk(name))
            .then(function(rows){ return { docs: rows.map(docOf) }; });
        }
      };
      return q;
    },
    doc: function(path){
      var m = /^(scores|minigame)\/(.+)$/.exec(path), T = m && TABLES[m[1]], pid = m && m[2];
      return {
        get: function(){
          if(!pid) return Promise.resolve(NONE);
          return req('GET', T.board + '?' + COLS + '&player=eq.' + encodeURIComponent(pid))
            .catch(missingOk(m[1]))
            .then(function(rows){ return rows.length ? docOf(rows[0]) : NONE; });
        },
        // a run is never overwritten; the board shows each player's best
        set: function(v){
          if(!pid) return Promise.reject({ code: 'unsupported' });
          var best = Number(v.best) || 0;
          return req('POST', T.table, { player: pid, name: String(v.initials || 'PLAYER'),
                                        best: T.whole ? Math.round(best) : best });
        }
      };
    }
  };
  var user = { id: function(){ return Promise.resolve(me); } };

  window.claude = {
    use: function(name){ return Promise.resolve(name === 'db' ? db : name === 'user' ? user : null); }
  };
})();
