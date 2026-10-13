/* ==========================================================
   T'as la ref ? — application (vanilla JS, aucune dépendance)
   Les données viennent de data/*.js via window.TALR_DATA
   Format d'une ref : [citation, source, qui/contexte, année, note?]
   ========================================================== */
(function () {
  "use strict";

  const CATS = (window.TALR_DATA || []).slice();
  const $ = (sel, root = document) => root.querySelector(sel);
  const view = $("#view");
  const PAGE = 40;

  /* ---------- Outils ---------- */
  const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[’'`´]/g, "'").replace(/œ/g, "oe").replace(/æ/g, "ae");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const store = {
    get(k, d) { try { const v = localStorage.getItem("talr:" + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem("talr:" + k, JSON.stringify(v)); } catch { /* stockage indisponible */ } },
  };

  /* ---------- Index ---------- */
  const ALL = [];
  const BY_ID = new Map();
  CATS.forEach((cat) => {
    cat.items = [];
    cat.refs.forEach(([q, s, w, y, n, kw, gimg, gpage]) => {
      const id = cat.id + "-" + hash(q + "|" + s);
      const raw = q;
      const moment = q.startsWith("📍");
      if (moment) q = q.replace(/^📍\s*/, "");
      const ref = { id, q, s, w: w || "", y: y || "", n: n || "", kw: kw || "", gimg: gimg || "", gpage: gpage || "", raw, cat, moment, vf: /\(VF\)/.test(s) };
      ref.hay = norm([q, s, w, y, n, cat.nom].join(" "));
      ALL.push(ref); cat.items.push(ref); BY_ID.set(id, ref);
    });
  });

  /* ---------- Favoris permanents ----------
     - localStorage + demande de stockage persistant au navigateur
     - anciens identifiants (refs corrigées) retrouvés via data/aliases.js
     - citation + source mémorisées : une ref corrigée plus tard est retrouvée par ressemblance
     - un favori introuvable n'est jamais effacé (il pourra être retrouvé par une version future) */
  const ALIAS = window.TALR_ALIASES || {};
  const srcKey = (t) => norm(String(t).replace(/\s*\(VF\)/g, "").split(" — ")[0]);
  const wset = (t) => new Set(norm(t).split(/[^a-z0-9]+/).filter((x) => x.length > 2));
  function findById(id) { let k = id, n = 0; while (!BY_ID.has(k) && ALIAS[k] && n++ < 20) k = ALIAS[k]; return BY_ID.has(k) ? k : null; }
  function findByText(m) {
    const cat = CATS.find((c) => c.id === m.c); if (!cat || !m.q) return null;
    const qw = wset(m.q); let best = null, bestSc = 0;
    for (const r of cat.items) {
      const rw = wset(r.q), inter = [...qw].filter((x) => rw.has(x)).length;
      const sc = inter / Math.max(1, new Set([...qw, ...rw]).size) + (srcKey(r.s) === srcKey(m.s) ? 0.3 : 0);
      if (sc > bestSc) { bestSc = sc; best = r; }
    }
    return best && bestSc >= 0.55 ? best.id : null;
  }
  let favMeta = store.get("favsMeta", {});
  const favOrphans = [];
  let favs = new Set();
  for (const id of store.get("favs", [])) {
    const found = findById(id) || (favMeta[id] && findByText(favMeta[id]));
    if (found) { favs.add(found); if (found !== id && favMeta[id]) { favMeta[found] = favMeta[id]; delete favMeta[id]; } }
    else favOrphans.push(id); // gardé précieusement, pas jeté
  }
  const metaOf = (r) => ({ c: r.cat.id, s: r.s, q: r.q.slice(0, 160) });
  favs.forEach((id) => { if (!favMeta[id]) favMeta[id] = metaOf(BY_ID.get(id)); });
  function saveFavs() {
    store.set("favs", [...favs, ...favOrphans]);
    const keep = {}; [...favs, ...favOrphans].forEach((id) => { if (favMeta[id]) keep[id] = favMeta[id]; });
    favMeta = keep; store.set("favsMeta", favMeta);
  }
  function askPersistence() {
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persisted().then((p) => p || navigator.storage.persist()).catch(() => {}); } catch { /* non pris en charge */ }
  }
  saveFavs(); if (favs.size) askPersistence();

  /* ---------- Rendu d'une carte ---------- */
  function highlight(text, terms) {
    const safe = esc(text);
    if (!terms || !terms.length) return safe;
    // surligne en ignorant les accents : on travaille caractère par caractère sur la version normalisée
    const n = norm(text);
    const marks = new Array(text.length).fill(false);
    terms.forEach((t) => { if (!t) return; let i = n.indexOf(t); while (i !== -1) { for (let k = i; k < i + t.length; k++) marks[k] = true; i = n.indexOf(t, i + t.length); } });
    if (n.length !== text.length) return safe; // sécurité : pas de surlignage si la longueur diffère
    let out = "", open = false;
    for (let i = 0; i < text.length; i++) {
      if (marks[i] && !open) { out += "<mark>"; open = true; }
      if (!marks[i] && open) { out += "</mark>"; open = false; }
      out += esc(text[i]);
    }
    return out + (open ? "</mark>" : "");
  }

  /* ---------- GIF automatiques (API Giphy, clé gratuite fournie par l'utilisatrice) ---------- */
  let gifKw = store.get("gifKw", {}); // id de ref -> mot-clé choisi par l'utilisatrice
  const gifQuery = (r) => gifKw[r.id] || r.kw || r.s + " " + r.q;
  const gifUrl = (r) => "https://giphy.com/search/" + norm(gifQuery(r)).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const DEFAULT_GIPHY_KEY = "2rhW2hqIT7vn0OW6xjh3gb4VqC1ix9X3"; // clé de l'app (remplaçable dans la catégorie GIF)
  let giphyKey = store.get("giphyKey", "") || DEFAULT_GIPHY_KEY;
  let keyFormOpen = false;
  let gifCache = store.get("gifCache", {}); // requête -> [{ img, page, title }]
  const gifState = new Map(); // id de ref -> { list, i }

  async function giphySearch(q, limit = 10) {
    const k = norm(q) + "|" + limit;
    if (gifCache[k]) return gifCache[k];
    const url = `https://api.giphy.com/v1/gifs/search?api_key=${encodeURIComponent(giphyKey)}&q=${encodeURIComponent(q)}&limit=${limit}&rating=pg-13&lang=fr`;
    const res = await fetch(url);
    if (res.status === 401 || res.status === 403) throw new Error("key");
    if (res.status === 429) throw new Error("quota");
    if (!res.ok) throw new Error("http");
    const json = await res.json();
    const list = (json.data || []).map((g) => {
      const im = (g.images && g.images.fixed_width) || {};
      return { img: im.webp || im.url, page: g.url, title: g.title || "" };
    }).filter((x) => x.img);
    if (Object.keys(gifCache).length > 400) gifCache = {}; // garde le stockage léger
    gifCache[k] = list; store.set("gifCache", gifCache);
    return list;
  }

  const gifErr = (err) => ({
    key: "🔑 Clé Giphy refusée — vérifie-la dans la catégorie GIF.",
    quota: "⏳ Trop de recherches d'un coup, réessaie dans un moment.",
  }[err && err.message] || "📡 Impossible de charger le GIF (connexion ?)");

  async function loadGif(box, step = 0) {
    const r = BY_ID.get(box.dataset.gif); if (!r) return;
    let st = gifState.get(r.id);
    try {
      if (!st && !r.gimg && !gifKw[r.id]) {   // pas de GIF choisi : aucun appel automatique à l'API
        box.innerHTML = `<div class="gif-skel"><a href="${esc(gifUrl(r))}" target="_blank" rel="noopener">🎞️ Voir le GIF sur Giphy</a></div>`;
        return;
      }
      if (!st) {
        // GIF choisi à la main : affiché sans appel à l'API (sauf si un autre mot-clé a été demandé)
        st = r.gimg && !gifKw[r.id]
          ? { list: [{ img: r.gimg, page: r.gpage, title: r.q }], i: 0, pinned: true }
          : { list: await giphySearch(gifQuery(r)), i: 0 };
        gifState.set(r.id, st);
      }
      if (step && st.pinned) {           // 🔄 sur un GIF fixé : on va chercher des alternatives
        const more = (await giphySearch(gifQuery(r))).filter((g) => g.img !== r.gimg);
        st.list = st.list.concat(more); st.pinned = false;
      }
      if (!st.list.length) { box.innerHTML = `<div class="gif-skel">Aucun GIF trouvé 🥺</div>`; return; }
      st.i = (st.i + step + st.list.length) % st.list.length;
      const g = st.list[st.i];
      box.innerHTML = `<img src="${esc(g.img)}" alt="${esc(g.title || r.q)}">` +
        (st.pinned ? `<button class="gif-next" data-act="nextgif" aria-label="Voir d'autres GIF">🔄 autres</button>`
          : st.list.length > 1 ? `<button class="gif-next" data-act="nextgif" aria-label="Un autre GIF">🔄 ${st.i + 1}/${st.list.length}</button>` : "") +
        `<button class="gif-kw" data-act="gifkw" aria-label="Changer le mot-clé du GIF">🔎 ${esc(gifQuery(r))}</button>`;
    } catch (err) {
      if (step && st && st.list.length) { toast(gifErr(err)); return; } // on garde le GIF déjà affiché
      box.innerHTML = `<div class="gif-skel">${gifErr(err)}<br><a href="${esc(gifUrl(r))}" target="_blank" rel="noopener">🎞️ Voir sur Giphy</a></div>`;
    }
  }

  // Chargement paresseux : le GIF se charge quand la carte approche de l'écran
  const gifObserver = "IntersectionObserver" in window
    ? new IntersectionObserver((entries) => entries.forEach((e) => { if (e.isIntersecting) { gifObserver.unobserve(e.target); loadGif(e.target); } }), { rootMargin: "300px" })
    : null;
  function observeGifs(root) {
    if (!giphyKey) return;
    root.querySelectorAll(".gif-box:not([data-on])").forEach((b) => { b.dataset.on = "1"; gifObserver ? gifObserver.observe(b) : loadGif(b); });
  }

  async function shareLink(url, text) {
    if (navigator.share) { try { await navigator.share({ title: "T'as la ref ?", text, url }); return; } catch { return; } }
    toast((await copyText(url)) ? "GIF copié. Envoie-le, ils vont comprendre 💅" : "Impossible de copier 🙄");
  }

  /* ---------- « En savoir + » : contexte et liens de recherche vers des sources légales ---------- */
  const enc = encodeURIComponent;
  const cleanSrc = (s) => s.replace(/\s*\(VF\)/g, "").split(" — ")[0].replace(/[«»]/g, "").trim();
  const firstWho = (w) => w.split(/[(,—]/)[0].trim();
  const L = {
    wiki: (q) => ["📖", "Wikipédia", `https://fr.wikipedia.org/w/index.php?search=${enc(q)}`],
    jw: (q) => ["🍿", "Où le regarder légalement", `https://www.justwatch.com/fr/recherche?q=${enc(q)}`],
    yt: (q, label = "YouTube") => ["▶️", label, `https://www.youtube.com/results?search_query=${enc(q)}`],
    ina: (q) => ["📼", "Archives INA", `https://www.ina.fr/recherche?q=${enc(q)}`],
    dz: (q) => ["🎧", "Deezer", `https://www.deezer.com/search/${enc(q)}`],
    sp: (q) => ["💚", "Spotify", `https://open.spotify.com/search/${enc(q)}`],
  };
  const SLANG = /^(Expression|Langage SMS|Verlan|TikTok|Twitter|Twitter \/ X|Mème|Cours de récré \/ TikTok|Confinement|Blague internet|Skyblog.*|MSN Messenger|Les chaînes de mails|YouTube beauté)$/;
  function resources(r) {
    const src = cleanSrc(r.s), who = firstWho(r.w), y = r.y ? " " + r.y : "";
    switch (r.cat.id) {
      case "cinema": return [L.jw(src), L.wiki(src), L.yt(src + " bande annonce", "Bande-annonce")];
      case "series": return r.vf ? [L.jw(src), L.wiki(src)] : [L.ina(src), L.yt(src), L.wiki(src)];
      case "chansons": { const q = `${r.w} ${r.s}`; return [L.dz(q), L.sp(q), L.yt(q + " clip officiel", "Clip officiel"), L.wiki(r.w)]; }
      case "tele": return [L.ina(`${src} ${who}`.trim()), L.wiki(`${src}${y}`)];
      case "internet": return SLANG.test(r.s) ? [] : [L.yt(`${who} ${src}`), L.wiki(who)];
      case "pubs": return [L.ina(`publicité ${src}`), L.yt(`pub ${src}${y}`, "Revoir la pub")];
      case "dessins-animes": return [L.jw(src), L.wiki(src)];
      case "gifs": return [["🎞️", "Giphy", gifUrl(r)], L.wiki(src)];
      default: return [L.wiki(src)];
    }
  }
  function contextText(r) {
    if (r.moment) return "";
    const src = cleanSrc(r.s), y = r.y ? ` (${r.y})` : "", w = r.w ? ` — ${r.w}` : "";
    switch (r.cat.id) {
      case "cinema": return `Tirée du film « ${src} »${y}${w}.`;
      case "series": return `Tirée de « ${src} »${y}${w}.`;
      case "chansons": return `Le passage culte de « ${r.s} », ${r.w}${y}.`;
      case "tele": return `Un moment de télé : ${src}${y}${w}.`;
      case "pubs": return `Le slogan publicitaire de ${src}${y}${r.w && r.w !== "Slogan" ? ` — ${r.w}` : ""}.`;
      case "internet": return SLANG.test(r.s) ? `Le sens : ${r.w}.` : `Né sur internet ou devenu viral : ${src}${y}${w}.`;
      case "dessins-animes": return `Tirée de « ${src} »${y}${w}.`;
      default: return `${src}${y}${w}.`;
    }
  }
  function infoHTML(r) {
    const links = resources(r);
    const ctx = contextText(r);
    return `<div class="more-info" hidden>
      ${ctx ? `<h4>☕ Le contexte</h4><p>${esc(ctx)}</p>` : ""}
      ${links.length ? `<h4>🔗 Va stalker, mais légalement — on a des principes 💅</h4><div class="links">${links.map(([i, l, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener">${i} ${esc(l)}</a>`).join("")}</div>
      <p class="legal">Liens de recherche vers des services officiels et légaux.</p>` : ""}
      <p class="credit legal"></p>
    </div>`;
  }

  /* ---------- Images libres de droits (Wikipédia / Wikimedia Commons) ---------- */
  const IMGS = window.TALR_IMAGES || {};
  const REFIMG = window.TALR_REFIMG || {}; // image de repli propre à une carte (acteur·rice, artiste…) // pré-calculé (data/images.js) : requête -> { src, file, title, artist, license, url } ou null
  let wikiCache = store.get("wikiImg", {}); // repli : refs ajoutées après le pré-calcul
  let wikiQueue = Promise.resolve();       // une requête à la fois, espacées, pour respecter Wikimedia
  const politely = (fn) => (wikiQueue = wikiQueue.then(() => new Promise((ok) => setTimeout(ok, 500))).then(fn, fn));
  const isPerson = (w) => /^[A-ZÀ-Ý][\p{L}'-]+(\s+(de\s+|d'|De\s+)?[A-ZÀ-Ý][\p{L}'-]+)+$/u.test(w);
  function wikiQuery(r) {
    const src = cleanSrc(r.s), who = firstWho(r.w);
    switch (r.cat.id) {
      case "cinema": return `${src} film`;
      case "series": return r.vf ? `${src} série télévisée` : src;
      case "chansons": return r.w.split(/\s*[&,]\s*|\s+\(/)[0];
      case "tele": case "internet": return SLANG.test(r.s) ? "" : isPerson(who) ? who : src;
      case "pubs": return src.split(/\s*\(/)[0];
      case "dessins-animes": return src;
      default: return ""; // les GIF ont déjà leur image
    }
  }
  const words = (t) => norm(t).split(/[^a-z0-9]+/).filter((w) => w.length > 3 && !["film", "serie", "televisee"].includes(w));
  async function wikiImage(q) {
    if (q in IMGS) return IMGS[q];
    if (q in wikiCache) return wikiCache[q];
    return politely(() => wikiFetch(q));
  }
  async function wikiFetch(q) {
    const url = `https://fr.wikipedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrlimit=1&gsrnamespace=0&gsrsearch=${enc(q)}&prop=pageimages&piprop=thumbnail|name&pithumbsize=240`;
    const json = await (await fetch(url)).json();
    const page = json.query && Object.values(json.query.pages)[0];
    // garde-fou : le titre de la page doit partager un mot avec la recherche
    const ok = page && page.thumbnail && words(q).some((w) => norm(page.title).includes(w));
    const res = ok ? { src: page.thumbnail.source, file: page.pageimage, title: page.title } : null;
    if (Object.keys(wikiCache).length > 600) wikiCache = {};
    wikiCache[q] = res; store.set("wikiImg", wikiCache);
    return res;
  }
  // Sticker emoji quand aucune image libre n'existe
  const EMO_CAT = { cinema: ["🎬", "🍿", "🎞️"], series: ["📺", "🍿", "😂"], chansons: ["🎤", "🎶", "💿"], tele: ["📡", "📺", "🎙️"],
    internet: ["💅", "🙄", "😏", "💁", "🔥", "😭", "🤌", "💬"], pubs: ["📢", "🛍️", "✨"], "dessins-animes": ["🧸", "✨", "🌈"] };
  function emojiFor(r) { const l = EMO_CAT[r.cat.id] || ["✨"]; let h = 0; for (const ch of r.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return l[h % l.length]; }
  async function loadWikiImg(card) {
    const r = BY_ID.get(card.dataset.id); if (!r || r.cat.gif) return;
    const q = wikiQuery(r);
    let img = REFIMG[r.raw + "|" + r.s] || null;
    if (!img && q) { try { img = await wikiImage(q); } catch { img = null; } }
    if (!img) {
      card.classList.add("has-img");
      card.insertAdjacentHTML("afterbegin", `<figure class="ref-img emoji" aria-hidden="true"><span>${emojiFor(r)}</span></figure>`);
      return;
    }
    card.classList.add("has-img"); card._img = img;
    card.insertAdjacentHTML("afterbegin", `<figure class="ref-img"><img src="${esc(img.src)}" alt="${esc(img.title)}" loading="lazy"></figure>`);
    card.dataset.wfile = img.file || ""; card.dataset.wq = q;
  }
  async function loadCredit(card) {
    const file = card.dataset.wfile, box = card.querySelector(".credit");
    if (!file || !box || box.dataset.done) return;
    box.dataset.done = "1";
    const pre = card._img || IMGS[card.dataset.wq];
    if (pre && pre.url) {
      box.innerHTML = `📷 Photo : ${esc(pre.artist || "auteur·rice inconnu·e")} · ${esc(pre.license || "licence libre")} — <a href="${esc(pre.url)}" target="_blank" rel="noopener">Wikimedia Commons</a>`;
      return;
    }
    try {
      const url = `https://fr.wikipedia.org/w/api.php?action=query&format=json&origin=*&titles=${enc("Fichier:" + file)}&prop=imageinfo&iiprop=extmetadata|url`;
      const json = await (await fetch(url)).json();
      const info = Object.values(json.query.pages)[0].imageinfo[0];
      const meta = info.extmetadata || {};
      const strip = (h) => String(h || "").replace(/<[^>]+>/g, "").trim();
      const artist = strip(meta.Artist && meta.Artist.value) || "auteur·rice inconnu·e";
      const lic = strip(meta.LicenseShortName && meta.LicenseShortName.value) || "licence libre";
      box.innerHTML = `📷 Photo : ${esc(artist.slice(0, 80))} · ${esc(lic)} — <a href="${esc(info.descriptionurl)}" target="_blank" rel="noopener">Wikimedia Commons</a>`;
    } catch { box.textContent = "📷 Image libre issue de Wikimedia Commons."; }
  }
  const imgObserver = "IntersectionObserver" in window
    ? new IntersectionObserver((entries) => entries.forEach((e) => { if (e.isIntersecting) { imgObserver.unobserve(e.target); loadWikiImg(e.target); } }), { rootMargin: "400px" })
    : null;
  function observeImgs(root) {
    root.querySelectorAll(".ref:not([data-wi])").forEach((c) => { c.dataset.wi = "1"; imgObserver ? imgObserver.observe(c) : loadWikiImg(c); });
  }

  // GIF fixé : inséré directement (chargement différé natif), sans attendre ni appeler l'API
  function gifBoxHTML(r) {
    if (r.gimg && !gifKw[r.id]) {
      return `<div class="gif-box" data-gif="${r.id}" data-on="1"><img src="${esc(r.gimg)}" alt="${esc(r.q)}" loading="lazy">` +
        `<button class="gif-next" data-act="nextgif" aria-label="Voir d'autres GIF">🔄 autres</button>` +
        (r.cat.gif ? `<button class="gif-kw" data-act="gifkw" aria-label="Changer le mot-clé du GIF">🔎 ${esc(gifQuery(r))}</button>` : "") + `</div>`;
    }
    return r.cat.gif && giphyKey ? `<div class="gif-box" data-gif="${r.id}"><div class="gif-skel">✨ Chargement du GIF…</div></div>` : "";
  }

  const nb = (h) => String(h).replace(/ ([!?;:»])/g, "\u00A0$1").replace(/« /g, "«\u00A0");

  function cardHTML(r, opts = {}) {
    const t = opts.terms;
    const on = favs.has(r.id);
    const catBadge = opts.showCat ? `<a class="badge" href="#/cat/${r.cat.id}">${r.cat.emoji} ${esc(r.cat.nom)}</a>` : "";
    const vf = r.vf ? `<span class="badge vf">VF</span>` : "";
    const year = r.y ? ` · ${esc(r.y)}` : "";
    const mom = r.moment ? `<span class="badge moment-badge">${r.cat.id === "chansons" ? "🎶 Tube culte" : "📍 Moment culte"}</span>` : "";
    return `<article class="ref${r.moment ? " moment" : ""}" data-id="${r.id}">
      <div class="badges">${catBadge}${vf}${mom}</div>
      <blockquote>${nb(highlight(r.q, t))}</blockquote>
      <div class="meta"><strong>${highlight(r.s, t)}</strong>${year}${r.w ? `<br>${highlight(r.w, t)}` : ""}</div>
      ${r.n ? `<div class="note">${r.cat.gif ? "📲 " : "💡 "}${nb(highlight(r.n, t))}</div>` : ""}
      ${gifBoxHTML(r)}
      <div class="actions">
        <button class="act heart ${on ? "on" : ""}" data-act="fav" aria-pressed="${on}" aria-label="${on ? "Retirer des favoris" : "Ajouter aux favoris"}"><span class="h">${on ? "💖" : "🤍"}</span>${on ? "Adorée" : "J'adore"}</button>
        ${r.cat.gif
          ? (giphyKey
            ? `<button class="act" data-act="sharegif" aria-label="Envoyer ce GIF">💅 Balance le GIF</button>`
            : `<a class="act" href="${gifUrl(r)}" target="_blank" rel="noopener" aria-label="Voir le GIF sur Giphy">🎞️ Voir le GIF</a>`)
          : `<button class="act" data-act="copy" aria-label="Copier la référence">📋 Copier</button>
        <button class="act" data-act="share" aria-label="Partager la référence">💌 Partager</button>`}
        <button class="act info" data-act="info" aria-expanded="false" aria-label="En savoir plus sur cette référence">☕ Le tea</button>
      </div>
      ${infoHTML(r)}
    </article>`;
  }

  // Liste paginée
  function renderList(container, refs, opts = {}) {
    let shown = 0;
    const list = document.createElement("div");
    list.className = "list";
    container.appendChild(list);
    const moreBtn = document.createElement("button");
    moreBtn.className = "more";
    const step = () => {
      const next = refs.slice(shown, shown + PAGE);
      list.insertAdjacentHTML("beforeend", next.map((r) => cardHTML(r, opts)).join(""));
      observeGifs(list); observeImgs(list);
      shown += next.length;
      if (shown < refs.length) { moreBtn.textContent = `Encore des refs, j'en veux ✨ (${refs.length - shown})`; if (!moreBtn.isConnected) container.appendChild(moreBtn); }
      else moreBtn.remove();
    };
    moreBtn.addEventListener("click", step);
    step();
  }

  /* ---------- Le ton de la maison 💅 ---------- */
  const SASS_TAGS = [
    "Si t'as pas la ref, c'est pas grave. Enfin… un peu quand même 💅",
    "On ne juge pas. On constate. 💁",
    "Ici, on cite, on brille, on passe à autre chose ✨",
    "Avoir la ref, c'est un mode de vie 👑",
    "Ta culture G, mais en mieux habillée 💋",
    "Sois la personne qui a toujours la bonne réplique 💅",
    "Une app de refs et t'as pas la ref ?! Allô ?! 📞",
    "Les vrai·e·s savent. Les autres apprennent ici 💖",
    "Trop de refs ? Ça n'existe pas, chéri·e 💎",
    "Répartie : 100 %. Modestie : en option 💅",
    "On est pas méchant·e·s, on est lucides 🙄",
    "Ta répartie arrive en retard ? On l'a mise en cache 💾",
    "Interdit aux gens qui disent « c'est quoi la ref ? » 🚫",
    "Tu scrolles, on brille. Chacun son rôle 💅",
  ];
  const SASS_OK = ["Évidemment. 💅", "Trop facile pour toi, Majesté 👑", "Bien sûr que t'as la ref 💁", "Validé. Next. ✨", "On n'en attendait pas moins 💎", "Icône. Point. 👑"];
  const SASS_KO = ["Allô ? Non mais allô ? 📞", "Sérieusement ?! 🙄", "On va faire comme si on n'avait rien vu 🫣", "Chéri·e… non. 💔", "Ça fait mal, mais c'est pour ton bien 💅", "Gênance. Totale. 😬"];
  const SASS_FAV = ["Ajoutée. Évidemment, t'as du goût 💅", "Dans tes chouchoutes. Bon choix 💖", "Validée par toi, donc validée tout court ✨", "Ajoutée. Elle est à toi maintenant 💋", "Goût impeccable, comme d'hab 💎"];
  const SASS_COPY = ["Copiée. Va briller ailleurs maintenant 💋", "Copiée. Balance-la au bon moment, hein 💅", "Dans ton presse-papier. Fais-en bon usage 😏"];
  const SASS_SEARCH = [
    "Balance ta ref, on juge pas… enfin si 💅",
    "Tape « blanquette », on sait que t'en meurs d'envie",
    "Un film, un·e artiste, une pub… vas-y, on attend 🙄",
    "Cherche, et tu trouveras (peut-être) 💁",
    "« Allô », « shampooing »… tu connais la suite 📞",
  ];
  const TRENDS = ["blanquette", "allô", "Kaamelott", "Afida", "Audiard", "Piaf", "Shrek", "Macron", "Goldman", "OSS 117"];
  const CAT_SASS = {
    cinema: "Pour celles et ceux qui citent Audiard au brunch 🥂",
    series: "Le binge-watching, mais avec de la répartie 📺",
    chansons: "Interdiction de chanter faux. On t'entend d'ici 🎤",
    tele: "La télé, la vraie. Celle qui t'a élevé·e 📡",
    internet: "Si t'as pas eu de Skyblog, on ne peut rien pour toi 💻",
    pubs: "Des slogans plus mémorables que ton code PIN 📢",
    "dessins-animes": "Ton enfance, en version qui claque 🧸",
    gifs: "Pour répondre sans écrire un mot. La classe 🎞️",
  };

  /* ---------- Vues ---------- */
  function refOfTheDay() {
    const d = new Date();
    const seed = d.getFullYear() * 1000 + Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 864e5);
    return ALL[(seed * 7919) % ALL.length];
  }

  function catTile(c, i) {
    return `<a class="cat" href="#/cat/${c.id}" style="--c:${c.couleur};--d:${(i * 0.6).toFixed(1)}s">
      <span class="emo">${c.emoji}</span>
      <div><h3>${esc(c.nom)}</h3><p>${c.items.length} refs</p></div>
    </a>`;
  }

  function viewHome() {
    const r = refOfTheDay();
    view.innerHTML = `
      <p class="sass">${pick(SASS_TAGS)}</p>
      <section class="hero">
        <span class="badge">🌟 La ref du jour — à placer avant midi</span>
        <blockquote${r.moment ? ' class="moment-q"' : ""}>${nb(esc(r.q))}</blockquote>
        <div class="meta"><strong style="color:#fff">${esc(r.s)}</strong>${r.y ? " · " + esc(r.y) : ""}${r.w ? "<br>" + esc(r.w) : ""}</div>
        <div class="actions" data-id="${r.id}">
          <button class="act heart ${favs.has(r.id) ? "on" : ""}" data-act="fav"><span class="h">${favs.has(r.id) ? "💖" : "🤍"}</span>${favs.has(r.id) ? "Adorée" : "J'adore"}</button>
          <button class="act" data-act="share">💌 Partager</button>
        </div>
      </section>
      <div class="stats">
        <div class="stat"><b>${ALL.length}</b><span>refs (rien que ça)</span></div>
        <div class="stat"><b>${CATS.length}</b><span>catégories</span></div>
        <div class="stat"><b>${favs.size}</b><span>chouchoutes</span></div>
      </div>
      <div class="h-section"><h2>Choisis ton poison 💅</h2><small><a href="#/explore" style="color:#fff">tout voir (si t'oses)</a></small></div>
      <div class="cats">${CATS.map(catTile).join("")}
        <a class="cat wide" href="#/quiz" style="--c:linear-gradient(135deg,#b620e0,#ff1493)"><span class="emo">🎯</span><div><h3>Quiz : t'as vraiment la ref ?</h3><p>10 questions pour prouver que tu règnes sur les refs 👑</p></div></a>
      </div>
      <div class="h-section"><h2>Les refs que t'es censé·e connaître 🙄</h2><small><button class="linkbtn repick" id="repick" type="button">🔄 repioche</button></small></div>
      <div id="picks"></div>
      <p class="footer-note">Fait avec 💖, des paillettes et zéro modestie</p>`;
    renderList($("#picks"), shuffle(ALL).slice(0, 6), { showCat: true });
    $("#repick").addEventListener("click", (e) => {
      burst(e.clientX, e.clientY); const box = $("#picks"); box.innerHTML = "";
      renderList(box, shuffle(ALL).slice(0, 6), { showCat: true }); toast(pick(["Nouvelle fournée, servie chaude 🔥", "Tiens, des refs fraîches 💅", "Allez, encore une chance 🙄"]));
    });
  }

  function viewExplore() {
    view.innerHTML = `
      <p class="lead">Fais ton choix, on n'a pas toute la journée 💅</p>
      <div class="trend"><span>🔥 Les gens de goût cherchent :</span>${TRENDS.map((t) => `<a class="chip" href="#/search/${encodeURIComponent(t)}">${esc(t)}</a>`).join("")}</div>
      <div class="cats">${CATS.map(catTile).join("")}</div>
      <div class="h-section"><h2>Toutes les refs, rien que ça</h2><small>${ALL.length}</small></div>
      <div id="all"></div>`;
    renderList($("#all"), shuffle(ALL), { showCat: true });
  }

  const SORTS = {
    mix: { label: "🔀 Mélangé", fn: (a) => shuffle(a) },
    az: { label: "🔤 A → Z", fn: (a) => a.slice().sort((x, y) => x.s.localeCompare(y.s, "fr") || x.q.localeCompare(y.q, "fr")) },
    new: { label: "🆕 Récentes", fn: (a) => a.slice().sort((x, y) => (+y.y || 0) - (+x.y || 0)) },
    old: { label: "📼 Vintage", fn: (a) => a.slice().sort((x, y) => (+x.y || 9999) - (+y.y || 9999)) },
  };

  function viewCat(id) {
    const c = CATS.find((x) => x.id === id);
    if (!c) return viewNotFound();
    const hasVF = c.items.some((r) => r.vf);
    let sort = store.get("sort", "mix");
    let filter = "all";
    view.innerHTML = `
      <section class="cat-head" style="--c:${c.couleur}">
        <span class="emo">${c.emoji}</span>
        <h1>${esc(c.nom)}</h1>
        <p>${esc(c.desc)} · <b>${c.items.length} refs</b></p>
        ${CAT_SASS[c.id] ? `<p class="cat-sass">${CAT_SASS[c.id]}</p>` : ""}
      </section>
      <div class="toolbar" id="tb">
        ${Object.entries(SORTS).map(([k, v]) => `<button class="chip" data-sort="${k}">${v.label}</button>`).join("")}
        ${hasVF ? `<button class="chip" data-filter="fr">🇫🇷 VO française</button><button class="chip" data-filter="vf">🎙️ VF cultes</button>` : ""}
        ${c.gif ? "" : `<a class="chip" href="#/quiz/${c.id}" style="text-decoration:none">🎯 Quiz</a>`}
      </div>
      ${c.gif ? gifPanelHTML() : ""}
      <div id="catList"></div>`;
    if (c.gif) bindGifPanel();
    const draw = () => {
      $("#tb").querySelectorAll("[data-sort]").forEach((b) => b.classList.toggle("on", b.dataset.sort === sort));
      $("#tb").querySelectorAll("[data-filter]").forEach((b) => b.classList.toggle("on", b.dataset.filter === filter));
      let items = c.items;
      if (filter === "vf") items = items.filter((r) => r.vf);
      if (filter === "fr") items = items.filter((r) => !r.vf);
      const box = $("#catList"); box.innerHTML = "";
      renderList(box, SORTS[sort].fn(items));
    };
    $("#tb").addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      if (b.dataset.sort) { sort = b.dataset.sort; store.set("sort", sort); }
      if (b.dataset.filter) filter = filter === b.dataset.filter ? "all" : b.dataset.filter;
      draw();
    });
    draw();
  }

  /* Encart GIF : activation de la clé + recherche libre */
  function gifPanelHTML() {
    if (!giphyKey || keyFormOpen) return `<section class="gif-panel">
      <h3>🔑 Active les GIF automatiques</h3>
      <p>Pour afficher les GIF directement dans l'app, il faut une clé gratuite Giphy (2 minutes) :<br>
      1. Va sur <a href="https://developers.giphy.com/dashboard/" target="_blank" rel="noopener">developers.giphy.com</a> et crée un compte<br>
      2. « Create an App » → choisis <b>API</b><br>
      3. Copie la clé (« API Key ») et colle-la ici 👇</p>
      <form id="keyForm" class="gif-form"><input id="keyIn" placeholder="Ta clé API Giphy" autocomplete="off" spellcheck="false" aria-label="Clé API Giphy"><button class="btn" type="submit">Activer ✨</button></form>
    </section>`;
    return `<section class="gif-panel">
      <form id="gifSearch" class="gif-form" role="search"><input id="gifIn" placeholder="Le GIF parfait pour clasher, vas-y…" autocomplete="off" aria-label="Rechercher un GIF"><button class="btn" type="submit">🔍</button></form>
      <div id="gifGrid" class="gif-grid"></div>
      <p class="powered">Powered by GIPHY · <button class="linkbtn" id="keyEdit" type="button">changer la clé</button></p>
    </section>`;
  }

  function bindGifPanel() {
    const keyForm = $("#keyForm");
    if (keyForm) keyForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const k = $("#keyIn").value.trim(); if (!k) return;
      giphyKey = k; gifCache = {};
      try { await giphySearch("paillettes", 1); store.set("giphyKey", k); keyFormOpen = false; toast("Clé validée. Les GIF sont à toi 💅"); route(); }
      catch (err) { giphyKey = store.get("giphyKey", "") || DEFAULT_GIPHY_KEY; toast(err.message === "key" ? "Clé refusée par Giphy 🔑" : "Vérification impossible (connexion ?)"); }
    });
    const edit = $("#keyEdit");
    if (edit) edit.addEventListener("click", () => { keyFormOpen = true; route(); });
    const form = $("#gifSearch");
    if (form) form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const q = $("#gifIn").value.trim(); if (!q) return;
      const grid = $("#gifGrid"); grid.innerHTML = `<div class="gif-skel">✨ Recherche…</div>`;
      try {
        const list = await giphySearch(q, 12);
        grid.innerHTML = list.length
          ? list.map((g) => `<button class="gif-pick" data-page="${esc(g.page)}" aria-label="Envoyer ce GIF"><img src="${esc(g.img)}" alt="${esc(g.title)}" loading="lazy"></button>`).join("")
          : `<div class="gif-skel">Aucun GIF trouvé 🥺</div>`;
      } catch (err) { grid.innerHTML = `<div class="gif-skel">${gifErr(err)}</div>`; }
    });
  }

  function search(q) {
    const terms = norm(q).split(/\s+/).filter((t) => t.length > 0);
    if (!terms.length) return { terms, res: [] };
    const res = [];
    for (const r of ALL) {
      if (!terms.every((t) => r.hay.includes(t))) continue;
      // score : citation > source > le reste
      const nq = norm(r.q), ns = norm(r.s);
      let score = 0;
      terms.forEach((t) => { if (nq.includes(t)) score += 3; if (ns.includes(t)) score += 2; if (nq.startsWith(t)) score += 1; });
      res.push([score, r]);
    }
    res.sort((a, b) => b[0] - a[0]);
    return { terms, res: res.map((x) => x[1]) };
  }

  function viewSearch(q) {
    const { terms, res } = search(q);
    if (!terms.length) return viewExplore();
    view.innerHTML = `<div class="h-section" style="margin-top:4px"><h2>« ${esc(q)} »</h2><small>${res.length} ref${res.length > 1 ? "s" : ""}</small></div><div id="sr"></div>`;
    if (!res.length) {
      $("#sr").innerHTML = `<div class="empty"><span class="big">🥺</span>Zéro résultat. Soit t'as inventé cette ref, soit t'as un temps d'avance 💁‍♀️<br>Essaie un autre mot, un artiste ou un titre.</div>`;
      return;
    }
    renderList($("#sr"), res, { showCat: true, terms });
  }

  function viewFavs() {
    const list = ALL.filter((r) => favs.has(r.id));
    view.innerHTML = `<figure class="mascot">
        <img src="img/chouchou.png" alt="Le gardien des chouchoutes, cœur avec les mains" onerror="this.closest('figure').remove()">
        <figcaption>${list.length ? "Tes chouchoutes sont sous ma protection. Personne n'y touche 💖" : "Rien à protéger ? Mets-moi du travail, chéri·e 😜"}</figcaption>
      </figure>
      <div class="h-section" style="margin-top:4px"><h2>Mes chouchoutes 💖</h2><small>${list.length}</small></div><div id="fv"></div>`;
    if (!list.length) {
      $("#fv").innerHTML = `<div class="empty"><span class="big">🤍</span>Aucune chouchoute ? T'as des standards, on respecte 💅<br>Appuie sur <b>J'adore</b> sous une ref pour la garder ici.</div>`;
      return;
    }
    renderList($("#fv"), list, { showCat: true });
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) && !navigator.standalone;
    $("#fv").insertAdjacentHTML("afterend", `<div class="backup">
      <button class="btn" id="backupBtn" type="button">💾 Lien de sauvegarde</button>
      <p>Au cas où ton navigateur ferait le ménage : garde ce lien, il ressuscite tes chouchoutes partout 💅${ios ? "<br>📲 Sur iPhone, ajoute l'app à l'écran d'accueil : Safari ne pourra plus jamais les effacer." : ""}</p>
    </div>`);
    $("#backupBtn").addEventListener("click", async () => {
      const url = `${location.origin}${location.pathname}#/import/${[...favs].join(".")}`;
      if (navigator.share) { try { await navigator.share({ title: "Mes chouchoutes — T'as la ref ?", url }); return; } catch { return; } }
      toast((await copyText(url)) ? "Lien copié. Garde-le précieusement 💾" : "Impossible de copier 🙄");
    });
  }

  function importFavs(arg) {
    let n = 0;
    String(arg || "").split(".").forEach((id) => { const f = findById(id); if (f && !favs.has(f)) { favs.add(f); favMeta[f] = metaOf(BY_ID.get(f)); n++; } });
    saveFavs(); if (n) askPersistence();
    toast(n ? `${n} chouchoute${n > 1 ? "s" : ""} récupérée${n > 1 ? "s" : ""} 💖` : "Rien de nouveau à récupérer 💅");
    history.replaceState(null, "", "#/favs"); viewFavs();
  }

  function viewRef(id) {
    const r = BY_ID.get(id) || pick(ALL);
    view.innerHTML = `<div class="h-section" style="margin-top:4px"><h2>🎲 Le destin a choisi pour toi</h2></div><div id="one"></div>
      <div class="center"><button class="btn" id="again">Une autre, et vite 💅</button></div>`;
    renderList($("#one"), [r], { showCat: true });
    $("#again").addEventListener("click", (e) => { burst(e.clientX, e.clientY); goRandom(); });
  }

  function viewNotFound() {
    view.innerHTML = `<div class="empty"><span class="big">💔</span>Cette page n'existe pas. On fait comme si de rien n'était 💅<br><a class="btn" href="#/">Retour à l'accueil</a></div>`;
  }

  /* ---------- Quiz ---------- */
  const QUIZ_LEN = 10;
  const optionLabel = (r) => (r.cat.id === "chansons" ? r.w : r.s);
  const STOP = new Set(["les", "des", "une", "the", "film", "serie", "televisee", "est", "pas", "que", "qui", "vous", "nous", "pour", "dans", "avec"]);
  const sig = (t) => norm(t).split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !STOP.has(w));
  // une question est jouable si elle ne contient pas déjà la réponse
  function quizWorthy(r) {
    if (r.moment || r.cat.gif || SLANG.test(r.s)) return false;
    const nq = norm(r.q);
    if (r.cat.id === "chansons") return !!r.w && !sig(r.w).some((w) => w.length >= 4 && nq.includes(w));
    const sw = sig(cleanSrc(r.s));
    return !sw.length || !sw.every((w) => nq.includes(w));
  }
  const decoyOK = (x) => !x.moment && !x.cat.gif && !SLANG.test(x.s);

  const rank = (n) => (n == null ? "· jamais tenté, t'as peur ? 👀" : n >= 9 ? "· 👑 icône" : n >= 7 ? "· 💎 solide" : n >= 5 ? "· 💅 ça passe" : "· 📚 à réviser");
  function viewQuizMenu() {
    const best = store.get("best", {});
    view.innerHTML = `
      <section class="hero">
        <span class="badge">🎯 Le grand quiz</span>
        <blockquote>On te balance une réplique, tu retrouves d'où elle vient. ${QUIZ_LEN} questions. Et on te voit si tu triches 👀</blockquote>
      </section>
      <div class="h-section"><h2>Montre-nous ce que t'as 💅</h2></div>
      <div class="quiz-modes">
        <button class="mode" data-q="all"><span class="emo">🌈</span><span>Toutes les catégories<small>Meilleur score : ${best.all ?? "—"}/${QUIZ_LEN} ${rank(best.all)}</small></span></button>
        ${CATS.filter((c) => !c.gif).map((c) => `<button class="mode" data-q="${c.id}"><span class="emo">${c.emoji}</span><span>${esc(c.nom)}<small>Meilleur score : ${best[c.id] ?? "—"}/${QUIZ_LEN} ${rank(best[c.id])}</small></span></button>`).join("")}
      </div>`;
    view.querySelector(".quiz-modes").addEventListener("click", (e) => {
      const b = e.target.closest("[data-q]"); if (b) location.hash = "#/quiz/" + b.dataset.q;
    });
  }

  function viewQuiz(mode) {
    const pool = (mode === "all" ? ALL : (CATS.find((c) => c.id === mode) || {}).items || []).filter(quizWorthy);
    if (!pool || !pool.length) return viewQuizMenu();
    const questions = shuffle(pool).slice(0, QUIZ_LEN).map((r) => {
      const same = r.cat.items.filter(decoyOK); // leurres de la même catégorie, plus crédibles
      const right = optionLabel(r);
      const wrong = [];
      for (const x of shuffle(same).concat(shuffle(ALL.filter((y) => decoyOK(y) && y.cat.id === r.cat.id)))) {
        const l = optionLabel(x);
        if (l && norm(l) !== norm(right) && (r.cat.id === "chansons" || norm(x.s) !== norm(r.s)) && !wrong.includes(l)) wrong.push(l);
        if (wrong.length === 3) break;
      }
      return { r, right, options: shuffle([right, ...wrong]) };
    });
    let i = 0, score = 0, streak = 0;

    const draw = () => {
      const q = questions[i];
      view.innerHTML = `<div class="quiz-card">
        <div class="quiz-top"><span>${q.r.cat.emoji} Question ${i + 1}/${questions.length}</span><span>💖 ${score}</span></div>
        <div class="progress"><i style="width:${(i / questions.length) * 100}%"></i></div>
        <p class="quiz-q">${nb("« " + esc(q.r.q) + " »")}</p>
        <p class="quiz-ask">${q.r.cat.id === "chansons" ? "C'est qui qui chante ça ? 🎤 Allez." : "Alors, t'as la ref ou pas ?"}</p>
        <div class="choices">${q.options.map((o) => `<button class="choice" data-o="${esc(o)}">${esc(o)}</button>`).join("")}</div>
        <div id="after"></div>
      </div>`;
      view.querySelector(".choices").addEventListener("click", (e) => {
        const b = e.target.closest(".choice"); if (!b || b.disabled) return;
        const ok = b.dataset.o === q.right;
        view.querySelectorAll(".choice").forEach((c) => { c.disabled = true; if (c.dataset.o === q.right) c.classList.add("good"); });
        try { navigator.vibrate && navigator.vibrate(ok ? 25 : [40, 60, 40]); } catch { /* pas de vibreur */ }
        if (ok) { score++; streak++; burst(e.clientX, e.clientY); if (streak === 3) toast("3 d'affilée. Tu chauffes 🔥"); if (streak === 5) toast("5 d'affilée ?! On appelle les pompiers 🚒"); } else { streak = 0; b.classList.add("bad"); }
        $("#after").innerHTML = `<p class="meta" style="margin:14px 0 0">${ok ? "✅ " + pick(SASS_OK) : "❌ " + pick(SASS_KO)} <strong>${esc(q.r.cat.id === "chansons" ? q.r.w + " — « " + q.r.s + " »" : q.r.s)}</strong>${q.r.y ? " · " + esc(q.r.y) : ""}${q.r.cat.id !== "chansons" && q.r.w ? " — " + esc(q.r.w) : ""}</p>
          <div class="center"><button class="btn" id="next">${i + 1 < questions.length ? "Next, chéri·e →" : "Le verdict 👀"}</button></div>`;
        $("#next").addEventListener("click", () => { i++; i < questions.length ? draw() : end(); });
      });
    };

    const end = () => {
      const best = store.get("best", {});
      const isBest = score > (best[mode] ?? -1);
      if (isBest) { best[mode] = score; store.set("best", best); }
      const pct = score / questions.length;
      const title = pct === 1 ? "Sans faute. On s'incline, Majesté 👑" : pct >= .8 ? "Une icône. Ni plus, ni moins 💎" : pct >= .6 ? "Ok, t'as la ref. On valide 💅" : pct >= .4 ? "Mouais. Ça passe… de justesse 🙄" : pct >= .2 ? "Chéri·e, on va réviser ensemble 📚" : "Allô ? Non mais allô ?! T'as pas la ref ?! 📞";
      view.innerHTML = `<div class="quiz-card center">
        <p class="score-big">${score}/${questions.length}</p>
        <p class="score-title">${title}</p>
        ${isBest ? `<p class="meta">🎉 Nouveau record. Évidemment.</p>` : ""}
        <button class="btn" id="replay">Revanche 🔁</button>
        <button class="btn" id="brag">📣 Balance ton score</button>
        <a class="btn ghost" href="#/quiz">Changer de thème</a>
      </div>`;
      $("#replay").addEventListener("click", () => viewQuiz(mode));
      $("#brag").addEventListener("click", async () => {
        const theme = mode === "all" ? "toutes catégories" : (CATS.find((c) => c.id === mode) || {}).nom;
        const text = `J'ai fait ${score}/${questions.length} au quiz « ${theme} » de T'as la ref ? — ${title} Et toi, t'as la ref ? 💅`;
        const url = location.origin + location.pathname;
        if (navigator.share) { try { await navigator.share({ title: "T'as la ref ?", text, url }); } catch { /* annulé */ } }
        else toast((await copyText(text + " " + url)) ? "Score copié. Va narguer tes potes 😏" : "Impossible de copier 🙄");
      });
      if (pct >= .6) { const r = view.getBoundingClientRect(); for (let k = 0; k < 4; k++) setTimeout(() => burst(r.left + Math.random() * r.width, 160 + Math.random() * 200), k * 220); }
    };
    draw();
  }

  /* ---------- Actions sur les cartes ---------- */
  const refText = (r) => `${r.moment ? r.q : "« " + r.q + " »"} — ${r.s}${r.y ? " (" + r.y + ")" : ""}${r.w ? ", " + r.w : ""}\n#TasLaRef`;

  async function copyText(t) {
    try { await navigator.clipboard.writeText(t); return true; }
    catch {
      const ta = document.createElement("textarea"); ta.value = t; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      let ok = false; try { ok = document.execCommand("copy"); } catch { ok = false; }
      ta.remove(); return ok;
    }
  }

  document.addEventListener("click", async (e) => {
    const pickGif = e.target.closest(".gif-pick");
    if (pickGif) return shareLink(pickGif.dataset.page, "#TasLaRef");
    const btn = e.target.closest("[data-act]"); if (!btn) return;
    const holder = btn.closest("[data-id]"); const r = holder && BY_ID.get(holder.dataset.id); if (!r) return;
    const act = btn.dataset.act;
    if (act === "fav") {
      const on = !favs.has(r.id);
      if (on) { favs.add(r.id); favMeta[r.id] = metaOf(r); askPersistence(); } else { favs.delete(r.id); delete favMeta[r.id]; }
      saveFavs();
      document.querySelectorAll(`[data-id="${r.id}"] [data-act="fav"]`).forEach((b) => {
        b.classList.toggle("on", on); b.setAttribute("aria-pressed", on);
        b.innerHTML = `<span class="h">${on ? "💖" : "🤍"}</span>${on ? "Adorée" : "J'adore"}`;
      });
      if (on) { burst(e.clientX, e.clientY); toast(pick(SASS_FAV)); } else toast("Retirée. Elle méritait pas ta lumière ✨");
    } else if (act === "info") {
      const panel = btn.closest(".ref").querySelector(".more-info");
      const open = panel.hidden; panel.hidden = !open;
      if (open) loadCredit(btn.closest(".ref"));
      btn.classList.toggle("on", open); btn.setAttribute("aria-expanded", open);
    } else if (act === "nextgif") {
      loadGif(btn.closest(".gif-box"), 1);
    } else if (act === "gifkw") {
      const box = btn.closest(".gif-box");
      const kw = prompt("Un autre mot-clé pour ce GIF ? (vide = mot-clé d'origine)", gifQuery(r));
      if (kw === null) return;
      if (kw.trim()) gifKw[r.id] = kw.trim(); else delete gifKw[r.id];
      store.set("gifKw", gifKw); gifState.delete(r.id);
      box.innerHTML = `<div class="gif-skel">✨ On cherche mieux…</div>`; loadGif(box);
    } else if (act === "sharegif") {
      const st = gifState.get(r.id);
      const page = st && st.list.length ? st.list[st.i].page : r.gpage;
      if (page) shareLink(page, `« ${r.q} » #TasLaRef`);
      else toast("Patience, le GIF se refait une beauté ⏳");
    } else if (act === "copy") {
      toast((await copyText(refText(r))) ? pick(SASS_COPY) : "Impossible de copier 🙄");
    } else if (act === "share") {
      if (navigator.share) { try { await navigator.share({ title: "T'as la ref ?", text: refText(r) }); } catch { /* partage annulé */ } }
      else toast((await copyText(refText(r))) ? "Copiée. Balance-la dans le groupe 💌" : "Partage indisponible 🙄");
    }
  });

  let toastTimer;
  function toast(msg) {
    const t = $("#toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), 1800);
  }

  /* ---------- Paillettes (canvas) ---------- */
  const cv = $("#sparkles"), ctx = cv.getContext("2d");
  let parts = [], raf = 0;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const resize = () => { const d = devicePixelRatio || 1; cv.width = innerWidth * d; cv.height = innerHeight * d; ctx.setTransform(d, 0, 0, d, 0, 0); };
  addEventListener("resize", resize); resize();
  const COLORS = ["#ff1493", "#ff8fcf", "#ffd36e", "#ffffff", "#b620e0", "#ff3cac"];
  function burst(x, y) {
    if (reduce || !x) return;
    for (let k = 0; k < 26; k++) {
      const a = Math.random() * Math.PI * 2, v = 2 + Math.random() * 5;
      parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 2, life: 1, s: 2 + Math.random() * 4, c: pick(COLORS), star: Math.random() < .4 });
    }
    if (!raf) raf = requestAnimationFrame(tick);
  }
  function star(x, y, r) {
    ctx.beginPath();
    for (let k = 0; k < 8; k++) { const rr = k % 2 ? r * .35 : r; const a = (k * Math.PI) / 4; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    ctx.closePath(); ctx.fill();
  }
  function tick() {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    parts = parts.filter((p) => p.life > 0);
    for (const p of parts) {
      p.x += p.vx; p.y += p.vy; p.vy += .15; p.vx *= .98; p.life -= .02;
      ctx.globalAlpha = Math.max(p.life, 0); ctx.fillStyle = p.c;
      if (p.star) star(p.x, p.y, p.s * 1.6); else { ctx.beginPath(); ctx.arc(p.x, p.y, p.s / 2, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.globalAlpha = 1;
    raf = parts.length ? requestAnimationFrame(tick) : 0;
  }

  /* ---------- Recherche globale ---------- */
  const input = $("#search"), clearBtn = $("#clearSearch");
  let searchTimer;
  input.addEventListener("input", () => {
    clearBtn.hidden = !input.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      const q = input.value.trim();
      const target = q ? "#/search/" + encodeURIComponent(q) : "#/";
      if (!location.hash.startsWith("#/search/")) { if (q) location.hash = target; return; } // 1re frappe : nouvelle entrée d'historique
      history.replaceState(null, "", target); // frappes suivantes : on remplace
      route();
    }, 160);
  });
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") input.blur(); });
  clearBtn.addEventListener("click", () => { input.value = ""; clearBtn.hidden = true; location.hash = "#/"; input.focus(); });

  /* ---------- Navigation ---------- */
  function goRandom() { location.hash = "#/ref/" + pick(ALL).id; }
  $("#randomBtn").addEventListener("click", (e) => { burst(e.clientX, e.clientY); goRandom(); });
  $("#backBtn").addEventListener("click", () => (history.length > 1 ? history.back() : (location.hash = "#/")));

  function route() {
    let h = location.hash.replace(/^#\/?/, "");
    try { h = decodeURIComponent(h); } catch { /* adresse mal formée : on garde le texte brut */ }
    const [name, ...rest] = h.split("/");
    const arg = rest.join("/");
    let tab = "home";
    view.classList.remove("view-enter"); void view.offsetWidth; view.classList.add("view-enter");
    if (name !== "search" && input.value) { input.value = ""; clearBtn.hidden = true; }
    switch (name) {
      case "": viewHome(); break;
      case "explore": tab = "explore"; viewExplore(); break;
      case "cat": tab = "explore"; viewCat(arg); break;
      case "search": tab = "explore"; if (input.value.trim() !== arg) { input.value = arg; clearBtn.hidden = !arg; } viewSearch(arg); break;
      case "favs": tab = "favs"; viewFavs(); break;
      case "import": tab = "favs"; importFavs(arg); break;
      case "quiz": tab = "quiz"; arg ? viewQuiz(arg) : viewQuizMenu(); break;
      case "ref": tab = ""; viewRef(arg); break;
      default: viewNotFound();
    }
    document.querySelectorAll(".tabbar a").forEach((a) => a.classList.toggle("on", a.dataset.tab === tab));
    $("#backBtn").hidden = name === "";
    if (name !== "search") scrollTo({ top: 0, behavior: "instant" });
  }
  addEventListener("hashchange", route);
  /* ---------- Splash screen ---------- */
  const splash = $("#splash");
  const seen = (() => { try { return sessionStorage.getItem("talr:splash"); } catch { return null; } })();
  if (seen || location.hash.length > 2) splash.remove();
  else {
    const title = splash.querySelector(".splash-title");
    title.innerHTML = [..."T'as la ref ?"].map((ch, i) =>
      ch === " " ? `<span class="sp" style="--i:${i * 0.07}s"> </span>` : `<span style="--i:${0.2 + i * 0.07}s">${esc(ch)}</span>`).join("");
    const emo = splash.querySelector(".splash-emojis");
    const EMO = ["💅", "💋", "👑", "✨", "💎", "😜", "💪", "🌸", "💖", "🎀"];
    for (let k = 0; k < 14; k++) {
      const e = document.createElement("span");
      e.textContent = EMO[k % EMO.length];
      e.style.cssText = `left:${Math.random() * 92}%;--s:${22 + Math.random() * 22}px;--d:${3.5 + Math.random() * 3}s;--w:${Math.random() * 3}s`;
      emo.appendChild(e);
    }
    setTimeout(() => { const r = title.getBoundingClientRect(); for (let k = 0; k < 3; k++) setTimeout(() => burst(r.left + Math.random() * r.width, r.top + r.height / 2), k * 180); }, 1300);
    let gone = false;
    const close = () => {
      if (gone) return; gone = true;
      try { sessionStorage.setItem("talr:splash", "1"); } catch { /* pas de stockage */ }
      splash.classList.add("hide"); setTimeout(() => splash.remove(), 650);
    };
    splash.addEventListener("click", close);
    splash.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") close(); });
    setTimeout(close, 4200);
  }

  /* ---------- Petites touches sassy ---------- */
  let ph = 0;
  setInterval(() => {
    if (document.activeElement === input || input.value) return;
    ph = (ph + 1) % SASS_SEARCH.length; input.placeholder = SASS_SEARCH[ph];
  }, 4000);
  setTimeout(() => toast("5 minutes ici. Ta vie sociale t'appelle 📞 (on rigole, reste 💅)"), 5 * 60 * 1000);

  route();

  /* ---------- PWA (hors file://) ---------- */
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }
})();
