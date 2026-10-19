/* DXBAI Leads – app logic. Talks to the Google Apps Script web app set in config.js. */
(function () {
  'use strict';

  var C = window.LEADS_CONFIG || {};
  var DEMO = !C.API_URL || /[?&]demo\b/.test(location.search);
  var APP = document.getElementById('app');
  var BASE = location.pathname.replace(/[^/]*$/, '');
  var CLOSED_DEFAULT = ['Confirmed', 'Lost – Price', 'Lost – Date Unavailable', 'Lost – Chose Another Venue', 'Not Potential', 'Duplicate'];

  // ───────── small helpers ─────────
  function ls(k, v) {
    try {
      if (arguments.length === 1) { var r = localStorage.getItem('leads.' + k); return r == null ? null : JSON.parse(r); }
      if (v === null) localStorage.removeItem('leads.' + k); else localStorage.setItem('leads.' + k, JSON.stringify(v));
    } catch (e) { return null; }
  }
  function h(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function dayKey(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function todayKey() { return dayKey(new Date()); }
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  function fromKey(k) { var p = String(k || '').split('-'); return p.length === 3 ? new Date(+p[0], +p[1] - 1, +p[2]) : null; }
  function shortDate(k) { var d = fromKey(k); return d ? d.getDate() + ' ' + MON[d.getMonth()] : '—'; }
  function longDate(k) { var d = fromKey(k); return d ? d.getDate() + ' ' + MON[d.getMonth()] + ' ' + d.getFullYear() : '—'; }
  function timeStr(d) { var hh = d.getHours(), m = d.getMinutes(); return (hh % 12 || 12) + (m ? ':' + pad(m) : '') + ' ' + (hh < 12 ? 'AM' : 'PM'); }
  function fuLabel(iso) {
    if (!iso) return '';
    var d = new Date(iso), k = dayKey(d), t = todayKey(), tm = dayKey(new Date(Date.now() + 864e5));
    if (d < new Date()) return 'Overdue · ' + (k === t ? 'today ' + timeStr(d) : DOW[d.getDay()] + ' ' + d.getDate() + ' ' + MON[d.getMonth()]);
    if (k === t) return 'Today ' + timeStr(d);
    if (k === tm) return 'Tomorrow ' + timeStr(d);
    return DOW[d.getDay()] + ' ' + d.getDate() + ' ' + MON[d.getMonth()] + ' · ' + timeStr(d);
  }
  function toLocalInput(iso) { if (!iso) return ''; var d = new Date(iso); return dayKey(d) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function initials(n) { var p = String(n || '?').trim().split(/\s+/); return (p[0][0] + (p[1] ? p[1][0] : (p[0][1] || ''))).toUpperCase(); }
  function digits(p) {
    var d = String(p || '').replace(/\D/g, '');
    if (d.indexOf('00') === 0) d = d.slice(2);
    if (d.length === 9 && d[0] === '5') d = '971' + d;
    if (d.length === 10 && d[0] === '0') d = '971' + d.slice(1);
    return d;
  }
  function prettyPhone(p) {
    var d = digits(p); if (!d) return String(p || '');
    if (d.indexOf('971') === 0 && d.length === 12) return '+971 ' + d.slice(3, 5) + ' ' + d.slice(5, 8) + ' ' + d.slice(8);
    return '+' + d;
  }
  function validEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e || '').trim()); }
  function plural(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }

  var I = {
    phone: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/></svg>',
    wa: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 21l1.7-5A8.5 8.5 0 1 1 8 19.3z"/><path d="M9 10c.5 2 2 3.5 4 4l1.2-1.2 2 1-.6 1.8c-3.5 0-7-3.5-7-7l1.8-.6 1 2z"/></svg>',
    mail: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/></svg>',
    leads: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/></svg>',
    cal: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
    camp: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11v2a1 1 0 0 0 1 1h3l6 4V6L7 10H4a1 1 0 0 0-1 1z"/><path d="M17 9a4 4 0 0 1 0 6M19.5 6.5a7.5 7.5 0 0 1 0 11"/></svg>',
    dash: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><path d="M3 3v18h18"/><path d="M7 15v3M12 10v8M17 6v12"/></svg>',
    user: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
    access: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/><path d="m16 11 2 2 4-4"/></svg>',
    bell: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>',
    back: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>',
    clock: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    search: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5B5E73" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    down: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
    ret: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 0 1 15.5-6.3L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.5 6.3L3 16"/><path d="M3 21v-5h5"/></svg>',
    moon: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/><path d="M19 3v4M17 5h4"/></svg>',
    sun: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    plus: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    chev: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5B5E73" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>'
  };

  function statusClass(s) {
    s = String(s || '');
    if (/^New/.test(s)) return 's-new';
    if (/Contacted|Awaiting/.test(s)) return 's-contact';
    if (/Qualified|Potential Lead/.test(s)) return 's-qual';
    if (/Proposal|Negotiation|Tentative/.test(s)) return 's-prop';
    if (/Follow/.test(s)) return 's-fu';
    if (/Site Visit/.test(s)) return 's-visit';
    if (/Confirmed/.test(s)) return 's-won';
    return 's-lost';
  }

  // ───────── state ─────────
  var S = {
    token: ls('token'), data: null, view: 'leads', campaign: null, filter: 'open', q: '', person: null, statusF: '',
    past: {}, pastLoading: {}, touched: {}, dirty: false,
    selId: null, edit: null, sheet: null, dashScope: null, dashCamp: undefined,
    login: { names: null, name: ls('lastName') || '', pin: '', stage: 'enter', first: '', msg: '', err: false, busy: false },
    prevSeen: ls('seen') || 0, saving: false, ahIdx: -1
  };
  var deferredInstall = null;

  // ───────── API ─────────
  function api(action, body) {
    body = body || {}; body.action = action; if (S.token) body.token = S.token;
    var p = DEMO ? Demo.call(action, body) : fetch(C.API_URL, {
      method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body)
    }).then(function (r) { return r.json(); });
    return p.then(function (res) {
      if (!res || !res.ok) {
        var msg = (res && res.error) || 'Something went wrong';
        if (msg === 'SIGNED_OUT') { signOut(true); msg = 'Please sign in again'; }
        throw new Error(msg);
      }
      return res;
    }, function (err) { if (err && err.message) throw err; throw new Error('No connection. Check your internet and try again.'); });
  }

  // ───────── derived data ─────────
  function D() { return S.data; }
  function isAdmin() { return D() && D().me.role === 'Admin'; }
  function closedList() { return (D() && D().closed) || CLOSED_DEFAULT; }
  function isClosed(l) { return closedList().indexOf(l.status) >= 0; }
  function activeCamps() { return D().campaigns.filter(function (c) { return c.active && !c.unsorted; }); }
  function campByName(n) { return D().campaigns.filter(function (c) { return c.name === n; })[0]; }
  function campLabel(n) { if (n == null || n === '__live') return 'All live campaigns'; if (n === '') return 'Unsorted leads'; return n; }
  function isLiveCamp(n) { var c = campByName(n); return !!(c && !c.unsorted && (c.active || c.upcoming)); }
  // live campaigns' leads come with the data; a past campaign's leads load when someone opens it
  function leadsOf(camp) {
    if (camp == null) return D().leads;
    if (isLiveCamp(camp)) return D().leads.filter(function (l) { return l.campaign === camp; });
    return S.past[camp] || null;
  }
  function loadPast(camp) {
    if (S.past[camp] || S.pastLoading[camp]) return;
    S.pastLoading[camp] = true;
    api('campaignLeads', { campaign: camp }).then(function (r) {
      S.pastLoading[camp] = false; S.past[camp] = r.leads; rerenderKeepScroll();
    }).catch(function (e) { S.pastLoading[camp] = false; toast(e.message, true); });
  }
  function personOf() { return S.person == null ? (isAdmin() ? '' : 'me') : S.person; }
  function personLabel(p) {
    p = p == null ? personOf() : p;
    return p === 'me' ? 'My leads' : (p === '' ? 'All team' : (p === '__none' ? 'Unassigned' : p));
  }
  function scopedLeads() {
    var me = D().me.name, p = personOf();
    return (leadsOf(S.campaign) || []).filter(function (l) {
      if (p === 'me') return l.assigned === me;
      if (p === '__none') return !l.assigned;
      if (p) return l.assigned === p;
      return true;
    });
  }
  function fuState(l) {
    if (!l.followUp || isClosed(l)) return '';
    var d = new Date(l.followUp);
    if (d < new Date()) return 'over';
    if (dayKey(d) === todayKey()) return 'today';
    return 'later';
  }
  function isNewSince(l) { return l.addedAt && S.prevSeen && new Date(l.addedAt).getTime() > S.prevSeen; }
  function counts(list) {
    var c = { open: 0, newl: 0, today: 0, over: 0, fu: 0, ret: 0, closed: 0, fresh: 0, all: list.length };
    list.forEach(function (l) {
      var cl = isClosed(l), f = fuState(l);
      if (cl) c.closed++; else c.open++;
      if (!cl && /^New/.test(l.status)) c.newl++;
      if (f === 'today') c.today++;
      if (f === 'over') c.over++;
      if (f) c.fu++;
      if (l.returning) c.ret++;
      if (isNewSince(l)) c.fresh++;
    });
    return c;
  }
  function applyFilter(list) {
    var q = S.q.trim().toLowerCase(), qd = q.replace(/\D/g, '');
    var out = list.filter(function (l) {
      var f = fuState(l), cl = isClosed(l);
      if (S.statusF && l.status !== S.statusF) return false;
      switch (S.filter) {
        case 'open': if (cl) return false; break;
        case 'new': if (cl || !/^New/.test(l.status)) return false; break;
        case 'today': if (f !== 'today') return false; break;
        case 'over': if (f !== 'over') return false; break;
        case 'fu': if (!f) return false; break;
        case 'ret': if (!l.returning) return false; break;
        case 'fresh': if (!isNewSince(l)) return false; break;
        case 'closed': if (!cl) return false; break;
      }
      if (q) {
        var hay = (l.name + ' ' + l.email + ' ' + l.ad + ' ' + l.assigned).toLowerCase();
        if (hay.indexOf(q) < 0 && !(qd.length >= 3 && digits(l.mobile).indexOf(qd) >= 0)) return false;
      }
      return true;
    });
    var rank = { over: 0, today: 1, later: 2, '': 3 };
    out.sort(function (a, b) {
      var fa = fuState(a), fb = fuState(b);
      if (rank[fa] !== rank[fb]) return rank[fa] - rank[fb];
      if (fa && fb) return new Date(a.followUp) - new Date(b.followUp);
      if ((b.date || '') !== (a.date || '')) return (b.date || '').localeCompare(a.date || '');
      return a.name.localeCompare(b.name);
    });
    return out;
  }
  function findLead(id) {
    var l = D().leads.filter(function (x) { return x.id === id; })[0];
    if (l) return l;
    for (var k in S.past) { l = (S.past[k] || []).filter(function (x) { return x.id === id; })[0]; if (l) return l; }
    return null;
  }
  function tint(l) { return l.status === 'Confirmed' ? ' won' : (/^Lost|Not Potential/.test(l.status) ? ' lost' : ''); }

  // people: photo (from the Users tab "Photo" column) or coloured initials
  var AVC = ['#002F61', '#06937E', '#686B8C', '#007293', '#9B2242', '#00614F', '#8A6D3B', '#4A5463'];
  function avColor(n) { var x = 0; for (var i = 0; i < n.length; i++) x = (x * 31 + n.charCodeAt(i)) % 9973; return AVC[x % AVC.length]; }
  function userBy(n) { return ((D() && D().users) || []).filter(function (u) { return u.name === n; })[0]; }
  function photoUrl(u) {
    var p = u && u.photo; if (!p) return '';
    var m = p.match(/(?:\/d\/|[?&]id=)([\w-]{20,})/);
    if (m && /google\.com/.test(p)) return 'https://drive.google.com/thumbnail?id=' + m[1] + '&sz=w200';
    return /^https?:\/\//.test(p) ? p : '';
  }
  function av(name, size) {
    var st = size ? ';width:' + size + 'px;height:' + size + 'px;font-size:' + Math.round(size * 0.36) + 'px' : '';
    if (!name) return '<span class="av none" title="Unassigned" style="' + st.slice(1) + '">–</span>';
    var src = photoUrl(userBy(name));
    return '<span class="av" title="' + h(name) + '" style="background:' + avColor(name) + st + '">' + h(initials(name)) +
      (src ? '<img src="' + h(src) + '" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">' : '') + '</span>';
  }

  // ───────── rendering ─────────
  function render() {
    if (!S.token || !D()) return renderLogin();
    var html = '<div class="shell">' + sidebar() + '<div class="main">' + (DEMO ? '<div class="demo-flag">Demo mode – sample data. Add your Apps Script URL in config.js to go live.</div>' : '') + viewHtml() + '</div></div>' + bottomNav();
    if (S.sheet && !isDesktop()) html += sheetHtml();
    else if (S.sheet && S.sheet.type !== 'lead') html += sheetHtml();
    APP.innerHTML = html;
    if (S.sheet) S.sheet.fresh = false;   // slide up only when it first opens
  }
  function isDesktop() { return window.matchMedia('(min-width: 1024px)').matches; }

  function navItems() {
    var c = counts(myOwnLeads());
    return [
      { v: 'leads', label: 'Leads', icon: I.leads, count: c.open },
      { v: 'reminders', label: 'Reminders', icon: I.cal, badge: c.over },
      { v: 'campaigns', label: 'Campaigns', icon: I.camp },
      { v: 'dashboard', label: 'Dashboard', icon: I.dash },
      { v: 'profile', label: 'Profile', icon: I.user }
    ];
  }
  function myOwnLeads() {
    var me = D().me.name;
    return D().leads.filter(function (l) { return isAdmin() ? true : l.assigned === me; });
  }
  function sidebar() {
    var items = navItems();
    if (isAdmin()) items.splice(3, 0, { v: 'access', label: 'Team & access', icon: I.access });
    return '<aside class="side desk-only"><div class="side-brand"><div class="logo-tile"><img src="icons/logo.png" alt="Embassy Suites"></div><div><b>Leads</b><span>' + h(C.SUBTITLE || 'DXBAI') + '</span></div></div>' +
      '<nav aria-label="Main">' + items.map(function (it) {
        return '<button data-act="nav" data-v="' + it.v + '" class="' + (S.view === it.v ? 'on' : '') + '"' + (S.view === it.v ? ' aria-current="page"' : '') + '>' + it.icon + h(it.label) +
          (it.badge ? '<span class="badge">' + it.badge + '</span>' : (it.count ? '<span class="count">' + it.count + '</span>' : '')) + '</button>';
      }).join('') + '</nav>' +
      '<div class="side-user">' + av(D().me.name, 40) + '<div><strong>' + h(D().me.name) + '</strong><div style="opacity:.75">' + (isAdmin() ? 'Admin' : h(D().me.team || 'Team')) + '</div></div></div></aside>';
  }
  function bottomNav() {
    return '<nav class="bnav mob-only" aria-label="Main">' + navItems().map(function (it) {
      return '<button data-act="nav" data-v="' + it.v + '" class="' + (S.view === it.v ? 'on' : '') + '"' + (S.view === it.v ? ' aria-current="page"' : '') + '>' + it.icon + h(it.label) + (it.badge ? '<span class="badge">' + it.badge + '</span>' : '') + '</button>';
    }).join('') + '</nav>';
  }
  function viewHtml() {
    switch (S.view) {
      case 'reminders': return remindersView();
      case 'campaigns': return campaignsView();
      case 'access': return accessView();
      case 'dashboard': return dashboardView();
      case 'profile': return profileView();
      default: return leadsView();
    }
  }

  function campSelect(sel, act) {
    var opts = [['__live', 'All live campaigns']];
    D().campaigns.forEach(function (c) {
      var state = c.unsorted ? '' : (c.active ? ' · Live' : (c.upcoming ? ' · Upcoming' : ' · Ended'));
      opts.push([c.name, campLabel(c.name) + state]);
    });
    sel = sel == null ? '__live' : sel;
    return '<select aria-label="Campaign" data-change="' + act + '">' + opts.map(function (o) {
      return '<option value="' + h(o[0]) + '"' + (o[0] === sel ? ' selected' : '') + '>' + h(o[1]) + '</option>';
    }).join('') + '</select>';
  }

  function greeting() { var hr = new Date().getHours(); return hr < 12 ? 'Good morning' : (hr < 17 ? 'Good afternoon' : 'Good evening'); }

  // ── Leads view ──
  function statHero(c) {
    var p = personOf();
    var label = p === 'me' ? 'Your day' : (p === '' ? 'Team today' : (p === '__none' ? 'Unassigned' : p.split(' ')[0] + '’s day'));
    return '<section class="stat-hero" id="stat-hero"><span class="lbl">' + h(label) + '</span><div class="stats">' +
      statBtn('new', c.newl, 'New leads') + statBtn('today', c.today, 'Due today') + statBtn('over', c.over, 'Overdue', true) + '</div></section>';
  }
  function leadsView() {
    var src = leadsOf(S.campaign);
    if (S.campaign != null && !src) loadPast(S.campaign);
    var all = scopedLeads(), c = counts(all), list = applyFilter(all);
    var first = D().me.name.split(' ')[0];
    var top = '<header class="lt"><div class="lt-row"><div style="display:flex;flex-direction:column;gap:2px;min-width:0">' +
      '<span class="eyebrow">' + h(C.SUBTITLE || '') + '</span><h1>' + greeting() + ', ' + h(first) + '</h1></div>' + pushBell() + '</div>' +
      '<label class="camp-pick">' + (personOf() && personOf() !== '__none' ? av(personOf() === 'me' ? D().me.name : personOf(), 22) : '<span class="live-dot"></span>') +
      '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + h(personLabel()) + '</span>' + I.down + personSelect() + '</label></header>' +
      statHero(c);
    var banner = '';
    if (S.campaign != null) {
      banner = '<div class="past-banner"><span>' + (isLiveCamp(S.campaign) ? 'Showing only <b>' : 'Looking back at <b>') + h(campLabel(S.campaign)) + '</b></span><button data-act="backLive">' + (activeCamps().length ? 'Back to live' : 'Close') + '</button></div>';
    }
    var tools = '<div class="page" style="padding-bottom:0">' + pushBanner() + banner +
      '<label class="search">' + I.search + '<input type="search" data-input="q" value="' + h(S.q) + '" placeholder="Search name, phone or email" aria-label="Search leads"></label>' +
      '<div class="chips">' + chip('open', 'Open · ' + c.open) + chip('new', 'New · ' + c.newl) + chip('today', 'Due today · ' + c.today) + chip('over', 'Overdue · ' + c.over, true) +
      (c.fresh ? chip('fresh', 'Just added · ' + c.fresh) : '') + chip('ret', 'Returning · ' + c.ret) + chip('closed', 'Closed · ' + c.closed) + chip('all', 'All · ' + c.all) +
      statusSelect() + '</div></div>';
    var body;
    if (S.campaign != null && !src) body = '<div class="page"><div class="loading" style="min-height:30vh"><div class="spin"></div>Loading ' + h(campLabel(S.campaign)) + '…</div></div>';
    else if (isDesktop()) {
      var sel = S.selId ? findLead(S.selId) : null;
      body = '<div class="page"><div class="desk-split"><div class="list-col">' + (list.length ? leadTable(list) : emptyLeads()) + '</div>' +
        '<aside class="detail-col" aria-label="Selected lead">' + (sel ? detailInner(sel) : '<div class="empty"><strong>Pick a lead</strong>Its details, call buttons and follow-up reminder open here.</div>') + '</aside></div></div>';
    } else {
      body = '<div class="page">' + (list.length ? list.slice(0, 200).map(leadCard).join('') + (list.length > 200 ? '<p class="hint" style="text-align:center">Showing 200 of ' + list.length + '. Search to find others.</p>' : '') : emptyLeads()) + '</div>';
    }
    return top + tools + body;
  }
  function statBtn(f, n, label, warn) {
    return '<button class="stat' + (warn ? ' warn' : '') + (S.filter === f ? ' sel' : '') + '" data-act="filter" data-v="' + f + '"><b>' + n + '</b><span>' + label + '</span></button>';
  }
  function chip(f, label, red) { return '<button class="chip' + (red ? ' red' : '') + (S.filter === f ? ' on' : '') + '" data-act="filter" data-v="' + f + '"' + (S.filter === f ? ' aria-pressed="true"' : ' aria-pressed="false"') + '>' + h(label) + '</button>'; }
  function teamNames() {
    var me = D().me.name, names = {}, visible = D().campaigns.map(function (c) { return c.name; });
    D().users.forEach(function (u) {
      if (!u.active || u.role === 'Admin' || u.name === me) return;
      if ((u.campaigns || []).some(function (c) { return visible.indexOf(c) >= 0; })) names[u.name] = 1;
    });
    (leadsOf(S.campaign) || []).forEach(function (l) { if (l.assigned && l.assigned !== me) names[l.assigned] = 1; });
    return Object.keys(names).sort();
  }
  function personSelect() {
    var opts = [['me', 'My leads'], ['', 'All team']].concat(teamNames().map(function (n) { return [n, n]; })).concat([['__none', 'Unassigned']]);
    var cur = personOf();
    return '<select aria-label="Whose leads" data-change="person">' + opts.map(function (o) { return '<option value="' + h(o[0]) + '"' + (cur === o[0] ? ' selected' : '') + '>' + h(o[1]) + '</option>'; }).join('') + '</select>';
  }
  function statusSelect() {
    var st = (D().statuses || []).filter(function (x) { return x !== 'Duplicate'; });
    return '<select class="sel-inline" aria-label="Filter by status" data-change="statusF"' + (S.statusF ? ' style="background-color:var(--blue);color:#fff"' : '') + '><option value="">All statuses</option>' +
      st.map(function (x) { return '<option' + (S.statusF === x ? ' selected' : '') + '>' + h(x) + '</option>'; }).join('') + '</select>';
  }
  function emptyLeads() {
    var msg = S.q ? 'No lead matches “' + h(S.q) + '”.' : (S.statusF ? 'No leads marked ' + h(S.statusF) + ' here.' : ({ over: 'Nothing overdue. Nice work.', today: 'No follow-ups due today.', new: 'No new leads waiting.', fresh: 'No new leads since your last visit.', ret: 'No returning leads here.', closed: 'No closed leads yet.' }[S.filter] || (personOf() === 'me' ? 'No open leads assigned to you. Switch to All team to see everyone’s.' : 'No open leads here.')));
    return '<div class="empty"><strong>All clear</strong>' + msg + '</div>';
  }
  function dueLine(l) {
    var f = fuState(l);
    if (f) return '<div class="due ' + f + '">' + I.clock + '<span>' + h(fuLabel(l.followUp)) + '</span></div>';
    return '<div class="due later">Received ' + h(shortDate(l.date)) + (l.ad ? ' · ' + h(l.ad) : '') + '</div>';
  }
  function metaLine(l) {
    return [l.venue, l.pax, l.when].filter(Boolean).map(h).join(' · ') || h(l.ad || '');
  }
  function contactLinks(l, small) {
    var d = digits(l.mobile);
    if (!d) return '';
    if (small) return '<a class="sq btn-blue" href="tel:+' + d + '" aria-label="Call ' + h(l.name) + '" data-stop="1">' + I.phone + '</a> <a class="sq btn-wa" href="https://wa.me/' + d + '" target="_blank" rel="noopener" aria-label="WhatsApp ' + h(l.name) + '" data-stop="1">' + I.wa + '</a>';
    return '<div class="actions2"><a class="btn btn-blue" href="tel:+' + d + '">' + I.phone + 'Call</a><a class="btn btn-wa" href="https://wa.me/' + d + '" target="_blank" rel="noopener">' + I.wa + 'WhatsApp</a></div>';
  }
  function leadCard(l) {
    return '<article class="card' + tint(l) + '" id="lc-' + h(l.id) + '"><button class="lead-card" style="background:none;padding:0;display:flex;flex-direction:column;gap:8px" data-act="open" data-id="' + h(l.id) + '">' +
      '<div class="lc-top" style="width:100%"><div style="display:flex;flex-direction:column;gap:4px;min-width:0">' +
      '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap"><span class="lc-name">' + h(l.name) + '</span>' +
      (isNewSince(l) ? '<span class="tag new">NEW</span>' : '') + (l.returning ? '<span class="tag ret">RETURNING</span>' : '') + '</div>' +
      '<span class="lc-meta">' + metaLine(l) + '</span></div><span class="pill ' + statusClass(l.status) + '">' + h(l.status) + '</span></div>' +
      '<div class="row-between" style="width:100%">' + dueLine(l) + av(l.assigned) + '</div></button>' + contactLinks(l) + '</article>';
  }
  function leadRow(l) {
    var f = fuState(l);
    return '<tr id="lr-' + h(l.id) + '" class="row' + tint(l) + (S.selId === l.id ? ' sel' : '') + '" data-act="open" data-id="' + h(l.id) + '" tabindex="0">' +
      '<td><div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap"><strong style="color:var(--blue)">' + h(l.name) + '</strong>' + (isNewSince(l) ? '<span class="tag new">NEW</span>' : '') + (l.returning ? '<span class="tag ret">RETURNING</span>' : '') + '</div><div class="hint" style="margin-top:2px;white-space:nowrap">' + h(['Received ' + shortDate(l.date), l.venue, l.pax].filter(Boolean).join(' · ')) + '</div></td>' +
      '<td class="c-guests" style="white-space:nowrap">' + h(l.pax || '—') + '</td>' +
      '<td><span class="pill ' + statusClass(l.status) + '">' + h(l.status) + '</span></td>' +
      '<td><span class="who">' + av(l.assigned, 28) + '<span>' + h(l.assigned ? l.assigned.split(' ')[0] : 'Unassigned') + '</span></span></td>' +
      '<td style="font-weight:600;min-width:110px;color:' + (f === 'over' ? 'var(--red)' : (f ? 'var(--blue)' : 'var(--muted)')) + '">' + (f ? h(fuLabel(l.followUp)) : '—') + '</td>' +
      '<td class="c-contact" style="text-align:right;white-space:nowrap">' + contactLinks(l, true) + '</td></tr>';
  }
  function leadTable(list) {
    return '<div class="lead-table-wrap"><table class="lead-table"><thead><tr><th>Name</th><th class="c-guests">Guests</th><th>Status</th><th>Assigned to</th><th>Follow-up</th><th class="c-contact" style="text-align:right">Contact</th></tr></thead><tbody>' +
      list.slice(0, 400).map(leadRow).join('') + '</tbody></table>' + (list.length > 400 ? '<p class="hint" style="padding:12px">Showing 400 of ' + list.length + '. Search to narrow down.</p>' : '') + '</div>';
  }

  // ── Lead detail ── (every change saves itself; comments are added with their own button)
  function openLead(id) {
    var l = findLead(id); if (!l) return;
    S.selId = id;
    if (!S.edit || S.edit.id !== id) S.edit = { id: id, comment: '' };
    if (!isDesktop()) { S.sheet = { type: 'lead', id: id, fresh: true }; render(); var b = document.querySelector('.sheet-body'); if (b) b.scrollTop = 0; return; }
    // desktop: swap the side panel and the row highlight only
    var col = document.querySelector('.detail-col');
    if (!col) { S.view = 'leads'; return render(); }
    col.innerHTML = detailInner(l); col.scrollTop = 0;
    Array.prototype.forEach.call(document.querySelectorAll('.lead-table tr.sel'), function (r) { r.classList.remove('sel'); });
    var row = document.getElementById('lr-' + id); if (row) row.classList.add('sel');
  }
  function returningText(r) {
    if (!r) return '';
    if (r.note) return h(r.note);
    var bits = 'First enquired ' + (r.date ? h(longDate(r.date)) : 'before') + (r.campaign ? ' (' + h(r.campaign) + ')' : '') + (r.pax ? ' for ' + h(r.pax) : '') + '.';
    if (r.status) bits += ' Marked ' + h(r.status) + (r.assigned ? ' by ' + h(r.assigned) : '') + '.';
    return bits;
  }
  function histHtml(l) {
    var parts = String(l.comments || '').split(/\s*\|\|\s*|\n+/).map(function (s) { return s.trim(); }).filter(Boolean);
    var rows = parts.reverse().map(function (p) {
      var m = p.match(/^(\d{1,2}[-\s.\/][A-Za-z]{3}|\d{1,2}\.\d{1,2})\s*(?:\(([^)]+)\))?\s*[:\-–]?\s*(.*)$/);
      if (m && m[3]) return '<div><b>' + h(m[1]) + '</b><span>' + h(m[3]) + (m[2] ? ' <span style="color:var(--muted2)">' + h(m[2]) + '</span>' : '') + '</span></div>';
      return '<div><b>Note</b><span>' + h(p) + '</span></div>';
    });
    rows.push('<div><b>' + h(shortDate(l.date)) + '</b><span>Lead received' + (l.ad ? ' from ' + h(l.ad) : '') + (l.campaign ? ' · ' + h(l.campaign) : '') + '.</span></div>');
    return rows.join('');
  }
  function headHtml(l) {
    return '<div class="row-between" style="align-items:flex-start"><h2 class="d-name">' + h(l.name) + '</h2><span class="pill ' + statusClass(l.status) + '">' + h(l.status) + '</span></div>' +
      '<span class="hint" style="font-size:13px">Received ' + h(longDate(l.date)) + (l.ad ? ' · ' + h(l.ad) : '') + '</span>';
  }
  function fuHtml(l) {
    var v = toLocalInput(l.followUp);
    return '<div class="row-between" style="margin-top:4px"><label class="lbl" for="ed-fu">Follow-up reminder</label>' + (v ? '<button class="linkish" data-act="preset" data-v="clear" style="color:var(--red);font-size:13px">Clear</button>' : '') + '</div>' +
      '<div class="preset-row">' + preset('tomorrow', 'Tomorrow 10 AM') + preset('2d', 'In 2 days') + preset('week', 'Next week') + '</div>' +
      '<input id="ed-fu" type="datetime-local" class="inp" data-edit="followUp" value="' + h(v) + '">' +
      '<span class="hint">' + (v ? 'Reminder set – you’ll get a notification at this time.' : 'You’ll get a notification at this time.') + '</span>';
  }
  function peopleFor(l) {
    var people = D().users.filter(function (u) { return u.active && (u.role === 'Admin' || !u.campaigns || u.campaigns.indexOf('ALL') >= 0 || u.campaigns.indexOf(l.campaign) >= 0); }).map(function (u) { return u.name; });
    if (l.assigned && people.indexOf(l.assigned) < 0) people.unshift(l.assigned);
    return people;
  }
  function detailInner(l) {
    var d = digits(l.mobile), statuses = (D().statuses || []).slice();
    if (statuses.indexOf(l.status) < 0) statuses.unshift(l.status);
    var draft = S.edit && S.edit.id === l.id ? S.edit.comment : '';
    return '<div id="detail-box" data-id="' + h(l.id) + '" style="display:contents">' +
      '<section id="d-head" style="display:flex;flex-direction:column;gap:6px">' + headHtml(l) + '</section>' +
      (l.returning ? '<div class="ret-banner">' + I.ret + '<div><strong>Returning lead.</strong> ' + returningText(l.returning) + '</div></div>' : '') +
      '<div class="qa">' +
      (d ? '<a class="btn btn-blue" href="tel:+' + d + '">' + I.phone + 'Call</a><a class="btn btn-wa" href="https://wa.me/' + d + '" target="_blank" rel="noopener">' + I.wa + 'WhatsApp</a>' : '<span class="btn btn-line" style="grid-column:span 2">No phone number</span>') +
      (validEmail(l.email) ? '<a class="btn btn-line" href="mailto:' + h(l.email.trim()) + '">' + I.mail + 'Email</a>' : '<span class="btn btn-line" aria-disabled="true" style="opacity:.5">' + I.mail + 'Email</span>') +
      '</div>' +
      '<div class="grid2">' +
      kv('Guests', l.pax || '—') + kv('Event date', l.when || '—') + kv('Venue', l.venue || '—') +
      kv('Mobile', d ? prettyPhone(l.mobile) : (l.mobile || '—'), 'sec') + kv('Email', l.email || '—', 'full') + '</div>' +
      '<div class="box"><label class="lbl" for="ed-status">Status</label><select id="ed-status" class="inp" data-edit="status">' +
      statuses.map(function (s) { return '<option' + (s === l.status ? ' selected' : '') + '>' + h(s) + '</option>'; }).join('') + '</select>' +
      '<label class="lbl" for="ed-assigned" style="margin-top:4px">Assigned to</label><div style="display:flex;gap:10px;align-items:center"><span id="d-av">' + av(l.assigned, 40) + '</span><select id="ed-assigned" class="inp" data-edit="assigned"><option value="">Unassigned</option>' +
      peopleFor(l).map(function (n) { return '<option' + (n === l.assigned ? ' selected' : '') + '>' + h(n) + '</option>'; }).join('') + '</select></div>' +
      '<div id="d-fu" style="display:flex;flex-direction:column;gap:10px">' + fuHtml(l) + '</div>' +
      '<span class="hint" style="color:var(--muted2)">Changes save to the sheet straight away.</span></div>' +
      '<div class="box"><label class="lbl" for="ed-comment">Add comment</label><textarea id="ed-comment" class="inp" rows="3" data-edit="comment" placeholder="What happened on this call?">' + h(draft) + '</textarea>' +
      '<div class="add-row"><button class="btn btn-blue" data-act="addComment">Add to history</button></div>' +
      '<div class="lbl" style="color:var(--muted2);margin-top:4px">History</div><div class="hist" id="d-hist">' + histHtml(l) + '</div></div>' +
      '</div>';
  }
  function kv(k, v, cls) { return '<div class="kv' + (cls ? ' ' + cls : '') + '"><span>' + h(k) + '</span><b>' + h(v) + '</b></div>'; }
  function preset(v, label) { return '<button class="chip" data-act="preset" data-v="' + v + '">' + label + '</button>'; }

  // ── Reminders ──
  function remindersView() {
    var me = D().me.name;
    var list = D().leads.filter(function (l) { return fuState(l) && (isAdmin() || l.assigned === me); })
      .sort(function (a, b) { return new Date(a.followUp) - new Date(b.followUp); });
    var g = { over: [], today: [], later: [] };
    list.forEach(function (l) { g[fuState(l)].push(l); });
    function group(title, arr) { return arr.length ? '<h2 class="section-label">' + title + ' · ' + arr.length + '</h2>' + (isDesktop() ? '<div class="cards-2">' + arr.map(leadCard).join('') + '</div>' : arr.map(leadCard).join('')) : ''; }
    return '<header class="page-head"><div><h1>Reminders</h1><p>' + (isAdmin() ? 'Follow-ups across the team' : 'Your follow-ups, earliest first') + '</p></div></header>' +
      '<div class="page">' + (list.length ? group('Overdue', g.over) + group('Today', g.today) + group('Coming up', g.later)
        : '<div class="empty"><strong>No reminders set</strong>Open a lead and choose a follow-up time – it will show here and you’ll get a notification.</div>') + '</div>';
  }

  // ── Campaigns ──
  function campStats(name) { var c = campByName(name); return (c && c.stats) || { total: 0, won: 0, open: 0 }; }
  function membersOf(name) {
    return D().users.filter(function (u) { return u.active && u.role !== 'Admin' && u.campaigns && u.campaigns.indexOf(name) >= 0; }).map(function (u) { return u.name; });
  }
  function daysLeft(c) { if (!c.expiry) return ''; var n = Math.round((fromKey(c.expiry) - fromKey(todayKey())) / 864e5); return n; }
  function campaignsView() {
    var camps = D().campaigns;
    var live = camps.filter(function (c) { return c.active && !c.unsorted; });
    var soon = camps.filter(function (c) { return c.upcoming; });
    var past = camps.filter(function (c) { return !c.active && !c.upcoming && !c.unsorted; }).sort(function (a, b) { return (b.expiry || '').localeCompare(a.expiry || ''); });
    var uns = camps.filter(function (c) { return c.unsorted; })[0];
    var head = '<header class="page-head"><div><h1>Campaigns</h1><p>' + (isAdmin() ? 'Admin · all teams' : 'Campaigns you can see') + '</p></div>' +
      (isAdmin() ? '<div style="display:flex;gap:6px"><button class="icon-btn mob-only" data-act="nav" data-v="access" aria-label="Team and access">' + I.access + '</button><button class="btn btn-blue" style="padding:0 16px;height:40px;border-radius:20px" data-act="campForm">' + I.plus + 'New</button></div>' : '') + '</header>';
    function liveCard(c, i) {
      var st = campStats(c.name), dl = daysLeft(c), mem = membersOf(c.name);
      var dark = i === 0;
      return '<article class="camp-card ' + (dark ? 'live' : 'other') + '">' +
        '<div class="row-between" style="align-items:flex-start"><div style="display:flex;flex-direction:column;gap:4px;min-width:0"><div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><span class="cname" style="' + (dark ? '' : 'color:var(--blue)') + '">' + h(c.name) + '</span>' + (c.team ? '<span class="tag team"' + (dark ? '' : ' style="background:rgba(0,114,147,.12);color:var(--turq-ink)"') + '>' + h(c.team.toUpperCase()) + ' TEAM</span>' : '') + '</div>' +
        '<span style="font-size:13px;opacity:.85">' + (c.start ? h(shortDate(c.start)) : '') + (c.expiry ? ' – ' + h(longDate(c.expiry)) : '') + (dl !== '' ? ' · ' + plural(dl, 'day') + ' left' : '') + '</span></div><span class="tag live">LIVE</span></div>' +
        '<div style="display:flex;gap:16px;font-size:13px"><span><b style="font-size:18px">' + st.total + '</b> leads</span><span><b style="font-size:18px">' + st.won + '</b> confirmed</span></div>' +
        (c.brief ? '<p style="margin:0;font-size:13px;line-height:1.5;' + (dark ? 'background:rgba(255,255,255,.08);' : 'background:var(--bg);') + 'border-radius:10px;padding:10px 12px"><strong>Brief:</strong> ' + h(c.brief) + '</p>' : '') +
        (isAdmin() ? '<div style="font-size:13px;opacity:.9">' + (mem.length ? 'Access: ' + h(mem.join(', ')) : 'Nobody has access yet') + '</div>' : '') +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;position:relative;z-index:1"><button class="btn ' + (dark ? '' : 'btn-blue') + '" style="padding:0 16px;height:40px;border-radius:20px;' + (dark ? 'background:#fff;color:var(--blue)' : '') + '" data-act="viewCamp" data-v="' + h(c.name) + '">View leads</button>' +
        (isAdmin() ? '<button class="btn" style="padding:0 16px;height:40px;border-radius:20px;background:' + (dark ? 'rgba(255,255,255,.16)' : 'var(--fill2)') + ';color:inherit" data-act="campForm" data-v="' + h(c.name) + '">Edit</button>' : '') + '</div></article>';
    }
    function row(c, tag, cls) {
      var st = campStats(c.name);
      return '<div class="camp-row"><button style="flex:1;border:0;background:none;padding:0;text-align:left;display:flex;flex-direction:column;gap:3px;min-width:0" data-act="viewCamp" data-v="' + h(c.name) + '">' +
        '<span style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><strong style="font-size:15px;color:var(--blue)">' + h(campLabel(c.name)) + '</strong><span class="tag ' + cls + '">' + tag + '</span>' + (c.team ? '<span class="hint">' + h(c.team) + '</span>' : '') + '</span>' +
        '<span class="hint" style="font-size:13px">' + (c.start ? h(shortDate(c.start)) + ' – ' + h(longDate(c.expiry)) + ' · ' : '') + plural(st.total, 'lead') + '</span></button>' +
        (isAdmin() && !c.unsorted ? '<button class="linkish" style="font-size:13px" data-act="campForm" data-v="' + h(c.name) + '">Edit</button>' : I.chev) + '</div>';
    }
    return head + '<div class="page">' +
      '<h2 class="section-label">Live · ' + live.length + '</h2>' +
      (live.length ? '<div class="cards-2" style="display:grid;gap:12px">' + live.map(liveCard).join('') + '</div>' : '<div class="empty"><strong>No live campaign</strong>' + (isAdmin() ? 'Tap New to start one.' : 'Your admin will add you to the next one.') + '</div>') +
      (soon.length ? '<h2 class="section-label">Upcoming</h2>' + soon.map(function (c) { return row(c, 'UPCOMING', 'soon'); }).join('') : '') +
      (past.length ? '<h2 class="section-label">Past campaigns</h2><p class="hint" style="margin:-4px 0 0">Open one to look back at its leads. The app goes back to your live campaign next time.</p>' + past.map(function (c) { return row(c, 'ENDED', 'exp'); }).join('') : '') +
      (uns ? '<h2 class="section-label">Needs a campaign</h2>' + row(uns, 'UNSORTED', 'soon') + '<p class="hint" style="margin:0">These rows have a first-column value and tab name that don’t match any campaign. Fix the name in the sheet or add the campaign.</p>' : '') +
      '</div>';
  }

  function campForm(name) {
    var c = name ? campByName(name) : null;
    var members = c ? membersOf(c.name) : [];
    S.sheet = { type: 'camp', fresh: true, original: c ? c.name : '', name: c ? c.name : '', team: c ? c.team : 'Events', start: c ? c.start : todayKey(), expiry: c ? c.expiry : '', brief: c ? c.brief : '', members: members, notify: !c };
    if (!c) S.sheet.members = teamMembers('Events');
    render();
  }
  function teamMembers(team) { return D().users.filter(function (u) { return u.active && u.role !== 'Admin' && u.team === team; }).map(function (u) { return u.name; }); }
  function campFormHtml() {
    var f = S.sheet, people = D().users.filter(function (u) { return u.active && u.role !== 'Admin'; });
    var teams = ['Events', 'Sales'];
    D().users.forEach(function (u) { if (u.team && teams.indexOf(u.team) < 0) teams.push(u.team); });
    return '<div class="box">' +
      '<label class="lbl" for="cf-name">Campaign name</label><input id="cf-name" class="inp" data-form="name" value="' + h(f.name) + '" placeholder="e.g. Festive Weddings 2027">' +
      '<span class="hint">Write exactly this name in the first column of the sheet for this campaign’s leads (or name the sheet tab the same).</span>' +
      '<div class="lbl" style="margin-top:6px">Team</div><div class="seg light">' + teams.slice(0, 2).map(function (t) { return '<button data-act="formTeam" data-v="' + h(t) + '" class="' + (f.team === t ? 'on' : '') + '">' + h(t) + '</button>'; }).join('') + '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:4px"><div><label class="lbl" for="cf-start">Start date</label><input id="cf-start" type="date" class="inp" data-form="start" value="' + h(f.start) + '"></div>' +
      '<div><label class="lbl" for="cf-exp">Expiry date</label><input id="cf-exp" type="date" class="inp" data-form="expiry" value="' + h(f.expiry) + '"></div></div>' +
      '<div class="lbl" style="margin-top:6px">Who can see this campaign</div><div class="preset-row">' +
      (people.length ? people.map(function (u) { var on = f.members.indexOf(u.name) >= 0; return '<button class="toggle-chip' + (on ? ' on' : '') + '" aria-pressed="' + on + '" data-act="formMember" data-v="' + h(u.name) + '">' + (on ? '✓ ' : '+ ') + h(u.name) + '</button>'; }).join('') : '<span class="hint">No team members yet – add them in Team &amp; access.</span>') +
      '</div><span class="hint">Picking a team ticks its members. You always see every campaign.</span>' +
      '<label class="lbl" for="cf-brief" style="margin-top:6px">Brief for the team</label><textarea id="cf-brief" class="inp" rows="3" data-form="brief" placeholder="Offer, price per person, what to push…">' + h(f.brief) + '</textarea>' +
      '<label style="display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:52px;margin-top:4px"><span><strong style="color:var(--blue);font-size:14px">Push to the people above</strong><br><span class="hint">Sends the name and brief as a notification</span></span><input type="checkbox" data-form="notify" style="width:22px;height:22px;accent-color:#002F61"' + (f.notify ? ' checked' : '') + '></label>' +
      '</div>';
  }

  // ── Team & access (admin) ──
  function accessView() {
    if (!isAdmin()) return leadsView();
    var camps = D().campaigns.filter(function (c) { return !c.unsorted; }).slice().sort(function (a, b) {
      var ra = a.active ? 0 : (a.upcoming ? 1 : 2), rb = b.active ? 0 : (b.upcoming ? 1 : 2);
      return ra - rb || (b.start || '').localeCompare(a.start || '');
    });
    var people = D().users.filter(function (u) { return u.role !== 'Admin'; });
    var cards = people.map(function (u) {
      return '<article class="box" style="gap:10px' + (u.active ? '' : ';opacity:.6') + '"><div style="display:flex;align-items:center;gap:10px">' + av(u.name, 40) +
        '<div style="flex:1;min-width:0"><strong style="color:var(--blue);font-size:15px">' + h(u.name) + '</strong><div class="hint">' + h(u.team || 'No team') + ' · ' + plural((u.campaigns || []).length, 'campaign') + (u.hasPin ? '' : ' · passcode not set') + (u.active ? '' : ' · switched off') + '</div></div>' +
        '<button class="linkish" style="font-size:12px" data-act="resetPin" data-v="' + h(u.name) + '">Reset passcode</button></div>' +
        '<div class="preset-row">' + camps.map(function (c) {
          var on = (u.campaigns || []).indexOf(c.name) >= 0;
          return '<button class="toggle-chip' + (on ? ' on' : '') + '" aria-pressed="' + on + '" data-act="toggleAccess" data-user="' + h(u.name) + '" data-v="' + h(c.name) + '"' + (c.active ? '' : ' style="opacity:.75"') + '>' + (on ? '✓ ' : '+ ') + h(c.name) + (c.active ? '' : (c.upcoming ? ' (soon)' : ' (ended)')) + '</button>';
        }).join('') + '</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr auto;gap:8px;align-items:end"><label class="hint">Team<select class="inp" style="height:40px;margin-top:4px" data-userfield="team" data-user="' + h(u.name) + '">' + ['', 'Events', 'Sales'].concat(u.team && ['Events', 'Sales'].indexOf(u.team) < 0 ? [u.team] : []).map(function (t) { return '<option value="' + h(t) + '"' + (t === (u.team || '') ? ' selected' : '') + '>' + (t || '—') + '</option>'; }).join('') + '</select></label>' +
        '<label class="hint">Email for 10 AM summary<input class="inp" style="height:40px;margin-top:4px" type="email" value="' + h(u.email || '') + '" placeholder="name@hilton.com" data-userfield="email" data-user="' + h(u.name) + '"></label>' +
        '<button class="btn btn-line" style="height:40px;padding:0 12px;font-size:13px" data-act="toggleActive" data-v="' + h(u.name) + '">' + (u.active ? 'Switch off' : 'Switch on') + '</button></div>' +
        '<label class="hint">Photo link (Google Drive “Anyone with the link” or any image URL)<input class="inp" style="height:40px;margin-top:4px" type="url" value="' + h(u.photo || '') + '" placeholder="https://drive.google.com/file/d/…" data-userfield="photo" data-user="' + h(u.name) + '"></label></article>';
    }).join('');
    return '<header class="page-head"><div><h1>Team &amp; access</h1><p>Tick a campaign to let that person see its leads and get its notifications</p></div><button class="icon-btn mob-only" data-act="nav" data-v="campaigns" aria-label="Back to campaigns">' + I.back + '</button></header>' +
      '<div class="page">' + (isDesktop() ? '<div class="cards-2">' + cards + '</div>' : cards) +
      '<div class="box"><div class="lbl">Add team member</div><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px">' +
      '<input class="inp" id="nu-name" placeholder="Name (as in Assigned column)" aria-label="Name"><select class="inp" id="nu-team" aria-label="Team"><option>Events</option><option>Sales</option></select><input class="inp" id="nu-email" type="email" placeholder="Email (optional)" aria-label="Email"></div>' +
      '<button class="btn btn-blue" data-act="addUser">' + I.plus + 'Add member</button><span class="hint">Names typed in the sheet’s Assigned column are added automatically too.</span></div></div>';
  }

  // ── Dashboard ──
  function dashboardView() {
    var admin = isAdmin();
    var scope = S.dashScope || (admin ? 'team' : 'mine');
    var camp = S.dashCamp === undefined ? S.campaign : S.dashCamp;
    var me = D().me.name;
    var src = leadsOf(camp);
    if (camp != null && !src) loadPast(camp);
    var rows = (src || []).filter(function (l) { return scope === 'team' || l.assigned === me; }).map(function (l) {
      return { c: l.campaign, s: l.status, a: l.assigned, ad: l.ad, p: l.pax, w: l.when, d: l.date, v: l.venue, r: l.returning ? 1 : 0 };
    });
    var closed = closedList(), n = rows.length;
    function cnt(fn) { return rows.filter(fn).length; }
    var k = {
      total: n, newl: cnt(function (r) { return /^New/.test(r.s); }), prop: cnt(function (r) { return /Proposal/.test(r.s); }),
      fu: cnt(function (r) { return /Follow/.test(r.s); }), won: cnt(function (r) { return r.s === 'Confirmed'; }),
      lost: cnt(function (r) { return closed.indexOf(r.s) >= 0 && r.s !== 'Confirmed'; }), ret: cnt(function (r) { return r.r; })
    };
    function pct(x) { return n ? Math.round(x / n * 100) + '% of leads' : '—'; }
    var byStatus = {}; rows.forEach(function (r) { byStatus[r.s] = (byStatus[r.s] || 0) + 1; });
    var statusOrder = (D().statuses || []).filter(function (s) { return byStatus[s]; });
    Object.keys(byStatus).forEach(function (s) { if (statusOrder.indexOf(s) < 0) statusOrder.push(s); });
    var maxS = Math.max.apply(null, statusOrder.map(function (s) { return byStatus[s]; }).concat([1]));
    var colorFor = function (s) { var c = statusClass(s); return { 's-new': '#686B8C', 's-contact': '#007293', 's-qual': '#06937E', 's-prop': '#002F61', 's-fu': '#005670', 's-visit': '#00614F', 's-won': '#00614F', 's-lost': '#A39994' }[c]; };
    function bars(entries, max, color) {
      return '<div class="bars">' + entries.map(function (e) {
        return '<div class="bar-row"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + h(e[0]) + '">' + h(e[0]) + '</span><div class="bar-track"><div class="bar-fill" style="width:' + Math.max(3, Math.round(e[1] / max * 100)) + '%;background:' + (typeof color === 'function' ? color(e[0]) : color) + '"></div></div><b>' + e[1] + '</b></div>';
      }).join('') + '</div>';
    }
    function group(key, limit) {
      var m = {}; rows.forEach(function (r) { var v = r[key] || '—'; m[v] = (m[v] || 0) + 1; });
      var arr = Object.keys(m).map(function (x) { return [x, m[x]]; }).sort(function (a, b) { return b[1] - a[1]; });
      return limit ? arr.slice(0, limit) : arr;
    }
    var venues = group('v').filter(function (v) { return v[0] !== '—'; });
    var vTotal = venues.reduce(function (a, v) { return a + v[1]; }, 0);
    var vColors = ['#002F61', '#06937E', '#686B8C', '#007293'];
    // per day
    var byDay = {}; rows.forEach(function (r) { if (r.d) byDay[r.d] = (byDay[r.d] || 0) + 1; });
    var dayKeys = Object.keys(byDay).sort().slice(isDesktop() ? -21 : -5);   // phones: last 5 days
    var maxD = Math.max.apply(null, dayKeys.map(function (d) { return byDay[d]; }).concat([1]));
    var avg = dayKeys.length ? Math.round(dayKeys.reduce(function (a, d) { return a + byDay[d]; }, 0) / dayKeys.length) : 0;
    // team table
    var people = {}; rows.forEach(function (r) { var a = r.a || 'Unassigned'; (people[a] = people[a] || []).push(r); });
    var teamTable = Object.keys(people).sort(function (a, b) { return people[b].length - people[a].length; }).map(function (p) {
      var pr = people[p]; function c(fn) { return pr.filter(fn).length; }
      return '<tr><td><strong style="color:var(--blue)">' + h(p) + '</strong></td><td class="num"><b>' + pr.length + '</b></td><td class="num">' + c(function (r) { return /^New/.test(r.s); }) + '</td><td class="num">' + c(function (r) { return /Contacted|Awaiting/.test(r.s); }) + '</td><td class="num">' + c(function (r) { return /Proposal|Qualified|Site|Negotiation|Tentative|Follow/.test(r.s); }) + '</td><td class="num" style="color:var(--teal-ink);font-weight:700">' + c(function (r) { return r.s === 'Confirmed'; }) + '</td><td class="num">' + c(function (r) { return closed.indexOf(r.s) >= 0 && r.s !== 'Confirmed'; }) + '</td></tr>';
    }).join('');

    var head = '<header class="lt"><div class="lt-row"><div><h1>Dashboard</h1><p>' + h(campLabel(camp)) + ' · ' + plural(n, 'lead') + '</p></div></div>' +
      '<label class="camp-pick"><span class="live-dot"></span><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + h(campLabel(camp)) + '</span>' + I.down + campSelect(camp, 'dashCamp') + '</label>' +
      (admin ? '' : '<div class="seg" role="tablist" style="margin-top:6px"><button role="tab" aria-selected="' + (scope === 'mine') + '" class="' + (scope === 'mine' ? 'on' : '') + '" data-act="dashScope" data-v="mine">My leads</button><button role="tab" aria-selected="' + (scope === 'team') + '" class="' + (scope === 'team' ? 'on' : '') + '" data-act="dashScope" data-v="team">Team</button></div>') +
      '</header>';
    if (camp != null && !src) return head + '<div class="page"><div class="loading" style="min-height:30vh"><div class="spin"></div>Loading…</div></div>';
    if (!n) return head + '<div class="page"><div class="empty"><strong>No leads yet</strong>Numbers appear here as soon as leads arrive in this campaign.</div></div>';
    return head + '<div class="page">' +
      '<div class="kpis">' +
      '<div class="kpi dark"><b>' + k.total + '</b><span>Leads</span></div>' +
      '<div class="kpi"><b>' + k.newl + '</b><span>New · ' + pct(k.newl) + '</span></div>' +
      '<div class="kpi"><b>' + k.prop + '</b><span>Proposals · ' + pct(k.prop) + '</span></div>' +
      '<div class="kpi"><b>' + k.fu + '</b><span>Follow-up required</span></div>' +
      '<div class="kpi won"><b>' + k.won + '</b><span>Confirmed</span></div>' +
      '<div class="kpi lost"><b>' + k.lost + '</b><span>Lost / not potential</span></div>' +
      '<div class="kpi ret"><b>' + k.ret + '</b><span>Returning leads</span></div></div>' +
      '<div class="dash-grid" style="display:grid;gap:12px">' +
      '<section class="box"><h2 class="lbl" style="font-size:13px">Pipeline by status</h2>' + bars(statusOrder.map(function (s) { return [s, byStatus[s]]; }), maxS, colorFor) + '</section>' +
      (venues.length ? '<section class="box"><h2 class="lbl" style="font-size:13px">Venue interest</h2><div class="split">' + venues.map(function (v, i) { return '<div style="width:' + (v[1] / vTotal * 100) + '%;background:' + vColors[i % 4] + '"></div>'; }).join('') + '</div><div class="legend">' + venues.map(function (v, i) { return '<span><i style="background:' + vColors[i % 4] + '"></i>' + h(v[0]) + ' <b style="color:var(--ink)">' + v[1] + '</b></span>'; }).join('') + '</div>' +
        '<h2 class="lbl" style="font-size:13px;margin-top:8px">Guest count</h2>' + bars(group('p', 6), Math.max.apply(null, group('p', 6).map(function (x) { return x[1]; })), '#007293') + '</section>' : '') +
      '<section class="box"><h2 class="lbl" style="font-size:13px">When is the event?</h2>' + bars(group('w', 6), Math.max.apply(null, group('w', 6).map(function (x) { return x[1]; })), '#686B8C') + '</section>' +
      '<section class="box"><h2 class="lbl" style="font-size:13px">Ad performance</h2>' + bars(group('ad', 10), Math.max.apply(null, group('ad', 10).map(function (x) { return x[1]; })), function (a) { return /^TGY/i.test(a) ? '#06937E' : '#002F61'; }) + '</section>' +
      '</div>' +
      (scope === 'team' && teamTable ? '<section class="box"><h2 class="lbl" style="font-size:13px">Team performance</h2><div class="scroll-x"><table class="tbl" style="min-width:520px"><thead><tr><th>Salesperson</th><th class="num">Leads</th><th class="num">New</th><th class="num">Contacted</th><th class="num">In progress</th><th class="num">Confirmed</th><th class="num">Lost / NP</th></tr></thead><tbody>' + teamTable + '</tbody></table></div></section>' : '') +
      (dayKeys.length ? '<section class="box"><div class="row-between"><h2 class="lbl" style="font-size:13px">Leads received per day</h2><span class="hint">Average ' + avg + ' per day</span></div><div class="scroll-x"><div class="days">' + dayKeys.map(function (d) { return '<div class="day"><b>' + byDay[d] + '</b><i style="height:' + Math.max(3, Math.round(byDay[d] / maxD * 115)) + 'px"></i><span>' + h(shortDate(d)) + '</span></div>'; }).join('') + '</div></div></section>' : '') +
      '</div>';
  }

  // ── Profile ──
  function profileView() {
    var me = D().me, standalone = isStandalone();
    var perm = ('Notification' in window) ? Notification.permission : 'unsupported';
    var pushOn = !!pushAppId();
    return '<header class="page-head"><div><h1>Profile</h1><p>' + h(me.name) + ' · ' + (isAdmin() ? 'Admin' : h(me.team || 'Team member')) + '</p></div>' + av(me.name, 48) + '</header>' +
      '<div class="page" style="max-width:640px">' +
      '<section class="box"><div class="lbl">Notifications</div>' +
      (!pushOn ? '<p class="hint" style="margin:0">Push notifications aren’t switched on for this app yet (admin: add the OneSignal App ID).</p>' :
        perm === 'granted' ? '<p style="margin:0;font-size:14px">On. You’ll hear about new leads, your 10 AM summary and follow-up reminders.</p>' :
        (isIOS() && !standalone ? '<p style="margin:0;font-size:14px">On iPhone, add the app to your Home Screen first (below), then open it from there and turn notifications on.</p>' :
          '<button class="btn btn-blue" data-act="enablePush">' + I.bell + 'Turn on notifications</button>')) + '</section>' +
      '<section class="box"><div class="lbl">Install the app</div>' + installHtml(true) + '</section>' +
      '<section class="box"><div class="lbl">Passcode</div><button class="btn btn-line" data-act="changePinForm">Change my passcode</button></section>' +
      '<button class="btn btn-line btn-big" data-act="signOut">Sign out</button>' +
      '<p class="hint" style="text-align:center">' + (DEMO ? 'Demo mode · ' : '') + 'Data from the shared leads sheet · last synced ' + (D().serverTime ? timeStr(new Date(D().serverTime)) : '—') + '</p></div>';
  }
  function changePinHtml() {
    var f = S.sheet;
    return '<div class="box"><label class="lbl" for="cp-old">Current passcode</label><input id="cp-old" class="inp" inputmode="numeric" maxlength="4" type="password" data-form="old" value="' + h(f.old || '') + '">' +
      '<label class="lbl" for="cp-new">New passcode (4 digits)</label><input id="cp-new" class="inp" inputmode="numeric" maxlength="4" type="password" data-form="new" value="' + h(f['new'] || '') + '"></div>';
  }

  // ── Sheets (mobile lead detail, campaign form, passcode) ──
  function sheetHtml() {
    var s = S.sheet, title = '', body = '', act = '', label = 'Save';
    if (s.type === 'lead') {
      var l = findLead(s.id); if (!l) { S.sheet = null; return ''; }
      title = 'Lead'; body = detailInner(l);
    } else if (s.type === 'camp') {
      title = s.original ? 'Edit Campaign' : 'New Campaign'; body = campFormHtml(); act = 'saveCamp'; label = s.original ? 'Save' : 'Create';
    } else if (s.type === 'pin') {
      title = 'Passcode'; body = changePinHtml(); act = 'savePin';
    }
    var wrapStyle = isDesktop() ? ' style="inset:auto;top:0;right:0;bottom:0;width:440px;z-index:70;box-shadow:-10px 0 40px rgba(0,17,55,.18)"' : '';
    return (isDesktop() ? '<div class="overlay" style="z-index:65" data-act="closeSheet"></div>' : '') +
      '<div class="sheet-wrap' + (s.fresh ? ' anim' : '') + '" role="dialog" aria-modal="true" aria-label="' + h(title) + '"' + wrapStyle + '><div class="sheet-head">' +
      '<button class="nav-txt" data-act="closeSheet">' + (s.type === 'lead' ? 'Done' : 'Cancel') + '</button><span class="title">' + h(title) + '</span>' +
      (act ? '<button class="nav-txt strong" data-act="' + act + '"' + (S.saving ? ' disabled' : '') + '>' + (S.saving ? 'Saving…' : label) + '</button>' : '<span></span>') + '</div>' +
      '<div class="sheet-body">' + body + '</div></div>';
  }

  // ───────── Login ─────────
  var QUOTES = [
    'Every booking starts with a single call.',
    'Great events begin with a great first reply.',
    'Today’s lead is next month’s celebration.',
    'Fast follow-ups win the date.',
    'Behind every wedding is a salesperson who called back.'
  ];
  function renderLogin() {
    var L = S.login, names = L.names;
    var me = names ? names.filter(function (n) { return n.name === L.name; })[0] : null;
    var first = L.name ? L.name.split(' ')[0] : '';
    var title = !L.name ? 'Welcome' : (L.stage === 'enter' ? 'Welcome back, ' + first : 'Hello, ' + first);
    if (S.quoteIdx == null) S.quoteIdx = Math.floor(Math.random() * QUOTES.length);
    APP.innerHTML = '<div class="login">' +
      (DEMO ? '<div class="demo-flag">Demo mode – any passcode works</div>' : '') +
      '<header class="hero"><div class="logo-tile"><img src="icons/logo.png" alt="Embassy Suites by Hilton"></div><h1>Leads</h1><p>' + h(C.SUBTITLE || '') + '</p></header>' +
      '<section class="auth-card">' +
      (names == null || (!names.length && !L.msg) ? '<div class="loading" style="min-height:120px"><div class="spin"></div>Loading team…</div>' :
        '<h2>' + h(title) + '</h2><p class="auth-quote">“' + h(QUOTES[S.quoteIdx]) + '”</p>' +
        '<div><label class="lbl" for="who" style="display:block;margin-bottom:6px">Your name</label><select id="who" class="select-ios" data-change="loginName">' +
        '<option value="">Choose your name</option>' +
        names.map(function (n) { return '<option value="' + h(n.name) + '"' + (n.name === L.name ? ' selected' : '') + '>' + h(n.name) + (n.admin ? ' (Admin)' : '') + '</option>'; }).join('') + '</select></div>' +
        (L.name ? '<p class="auth-label" id="pin-label">' + h(pinPrompt()) + '</p>' +
          '<div class="pin-wrap" id="pin-wrap">' + [0, 1, 2, 3].map(function (i) { return '<div class="pin-box" aria-hidden="true"></div>'; }).join('') +
          '<input id="pin" class="pin-input" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off" aria-label="4-digit passcode"' + (L.busy ? ' disabled' : '') + '></div>' +
          '<div class="pin-msg ' + (L.err ? 'err' : 'ok') + '" id="pin-msg" role="status">' + h(L.msg) + '</div>' +
          '<p class="hint" style="text-align:center">' + (me && !me.hasPin ? 'First time? Choose any 4 digits you’ll remember.' : 'Forgot it? Ask ' + h(findAdminName() || 'your admin') + ' to reset it.') + '</p>' : '')) +
      '</section>' +
      '<div class="auth-foot">' + installHtml(false) + '</div></div>';
    paintPin();
  }
  function pinPrompt() { var L = S.login; return L.stage === 'create' ? 'Create your 4-digit passcode' : (L.stage === 'confirm' ? 'Enter it once more to confirm' : 'Enter your passcode'); }
  function paintPin(err) {
    var boxes = document.querySelectorAll('.pin-box'), L = S.login, inp = document.getElementById('pin');
    if (!boxes.length) return;
    var focused = inp && document.activeElement === inp;
    for (var i = 0; i < 4; i++) {
      boxes[i].className = 'pin-box' + (i < L.pin.length ? ' on' : '') + (focused && i === L.pin.length ? ' cur' : '') + (err ? ' err' : '');
      boxes[i].textContent = i < L.pin.length ? '•' : '';
    }
    var lab = document.getElementById('pin-label'); if (lab) lab.textContent = pinPrompt();
    var msg = document.getElementById('pin-msg'); if (msg) { msg.textContent = L.msg; msg.className = 'pin-msg ' + (L.err ? 'err' : 'ok'); }
    if (inp) inp.value = L.pin;
  }
  // the team list is kept on the phone, so the sign-in screen shows instantly; it refreshes quietly behind
  function applyNames(list) {
    var L = S.login; L.names = list;
    var me = list.filter(function (n) { return n.name === L.name; })[0];
    if (!me) L.name = '';
    else if (!L.first && !L.pin) L.stage = me.hasPin ? 'enter' : 'create';
  }
  function loadNames() {
    var cached = ls('names');
    if (cached && cached.length && !S.login.names) { applyNames(cached); renderLogin(); }
    api('names').then(function (r) {
      ls('names', r.names);
      var L = S.login, typing = L.pin || L.busy || L.first || (document.activeElement && document.activeElement.id === 'pin');
      var changed = JSON.stringify(r.names) !== JSON.stringify(L.names);
      if (typing) { L.names = r.names; return; }
      applyNames(r.names); if (changed && !S.token) renderLogin();
    }).catch(function (e) { if (S.login.names && S.login.names.length) return; S.login.names = []; S.login.msg = e.message; S.login.err = true; renderLogin(); toast(e.message, true); });
  }
  function pinInput(val) {
    var L = S.login; if (L.busy) return;
    L.pin = String(val || '').replace(/\D/g, '').slice(0, 4); L.msg = ''; L.err = false; paintPin();
    if (L.pin.length < 4) return;
    var pin = L.pin;
    if (L.stage === 'create') { L.first = pin; L.pin = ''; L.stage = 'confirm'; setTimeout(function () { paintPin(); }, 150); return; }
    L.busy = true; L.msg = 'Signing in…'; L.err = false; paintPin();
    var call = L.stage === 'confirm'
      ? (pin === L.first ? api('setPin', { name: L.name, pin: pin }) : Promise.reject(new Error('Passcodes didn’t match. Try again.')))
      : api('login', { name: L.name, pin: pin });
    call.then(function (r) {
      L.busy = false;
      if (r.needsPin) { L.stage = 'create'; L.pin = ''; L.msg = 'Set up your passcode first'; L.err = false; return paintPin(); }
      S.token = r.token; ls('token', r.token); ls('lastName', L.name);
      L.pin = ''; L.msg = 'Welcome, ' + L.name.split(' ')[0]; L.err = false; paintPin();
      var inp = document.getElementById('pin'); if (inp) inp.blur();
      if (r.data) gotData(r.data, false, 0); else loadData();   // sign-in already carries the leads
    }).catch(function (e) {
      L.busy = false; L.pin = ''; L.err = true; L.msg = e.message;
      if (L.stage === 'confirm') { L.stage = 'create'; L.first = ''; }
      paintPin(true);
      if (navigator.vibrate) try { navigator.vibrate(80); } catch (x) {}
    });
  }

  // ───────── data loading ─────────
  function loadData(silent) {
    if (!silent && !D()) APP.innerHTML = '<div class="loading"><div class="spin"></div>Loading your leads…</div>';
    var askedAt = Date.now();
    return api('data').then(function (r) { gotData(r, silent, askedAt); }).catch(function (e) {
      if (!S.token) return;
      if (!D()) APP.innerHTML = '<div class="loading" style="flex-direction:column;text-align:center;padding:24px"><strong style="color:var(--blue)">Couldn’t load your leads</strong><span>' + h(e.message) + '</span><button class="btn btn-blue" style="padding:0 18px;margin-top:10px" data-act="retry">Try again</button></div>';
      else if (!silent) toast(e.message, true);
    });
  }
  function gotData(r, silent, askedAt) {
    var first = !D();
    delete r.ok;
    // keep anything changed on this phone after the request went out
    if (D() && askedAt) r.leads = r.leads.map(function (l) { return (S.touched[l.id] || 0) > askedAt ? (findLead(l.id) || l) : l; });
    S.data = r;
    cacheData();
    if (S.campaign != null && !campByName(S.campaign)) S.campaign = null;
    if (!silent || first) render(); else softRender();
    if (first) { afterHoursCheck(); initPush(); handleHash(); }
  }
  function cacheData() { try { ls('cache', { at: Date.now(), data: D() }); } catch (e) {} }
  // background refresh: never re-render under someone's finger
  function softRender() {
    var active = document.activeElement;
    var typing = active && (active.tagName === 'TEXTAREA' || (active.tagName === 'INPUT' && active.type !== 'search') || active.tagName === 'SELECT');
    if ((S.sheet && !isDesktop()) || typing || S.pending) { S.dirty = true; return; }
    var id = active && active.id, sel = active && active.selectionStart;
    rerenderKeepScroll();
    if (id) { var el = document.getElementById(id); if (el) { el.focus(); try { el.setSelectionRange(sel, sel); } catch (e) {} } }
  }
  function signOut(silent) {
    if (S.token && !silent) api('logout').catch(function () {});
    S.token = null; S.data = null; ls('token', null); ls('cache', null);
    S.sheet = null; S.selId = null; S.view = 'leads'; S.campaign = null; S.person = null; S.statusF = ''; S.past = {};
    S.login.pin = ''; S.login.msg = ''; S.login.names = null;
    renderLogin(); loadNames();
    try { if (window.OneSignal && window.OneSignal.logout) window.OneSignal.logout(); } catch (e) {}
  }
  function handleHash() {
    var m = location.hash.match(/lead=([\w-]+)/);
    if (m && findLead(m[1])) { S.view = 'leads'; openLead(m[1]); history.replaceState(null, '', location.pathname + location.search); }
  }

  // ───────── saving ─────────
  // Save one change straight away. The screen updates first; the sheet follows a moment later.
  function saveLead(id, patch, okMsg) {
    var l = findLead(id); if (!l) return;
    var before = JSON.parse(JSON.stringify(l)), me = D().me.name;
    if (patch.status !== undefined) l.status = patch.status;
    if (patch.followUp !== undefined) l.followUp = patch.followUp;
    if (patch.assigned !== undefined) l.assigned = patch.assigned;
    if (patch.comment) { var d = new Date(); l.comments = (l.comments ? l.comments + ' || ' : '') + pad(d.getDate()) + '-' + MON[d.getMonth()] + ' (' + me + '): ' + patch.comment; }
    var v = l._v = (l._v || 0) + 1;
    S.touched[id] = Date.now(); S.pending = (S.pending || 0) + 1;
    patchLead(l);
    var body = { id: id }; Object.keys(patch).forEach(function (k) { body[k] = patch[k]; });
    S.saveQ = (S.saveQ || Promise.resolve()).then(function () {
      return api('update', body).then(function (r) {
        if (r.lead && l._v === v) { var ret = l.returning; Object.keys(r.lead).forEach(function (k) { l[k] = r.lead[k]; }); l.returning = r.lead.returning || ret; patchLead(l); }
        S.touched[id] = Date.now(); cacheData(); toast(okMsg || 'Saved');
      }).catch(function (e) {
        Object.keys(before).forEach(function (k) { l[k] = before[k]; }); patchLead(l, true); toast(e.message, true);
      }).then(function () { S.pending--; });
    });
  }
  // update just the parts of the screen that show this lead (no page refresh)
  function patchLead(l, full) {
    var box = document.getElementById('detail-box');
    if (box && box.dataset.id === l.id) {
      if (full) { box.outerHTML = detailInner(l); }
      else {
        var hd = document.getElementById('d-head'); if (hd) hd.innerHTML = headHtml(l);
        var hi = document.getElementById('d-hist'); if (hi) hi.innerHTML = histHtml(l);
        var fu = document.getElementById('d-fu'); if (fu && document.activeElement !== document.getElementById('ed-fu')) fu.innerHTML = fuHtml(l);
        var a = document.getElementById('d-av'); if (a) a.innerHTML = av(l.assigned, 40);
        var st = document.getElementById('ed-status'); if (st && st.value !== l.status) st.value = l.status;
        var as = document.getElementById('ed-assigned'); if (as && as.value !== (l.assigned || '')) as.value = l.assigned || '';
      }
    }
    var card = document.getElementById('lc-' + l.id); if (card) card.outerHTML = leadCard(l);
    var row = document.getElementById('lr-' + l.id); if (row) row.outerHTML = leadRow(l);
    var hero = document.getElementById('stat-hero'); if (hero) hero.outerHTML = statHero(counts(scopedLeads()));
  }
  function saveCampaign() {
    var f = S.sheet;
    if (!f.name.trim()) return toast('Give the campaign a name', true);
    if (f.start && f.expiry && f.expiry < f.start) return toast('Expiry date is before the start date', true);
    S.saving = true; render();
    api('campaignSave', { name: f.name.trim(), original: f.original, team: f.team, start: f.start, expiry: f.expiry, brief: f.brief, members: f.members, notify: f.notify })
      .then(function () { S.saving = false; S.sheet = null; toast(f.original ? 'Campaign updated' : 'Campaign created' + (f.notify ? ' – team notified' : '')); return loadData(true); })
      .then(function () { render(); })
      .catch(function (e) { S.saving = false; render(); toast(e.message, true); });
  }

  // ───────── push notifications (OneSignal) ─────────
  function pushAppId() { return C.ONESIGNAL_APP_ID || (D() && D().oneSignalAppId) || ''; }
  var pushStarted = false;
  function initPush() {
    var id = pushAppId(); if (!id || pushStarted || DEMO) return;
    if (!('serviceWorker' in navigator) || !('Notification' in window)) return;
    pushStarted = true;
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    var s = document.createElement('script'); s.src = 'https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js'; s.defer = true; document.head.appendChild(s);
    window.OneSignalDeferred.push(function (OneSignal) {
      return OneSignal.init({
        appId: id,
        serviceWorkerPath: BASE.replace(/^\//, '') + 'OneSignalSDKWorker.js',
        serviceWorkerParam: { scope: BASE + 'onesignal/' },
        notifyButton: { enable: false }, allowLocalhostAsSecureOrigin: true
      }).then(function () { return OneSignal.login(D().me.extId); }).then(function () { if (S.view === 'leads') softRender(); });
    });
  }
  function enablePush() {
    if (!pushAppId()) return toast('Notifications are not set up yet', true);
    if (isIOS() && !isStandalone()) return toast('On iPhone, add the app to your Home Screen first', true);
    initPush();
    window.OneSignalDeferred.push(function (OneSignal) {
      return OneSignal.Notifications.requestPermission().then(function () {
        var p = Notification.permission; toast(p === 'granted' ? 'Notifications are on' : 'Notifications were blocked – allow them in your browser settings', p !== 'granted'); render();
      });
    });
  }
  function pushBell() {
    if (!pushAppId() || !('Notification' in window) || Notification.permission === 'granted') return '';
    return '<button class="icon-btn" data-act="enablePush" aria-label="Turn on notifications">' + I.bell + '</button>';
  }
  function pushBanner() {
    if (!pushAppId() || !('Notification' in window) || Notification.permission !== 'default' || ls('pushDismissed')) return '';
    return '<div class="box" style="flex-direction:row;align-items:center;gap:12px;border:1.5px solid var(--blue)"><span style="color:var(--blue)">' + I.bell + '</span><p style="margin:0;flex:1;font-size:14px">Turn on notifications to hear about new leads and your reminders.</p><button class="btn btn-blue" style="padding:0 12px;height:38px" data-act="enablePush">Turn on</button><button class="linkish" data-act="dismissPush" aria-label="Not now">Later</button></div>';
  }

  // ───────── install ─────────
  function isIOS() { return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
  function isStandalone() { return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true; }
  function installHtml(light) {
    if (isStandalone()) return light ? '<p style="margin:0;font-size:14px">Installed – you’re using the app.</p>' : '';
    var text, btn = '';
    if (deferredInstall) { text = 'Install the Leads app on this device for one-tap access.'; btn = '<button class="' + (light ? 'btn btn-blue' : 'btn-light') + '" style="padding:0 14px;height:40px" data-act="install">Install app</button>'; }
    else if (isIOS()) text = 'To install on iPhone: tap the Share button in Safari, then “Add to Home Screen”.';
    else text = 'To install: open your browser menu and choose “Install app” or “Add to Home screen”.';
    if (light) return '<p style="margin:0;font-size:14px;line-height:1.45">' + text + '</p>' + btn;
    return '<div class="install-card"><img src="icons/icon-192.png" alt="" width="40" height="40" style="border-radius:10px"><p>' + text + '</p>' + btn + '</div>';
  }

  // ───────── after-hours message ─────────
  var AH = {
    late: [
      ['You really are a hard worker', 'It’s past 7 PM and you’re still chasing leads. They’ll be here tomorrow – take a breath and enjoy your evening.'],
      ['Rest is part of selling', 'Great closers know when to switch off. Set a reminder for tomorrow and log off with a clear head.'],
      ['Even weddings need a pause', 'Between the dances there’s always a breather. Take yours now – the next big booking can wait till morning.'],
      ['Deep breath in… and out', 'You’re working outside your hours. Two calm minutes now will make tomorrow’s calls even better.'],
      ['The night shift is optional', 'Your leads appreciate the dedication, but your family and your sofa miss you more.'],
      ['Clock-out reminder', 'Quick check, then close the app. Tomorrow’s 10 AM summary will have everything lined up for you.']
    ],
    early: [
      ['Early bird, meet coffee', 'Up before 8 AM and already checking leads? Grab a coffee first – the best calls happen when you feel fresh.'],
      ['The sun’s barely up', 'Your dedication is impressive. Have breakfast, stretch, and your leads will be waiting at 8.'],
      ['Morning, superstar', 'Nobody expects you at your desk yet. Take a few slow breaths and ease into the day.']
    ],
    weekend: [
      ['It’s the weekend', 'Your dedication is noted. Reply only if it truly can’t wait, then go and do something just for you.'],
      ['Weekend mode: on', 'Leads don’t get lonely in two days. Recharge – Monday-you will thank weekend-you.'],
      ['Day off, remember?', 'A quick peek is fine, but don’t forget to catch your breath and enjoy the break.']
    ]
  };
  function afterHoursCheck(force) {
    var now = new Date(), hr = now.getHours(), day = now.getDay();
    var start = C.WORK_START_HOUR == null ? 8 : C.WORK_START_HOUR, end = C.WORK_END_HOUR == null ? 19 : C.WORK_END_HOUR;
    var weekend = (C.WEEKEND_DAYS || [6, 0]).indexOf(day) >= 0;
    var kind = weekend ? 'weekend' : (hr < start ? 'early' : (hr >= end ? 'late' : ''));
    if (!kind && !force) return;
    try { if (!force && sessionStorage.getItem('leads.ah')) return; sessionStorage.setItem('leads.ah', '1'); } catch (e) {}
    S.ahKind = kind || 'late';
    var last = ls('ahLast') || '';
    var pool = AH[S.ahKind], i = Math.floor(Math.random() * pool.length);
    if (pool.length > 1 && pool[i][0] === last) i = (i + 1) % pool.length;
    S.ahIdx = i; showAH();
  }
  function showAH() {
    var pool = AH[S.ahKind], m = pool[S.ahIdx % pool.length]; ls('ahLast', m[0]);
    var now = new Date();
    var old = document.getElementById('ah'); if (old) old.remove();
    var el = document.createElement('div'); el.id = 'ah'; el.className = 'overlay';
    el.innerHTML = '<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="ah-t"><div class="dialog-top"><div class="moon">' + (S.ahKind === 'early' ? I.sun : I.moon) + '</div>' +
      '<span style="font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)">' + DOW[now.getDay()] + ' · ' + timeStr(now) + '</span><h2 id="ah-t">' + h(m[0]) + '</h2></div>' +
      '<div class="dialog-body"><p>' + h(m[1]) + '</p><div class="dialog-actions"><button class="strong" data-act="ahClose">Got it – I’ll be quick</button><button data-act="ahNext">Show another message</button></div></div></div>';
    document.body.appendChild(el);
    var b = el.querySelector('button'); if (b) b.focus();
  }

  // ───────── toast ─────────
  var toastTimer;
  function toast(msg, err) {
    var t = document.getElementById('toast'); if (t) t.remove();
    t = document.createElement('div'); t.id = 'toast'; t.className = 'toast' + (err ? ' err' : ''); t.setAttribute('role', 'status'); t.textContent = msg;
    document.body.appendChild(t); clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.remove(); }, err ? 4500 : 2600);
  }

  // ───────── events ─────────
  var ACT = {
    nav: function (el) { S.view = el.dataset.v; S.sheet = null; window.scrollTo(0, 0); render(); },
    filter: function (el) { S.filter = S.filter === el.dataset.v && el.dataset.v !== 'open' ? 'open' : el.dataset.v; S.statusF = ''; render(); },
    backLive: function () { S.campaign = null; S.selId = null; window.scrollTo(0, 0); render(); },
    addComment: function () {
      var t = document.getElementById('ed-comment'), text = (t ? t.value : (S.edit && S.edit.comment) || '').trim();
      if (!text) { toast('Type a comment first', true); if (t) t.focus(); return; }
      if (S.edit) S.edit.comment = ''; if (t) { t.value = ''; t.blur(); }
      saveLead(S.edit ? S.edit.id : S.selId, { comment: text }, 'Added to history');
    },
    open: function (el) { openLead(el.dataset.id); },
    closeSheet: function () {
      var y = window.scrollY; S.sheet = null; if (!isDesktop()) S.selId = null;
      S.dirty = false; render(); window.scrollTo(0, y);
    },
    preset: function (el) {
      var d = new Date(), v = el.dataset.v, id = S.edit && S.edit.id; if (!id) return;
      if (v === 'clear') return saveLead(id, { followUp: '' }, 'Reminder cleared');
      if (v === 'tomorrow') d.setDate(d.getDate() + 1);
      if (v === '2d') d.setDate(d.getDate() + 2);
      if (v === 'week') d.setDate(d.getDate() + 7);
      d.setHours(10, 0, 0, 0);
      saveLead(id, { followUp: d.toISOString() }, 'Reminder set for ' + fuLabel(d.toISOString()));
    },
    viewCamp: function (el) { S.campaign = el.dataset.v; S.view = 'leads'; S.filter = 'open'; S.statusF = ''; S.person = ''; S.selId = null; window.scrollTo(0, 0); render(); },
    campForm: function (el) { campForm(el.dataset.v || ''); },
    formTeam: function (el) { S.sheet.team = el.dataset.v; if (!S.sheet.original) S.sheet.members = teamMembers(el.dataset.v); rerenderKeepScroll(); },
    formMember: function (el) { var m = S.sheet.members, n = el.dataset.v, i = m.indexOf(n); if (i >= 0) m.splice(i, 1); else m.push(n); rerenderKeepScroll(); },
    saveCamp: saveCampaign,
    toggleAccess: function (el) {
      var u = D().users.filter(function (x) { return x.name === el.dataset.user; })[0]; if (!u) return;
      var list = (u.campaigns || []).slice(), c = el.dataset.v, i = list.indexOf(c);
      if (i >= 0) list.splice(i, 1); else list.push(c);
      var prev = u.campaigns; u.campaigns = list; rerenderKeepScroll();
      api('access', { name: u.name, campaigns: list }).then(function () { toast(u.name + (i >= 0 ? ' removed from ' : ' can now see ') + c); })
        .catch(function (e) { u.campaigns = prev; rerenderKeepScroll(); toast(e.message, true); });
    },
    toggleActive: function (el) {
      var u = D().users.filter(function (x) { return x.name === el.dataset.v; })[0]; if (!u) return;
      if (u.active && !confirm('Switch off ' + u.name + '? They won’t be able to sign in.')) return;
      api('userSave', { name: u.name, active: !u.active }).then(function () { u.active = !u.active; rerenderKeepScroll(); toast(u.name + (u.active ? ' switched on' : ' switched off')); }).catch(function (e) { toast(e.message, true); });
    },
    resetPin: function (el) {
      var n = el.dataset.v; if (!confirm('Reset ' + n + '’s passcode? They’ll create a new one next time they sign in.')) return;
      api('resetPin', { name: n }).then(function () { toast(n + ' can now set a new passcode'); loadData(true); }).catch(function (e) { toast(e.message, true); });
    },
    addUser: function () {
      var name = (document.getElementById('nu-name').value || '').trim(); if (!name) return toast('Type a name first', true);
      if (D().users.some(function (u) { return u.name.toLowerCase() === name.toLowerCase(); })) return toast(name + ' is already on the list', true);
      api('userSave', { name: name, team: document.getElementById('nu-team').value, email: document.getElementById('nu-email').value.trim(), campaigns: [] })
        .then(function () { toast(name + ' added – now tick their campaigns'); return loadData(true); }).then(render).catch(function (e) { toast(e.message, true); });
    },
    dashScope: function (el) { S.dashScope = el.dataset.v; render(); },
    enablePush: enablePush,
    dismissPush: function () { ls('pushDismissed', true); render(); },
    install: function () {
      if (!deferredInstall) return;
      deferredInstall.prompt();
      deferredInstall.userChoice.then(function () { deferredInstall = null; S.data ? render() : renderLogin(); });
    },
    changePinForm: function () { S.sheet = { type: 'pin', fresh: true }; render(); },
    savePin: function () {
      var f = S.sheet;
      if (!/^\d{4}$/.test(f['new'] || '')) return toast('New passcode must be 4 digits', true);
      api('changePin', { oldPin: f.old, newPin: f['new'] }).then(function () { S.sheet = null; render(); toast('Passcode changed'); }).catch(function (e) { toast(e.message, true); });
    },
    signOut: function () { if (confirm('Sign out of the Leads app?')) signOut(); },
    forgot: function () { toast('Ask ' + (findAdminName() || 'your admin') + ' to reset your passcode in Team & access.'); },
    retry: function () { loadData(); },
    ahClose: function () { var e = document.getElementById('ah'); if (e) e.remove(); },
    ahNext: function () { S.ahIdx++; showAH(); }
  };
  function findAdminName() { var n = (S.login.names || []).filter(function (x) { return x.admin; })[0]; return n && n.name; }
  function rerenderKeepScroll() {
    var y = window.scrollY, sb = document.querySelector('.sheet-body'), sy = sb ? sb.scrollTop : 0, dc = document.querySelector('.detail-col'), dy = dc ? dc.scrollTop : 0;
    render(); window.scrollTo(0, y);
    var sb2 = document.querySelector('.sheet-body'); if (sb2) sb2.scrollTop = sy;
    var dc2 = document.querySelector('.detail-col'); if (dc2) dc2.scrollTop = dy;
  }

  document.addEventListener('click', function (e) {
    var stop = e.target.closest('[data-stop]'); if (stop) return;
    var el = e.target.closest('[data-act]'); if (!el) return;
    var fn = ACT[el.dataset.act]; if (!fn) return;
    if (el.tagName === 'A') e.preventDefault();
    fn(el, e);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target.matches && e.target.matches('tr[data-act="open"]')) { openLead(e.target.dataset.id); return; }
    if (e.key === 'Escape') { var ah = document.getElementById('ah'); if (ah) ah.remove(); else if (S.sheet) { S.sheet = null; render(); } }
  });
  document.addEventListener('input', function (e) {
    var t = e.target;
    if (t.id === 'pin') { pinInput(t.value); return; }
    if (t.dataset.input === 'q') {
      S.q = t.value; var pos = t.selectionStart; render();
      var n = document.querySelector('[data-input="q"]'); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (er) {} }
    } else if (t.dataset.edit === 'comment' && S.edit) { S.edit.comment = t.value; }
    else if (t.dataset.form && S.sheet) { S.sheet[t.dataset.form] = t.type === 'checkbox' ? t.checked : t.value; }
  });
  document.addEventListener('change', function (e) {
    var t = e.target, c = t.dataset.change;
    if (t.dataset.edit && S.edit) {
      var id = S.edit.id, f = t.dataset.edit;
      if (f === 'status') saveLead(id, { status: t.value }, 'Status: ' + t.value);
      else if (f === 'assigned') saveLead(id, { assigned: t.value }, t.value ? 'Assigned to ' + t.value.split(' ')[0] : 'Unassigned');
      else if (f === 'followUp') saveLead(id, { followUp: t.value ? new Date(t.value).toISOString() : '' }, t.value ? 'Reminder set for ' + fuLabel(new Date(t.value).toISOString()) : 'Reminder cleared');
      return;
    }
    if (t.dataset.form && S.sheet) { S.sheet[t.dataset.form] = t.type === 'checkbox' ? t.checked : t.value; return; }
    if (t.dataset.userfield) {
      var u = D().users.filter(function (x) { return x.name === t.dataset.user; })[0]; if (!u) return;
      var f = t.dataset.userfield, val = t.value.trim();
      if (f === 'email' && val && !validEmail(val)) return toast('That email doesn’t look right', true);
      if (f === 'photo' && val && !/^https?:\/\//.test(val)) return toast('Paste a full link starting with https://', true);
      var body = { name: u.name }; body[f] = val;
      api('userSave', body).then(function () { u[f] = val; toast('Saved'); }).catch(function (er) { toast(er.message, true); });
      return;
    }
    if (c === 'dashCamp') { S.dashCamp = t.value === '__live' ? null : t.value; render(); }
    else if (c === 'person') { S.person = t.value; S.selId = null; window.scrollTo(0, 0); render(); }
    else if (c === 'statusF') { S.statusF = t.value; if (t.value) S.filter = 'all'; else if (S.filter === 'all') S.filter = 'open'; render(); }
    else if (c === 'loginName') {
      var L = S.login; L.name = t.value; L.pin = ''; L.msg = ''; L.err = false; L.first = '';
      var n = (L.names || []).filter(function (x) { return x.name === L.name; })[0];
      L.stage = n && !n.hasPin ? 'create' : 'enter'; renderLogin();
      var p = document.getElementById('pin'); if (p) try { p.focus(); } catch (er) {}
    }
  });
  // no pinch or double-tap zoom (iOS ignores user-scalable=no on its own)
  ['gesturestart', 'gesturechange', 'gestureend'].forEach(function (ev) { document.addEventListener(ev, function (e) { e.preventDefault(); }, { passive: false }); });
  document.addEventListener('focusin', function (e) { if (e.target.id === 'pin') paintPin(); });
  document.addEventListener('focusout', function (e) { if (e.target.id === 'pin') setTimeout(paintPin, 0); });
  var lastWide = isDesktop();
  window.addEventListener('resize', function () {
    var w = isDesktop(); if (w === lastWide) return; lastWide = w;
    if (S.data) { if (w && S.sheet && S.sheet.type === 'lead') S.sheet = null; render(); }
  });
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferredInstall = e; S.data ? (S.view === 'profile' && render()) : renderLogin(); });
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && S.token && D()) loadData(true); });
  // hairline under the fixed top bar once the page scrolls
  window.addEventListener('scroll', function () {
    var bar = document.querySelector('.lt,.page-head'); if (bar) bar.classList.toggle('scrolled', window.scrollY > 4);
  }, { passive: true });
  setInterval(function () { if (document.visibilityState === 'visible' && S.token && D()) loadData(true); }, 3 * 60 * 1000);

  // ───────── demo backend (runs when no API_URL is set) ─────────
  var Demo = (function () {
    
    function rng(seed) { return function () { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }
    function build() {
      var r = rng(42), pick = function (a) { return a[Math.floor(r() * a.length)]; };
      var today = new Date(); today.setHours(0, 0, 0, 0);
      function rel(days) { var d = new Date(today); d.setDate(d.getDate() + days); return dayKey(d); }
      var camps = [
        { name: 'Q4 26', team: 'Events', start: rel(-31), expiry: rel(73), brief: 'Gourmet Yard from AED 99 pp for 20–80 guests. Fursa Ballroom packages for 90–350 guests.' },
        { name: 'Festive Corporate 2026', team: 'Sales', start: rel(-12), expiry: rel(60), brief: 'Christmas and year-end corporate parties. Push the Fursa Ballroom festive menu.' },
        { name: 'Summer 2026', team: 'Events', start: rel(-198), expiry: rel(-34), brief: '' }
      ];
      var users = [
        { name: 'Shrikant Trivedi', role: 'Admin', team: '', campaigns: [], email: '', active: true, pin: '' },
        { name: 'Ghada Elgabry', role: 'Member', team: 'Events', campaigns: ['Q4 26', 'Summer 2026'], email: '', active: true, pin: '' },
        { name: 'Madelene Espejo', role: 'Member', team: 'Events', campaigns: ['Q4 26', 'Summer 2026'], email: '', active: true, pin: '' },
        { name: 'Sarah Mansour', role: 'Member', team: 'Events', campaigns: ['Q4 26', 'Summer 2026'], email: '', active: true, pin: '' },
        { name: 'Youssef', role: 'Member', team: 'Sales', campaigns: ['Festive Corporate 2026'], email: '', active: true, pin: '' },
        { name: 'Omar', role: 'Member', team: 'Sales', campaigns: ['Festive Corporate 2026'], email: '', active: true, pin: '' }
      ];
      var FN = ['Layla', 'Omar', 'Priya', 'Daniel', 'Maria', 'Hassan', 'Aisha', 'Joel', 'Fatima', 'Ravi', 'Nadia', 'Karim', 'Sofia', 'Yusuf', 'Grace', 'Imran', 'Hana', 'Marco', 'Zainab', 'Leo', 'Noor', 'Arjun', 'Salma', 'Tariq', 'Elena', 'Bilal', 'Rosa', 'Sami', 'Mei', 'Adam'];
      var LN = ['Haddad', 'Khan', 'Menon', 'Santos', 'Reyes', 'Ali', 'Rahman', 'Fernandes', 'Nasser', 'Kapoor', 'Saleh', 'Cruz', 'Iqbal', 'Mansour', 'Pereira', 'Aziz', 'Gomez', 'Farouk', 'Joseph', 'Darwish'];
      var STAT = ['New Lead', 'New Lead', 'New Lead', 'Contacted', 'Contacted', 'Proposal Sent', 'Proposal Sent', 'Proposal Sent', 'Qualified Lead', 'Follow-Up Required', 'Site Visit Scheduled', 'Confirmed', 'Not Potential', 'Lost – Chose Another Venue', 'Lost – Date Unavailable'];
      var leads = [], n = 0;
      function mk(camp, who, ads, paxes, dayFrom, dayTo, count) {
        for (var i = 0; i < count; i++) {
          var fn = pick(FN), ln = pick(LN), ad = pick(ads), st = pick(STAT), d = Math.round(dayFrom + r() * (dayTo - dayFrom));
          var l = {
            id: 'D' + (++n), tab: camp, row: n + 1, campaign: camp, date: rel(d), ad: ad,
            venue: /^TGY/.test(ad) ? 'Gourmet Yard' : 'Fursa Ballroom', pax: pick(paxes),
            when: pick(['This Month', 'Next 3 Months', 'Next 3 Months', 'Next 6 Months', 'No Dates Yet']),
            name: fn + ' ' + ln, mobile: '9715' + Math.floor(10000000 + r() * 89999999), email: (fn + '.' + ln + Math.floor(r() * 90 + 10)).toLowerCase() + '@example.com',
            status: st, assigned: pick(who), comments: '', followUp: '', addedAt: new Date(today.getTime() + d * 864e5 + 9 * 36e5).toISOString()
          };
          if (st !== 'New Lead' && r() > 0.3) l.comments = shortDate(rel(d + 1)) + ' (' + l.assigned + '): ' + pick(['Called, sent the package on WhatsApp', 'Wants to visit the ballroom this weekend', 'Budget around AED 150 pp, checking other venues', 'Asked for the Gourmet Yard menu', 'No answer – dropped a WhatsApp message']);
          if (CLOSED_DEFAULT.indexOf(st) < 0 && r() > 0.55) { var fd = new Date(); fd.setDate(fd.getDate() + Math.round(r() * 6 - 2)); fd.setHours(10 + Math.floor(r() * 7), r() > 0.5 ? 30 : 0, 0, 0); l.followUp = fd.toISOString(); }
          leads.push(l);
        }
      }
      mk('Summer 2026', ['Ghada Elgabry', 'Madelene Espejo', 'Sarah Mansour'], ['Ad Set 3', 'Ad Set 5', 'TGY 2', 'TGY 4'], ['Less Than 100 Pax', '100 - 200 Pax', '200 - 350 Pax'], -190, -40, 40);
      mk('Q4 26', ['Ghada Elgabry', 'Madelene Espejo', 'Sarah Mansour'], ['Ad Set 2', 'Ad Set 4', 'Ad Set 6', 'TGY - Ad Set 1', 'TGY - Ad Set 2', 'TGY - Ad Set 3'], ['20 - 80 Pax', '90 - 200 Pax', '200 - 350 Pax'], -31, 0, 70);
      mk('Festive Corporate 2026', ['Youssef', 'Omar'], ['Corporate Ad 1', 'Corporate Ad 2'], ['20 - 80 Pax', '90 - 200 Pax'], -12, 0, 22);
      // a few returning people (same phone in Summer and Q4)
      var summer = leads.filter(function (l) { return l.campaign === 'Summer 2026'; }), q4 = leads.filter(function (l) { return l.campaign === 'Q4 26'; });
      for (var k = 0; k < 6; k++) { q4[k * 3].mobile = summer[k].mobile; q4[k * 3].name = summer[k].name; }
      // two "just added" leads
      q4.slice(-2).forEach(function (l) { l.addedAt = new Date(Date.now() - 20 * 60000).toISOString(); l.date = dayKey(new Date()); l.status = 'New Lead'; l.followUp = ''; });
      return { camps: camps, users: users, leads: leads, sessions: {} };
    }
    function db() { var x = ls('demoDB3'); if (!x) { x = build(); save(x); } return x; }
    function save(x) { ls('demoDB3', x); }
    function today() { return dayKey(new Date()); }
    function campView(c) { var t = today(); return { name: c.name, team: c.team, start: c.start, expiry: c.expiry, brief: c.brief, active: (!c.start || c.start <= t) && (!c.expiry || c.expiry >= t), upcoming: !!c.start && c.start > t }; }
    function user(x, name) { return x.users.filter(function (u) { return u.name.toLowerCase() === String(name || '').toLowerCase(); })[0]; }
    function auth(x, token) { var n = x.sessions[token]; var u = n && user(x, n); if (!u || !u.active) throw new Error('SIGNED_OUT'); return u; }
    function markRet(list) {
      list.forEach(function (l) {
        var k = digits(l.mobile).slice(-9), best = null;
        list.forEach(function (o) { if (o !== l && o.campaign !== l.campaign && digits(o.mobile).slice(-9) === k && o.date < l.date && (!best || o.date < best.date)) best = o; });
        l.returning = best ? { campaign: best.campaign, date: best.date, pax: best.pax, status: best.status, assigned: best.assigned } : null;
      });
    }
    var H = {
      names: function (x) { return { names: x.users.filter(function (u) { return u.active; }).map(function (u) { return { name: u.name, hasPin: !!u.pin, admin: u.role === 'Admin' }; }) }; },
      setPin: function (x, b) { var u = user(x, b.name); u.pin = b.pin; var t = 'T' + Math.random().toString(36).slice(2); x.sessions[t] = u.name; return { token: t, name: u.name, data: H.data(x, { token: t }) }; },
      login: function (x, b) { var u = user(x, b.name); if (!u.pin) return { needsPin: true }; var t = 'T' + Math.random().toString(36).slice(2); x.sessions[t] = u.name; return { token: t, name: u.name, data: H.data(x, { token: t }) }; },
      logout: function (x, b) { delete x.sessions[b.token]; return {}; },
      changePin: function (x, b) { var u = auth(x, b.token); u.pin = b.newPin; return {}; },
      data: function (x, b) {
        var u = auth(x, b.token), admin = u.role === 'Admin';
        var camps = x.camps.map(campView).filter(function (c) { return admin || u.campaigns.indexOf(c.name) >= 0; });
        var all = JSON.parse(JSON.stringify(x.leads)).filter(function (l) { return l.status !== 'Duplicate'; }); markRet(all);
        camps.forEach(function (c) {
          var mine = all.filter(function (l) { return l.campaign === c.name; });
          c.stats = { total: mine.length, won: mine.filter(function (l) { return l.status === 'Confirmed'; }).length, open: mine.filter(function (l) { return CLOSED_DEFAULT.indexOf(l.status) < 0; }).length };
        });
        var live = camps.filter(function (c) { return c.active || c.upcoming; }).map(function (c) { return c.name; });
        return {
          me: { name: u.name, role: u.role, team: u.team, campaigns: admin ? x.camps.map(function (c) { return c.name; }) : u.campaigns, extId: u.name.toLowerCase() },
          campaigns: camps, leads: all.filter(function (l) { return live.indexOf(l.campaign) >= 0; }),
          users: x.users.map(function (v) { return { name: v.name, team: v.team, role: v.role, active: v.active, photo: v.photo || '', campaigns: v.role === 'Admin' ? ['ALL'] : v.campaigns, email: admin ? v.email : undefined, hasPin: !!v.pin }; }),
          statuses: ['New Lead', 'Contacted', 'Awaiting Response', 'Qualified Lead', 'Potential Lead', 'Proposal Sent', 'Follow-Up Required', 'Site Visit Scheduled', 'Site Visit Completed', 'Negotiation in Progress', 'Tentative Hold', 'Confirmed', 'Lost – Price', 'Lost – Date Unavailable', 'Lost – Chose Another Venue', 'Not Potential', 'Duplicate'],
          closed: CLOSED_DEFAULT, oneSignalAppId: '', serverTime: new Date().toISOString()
        };
      },
      campaignLeads: function (x, b) {
        var u = auth(x, b.token);
        if (u.role !== 'Admin' && u.campaigns.indexOf(b.campaign) < 0) throw new Error('You do not have access to this campaign');
        var all = JSON.parse(JSON.stringify(x.leads)); markRet(all);
        return { campaign: b.campaign, leads: all.filter(function (l) { return l.campaign === b.campaign; }) };
      },
      update: function (x, b) {
        var u = auth(x, b.token), l = x.leads.filter(function (y) { return y.id === b.id; })[0];
        if (!l) throw new Error('Lead not found');
        if (u.role !== 'Admin' && u.campaigns.indexOf(l.campaign) < 0) throw new Error('You do not have access to this campaign');
        if (b.status !== undefined) l.status = b.status;
        if (b.followUp !== undefined) l.followUp = b.followUp;
        if (b.comment) { var d = new Date(); l.comments = (l.comments ? l.comments + ' || ' : '') + pad(d.getDate()) + '-' + MON[d.getMonth()] + ' (' + u.name + '): ' + b.comment; }
        if (b.assigned !== undefined) l.assigned = b.assigned;
        l.updatedAt = new Date().toISOString(); l.updatedBy = u.name;
        return { lead: JSON.parse(JSON.stringify(l)) };
      },
      campaignSave: function (x, b) {
        var u = auth(x, b.token); if (u.role !== 'Admin') throw new Error('Admin only');
        var c = x.camps.filter(function (y) { return y.name === (b.original || b.name); })[0];
        if (!c) { c = {}; x.camps.push(c); }
        var old = c.name; c.name = b.name; c.team = b.team; c.start = b.start; c.expiry = b.expiry; c.brief = b.brief;
        x.users.forEach(function (v) {
          if (v.role === 'Admin') return;
          v.campaigns = v.campaigns.filter(function (n) { return n !== old && n !== b.name; });
          if (b.members.indexOf(v.name) >= 0) v.campaigns.push(b.name);
        });
        if (old && old !== b.name) x.leads.forEach(function (l) { if (l.campaign === old) l.campaign = b.name; });
        return {};
      },
      access: function (x, b) { var u = auth(x, b.token); if (u.role !== 'Admin') throw new Error('Admin only'); user(x, b.name).campaigns = b.campaigns; return {}; },
      userSave: function (x, b) {
        var a = auth(x, b.token); if (a.role !== 'Admin') throw new Error('Admin only');
        var u = user(x, b.name);
        if (!u) { x.users.push({ name: b.name, role: 'Member', team: b.team || '', campaigns: b.campaigns || [], email: b.email || '', active: true, pin: '' }); return {}; }
        ['team', 'email', 'active', 'campaigns', 'role', 'photo'].forEach(function (k) { if (b[k] !== undefined) u[k] = b[k]; });
        return {};
      },
      resetPin: function (x, b) { var a = auth(x, b.token); if (a.role !== 'Admin') throw new Error('Admin only'); user(x, b.name).pin = ''; return {}; }
    };
    return {
      call: function (action, body) {
        return new Promise(function (resolve) {
          setTimeout(function () {
            var x = db(), out;
            try { out = H[action](x, body); out.ok = true; save(x); } catch (e) { out = { ok: false, error: e.message }; }
            resolve(JSON.parse(JSON.stringify(out)));
          }, 220);
        });
      },
      reset: function () { ls('demoDB3', null); }
    };
  })();
  window.LeadsDemoReset = Demo.reset;

  // ───────── start ─────────
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch(function () {});
  }
  if (S.token) {
    ls('seen', Date.now());
    var cached = ls('cache');
    if (cached && cached.data) {
      S.data = cached.data; render(); afterHoursCheck(); initPush();
      loadData(true);
    } else loadData();
  } else { renderLogin(); loadNames(); }
})();
