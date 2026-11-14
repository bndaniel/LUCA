/* LUCA on the web (GitHub Pages): the leaderboard.

   The game was written for a claude.ai artifact, which gives the page a small
   database (window.claude.use('db')) and a player id (use('user')). This file
   provides the same few calls on top of a free Supabase project, so the game
   file itself is the same in both places.

   Fill in the two values below from the Supabase dashboard (Project Settings
   -> API): the project URL and the anon / publishable key. That key is meant
   to be public; the rules in schema.sql only let players add runs and read
   the board. Left blank, the game runs with no online board and shows each
   player their best on this device. */
(function(){
  'use strict';
  var SUPABASE_URL = 'https://imesiyxvvkiqjyxjqihf.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_d2YpS03faI6HEnHmz3LqPg_4x0_hpPH';

  window.LUCA_HOST = {
    offline: 'The online leaderboard is unavailable right now.',
    noDebugKeys: true
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

  var db = {
    collection: function(name){
      var n = 200, q = {
        orderBy: function(){ return q; },           // the board is always best first
        limit: function(k){ n = k; return q; },
        get: function(){
          if(name !== 'scores') return Promise.resolve({ docs: [] });   // no mini game yet
          return req('GET', 'board?' + COLS + '&order=best.desc,at.asc&limit=' + n)
            .then(function(rows){ return { docs: rows.map(docOf) }; });
        }
      };
      return q;
    },
    doc: function(path){
      var m = /^scores\/(.+)$/.exec(path), pid = m && m[1];
      return {
        get: function(){
          if(!pid) return Promise.resolve(NONE);
          return req('GET', 'board?' + COLS + '&player=eq.' + encodeURIComponent(pid))
            .then(function(rows){ return rows.length ? docOf(rows[0]) : NONE; });
        },
        // a run is never overwritten; the board shows each player's best
        set: function(v){
          if(!pid) return Promise.reject({ code: 'unsupported' });
          return req('POST', 'scores', { player: pid, name: String(v.initials || 'PLAYER'),
                                         best: Number(v.best) || 0 });
        }
      };
    }
  };
  var user = { id: function(){ return Promise.resolve(me); } };

  window.claude = {
    use: function(name){ return Promise.resolve(name === 'db' ? db : name === 'user' ? user : null); }
  };
})();
