"""Lancer depuis la racine du projet : python tools/generer_alias.py .
Construit data/aliases.js : ancien identifiant de ref -> identifiant actuel, sur tout l'historique git.
Ainsi, un favori enregistré avant une correction de citation retrouve sa ref. Usage : python aliases.py <projet>"""
import sys, os, re, json, subprocess, difflib, unicodedata
root = sys.argv[1]; os.chdir(root)
FILES = {'cinema': 'cinema', 'series-humour': 'series', 'chansons': 'chansons', 'tele': 'tele', 'internet': 'internet',
         'pubs': 'pubs', 'dessins-animes': 'dessins-animes', 'gifs': 'gifs'}

def js_hash(s):  # identique à hash() de js/app.js (FNV-1a 32 bits sur les unités UTF-16)
    h = 2166136261
    b = s.encode('utf-16-le')
    for i in range(0, len(b), 2):
        h ^= b[i] | (b[i + 1] << 8)
        h = (h * 16777619) & 0xFFFFFFFF
    d = '0123456789abcdefghijklmnopqrstuvwxyz'; out = ''
    while True:
        h, r = divmod(h, 36); out = d[r] + out
        if not h: break
    return out
def refs_of(text):
    out = []
    for l in text.split('\n'):
        m = re.match(r'^\s{4}(\[.*\]),?\s*(//.*)?$', l)
        if m:
            try: a = json.loads(m.group(1))
            except Exception: continue
            if isinstance(a, list) and len(a) >= 2 and isinstance(a[0], str): out.append((a[0], a[1]))
    return out
def state(rev):
    st = {}
    for f, cid in FILES.items():
        if rev is None:
            p = f'data/{f}.js'; txt = open(p, encoding='utf-8').read() if os.path.exists(p) else ''
        else:
            r = subprocess.run(['git', 'show', f'{rev}:data/{f}.js'], capture_output=True)
            txt = r.stdout.decode('utf-8', 'ignore') if r.returncode == 0 else ''
        st[cid] = [(cid + '-' + js_hash(q + '|' + s), q, s) for q, s in refs_of(txt)]
    return st
def norm(t):
    t = unicodedata.normalize('NFD', t.lower()); t = ''.join(c for c in t if unicodedata.category(c) != 'Mn')
    return set(w for w in re.sub(r"[^a-z0-9]+", ' ', t).split() if len(w) > 2)
def sim(a, b):
    A, B = norm(a[1].lstrip('📍')) | norm(a[2]), norm(b[1].lstrip('📍')) | norm(b[2])
    return len(A & B) / max(1, len(A | B))

revs = subprocess.run(['git', 'rev-list', '--reverse', 'HEAD'], capture_output=True, text=True).stdout.split()
states = [state(r) for r in revs] + [state(None)]
alias = {}
for old, new in zip(states, states[1:]):
    for cid in FILES.values():
        a, b = old.get(cid, []), new.get(cid, [])
        sm = difflib.SequenceMatcher(None, [x[0] for x in a], [x[0] for x in b], autojunk=False)
        for tag, i1, i2, j1, j2 in sm.get_opcodes():
            if tag != 'replace': continue
            olds, news = a[i1:i2], b[j1:j2]
            if len(olds) == len(news):
                for x, y in zip(olds, news):
                    if x[0] != y[0]: alias[x[0]] = y[0]
            else:  # tailles différentes : on apparie par ressemblance
                for x in olds:
                    best = max(news, key=lambda y: sim(x, y), default=None)
                    if best and sim(x, best) >= 0.5: alias[x[0]] = best[0]
final = {x[0] for v in states[-1].values() for x in v}
def resolve(k):
    seen = set()
    while k in alias and k not in seen and k not in final: seen.add(k); k = alias[k]
    return k
out = {k: resolve(k) for k in alias}
out = {k: v for k, v in out.items() if v in final and k != v and k not in final}
open('data/aliases.js', 'w', encoding='utf-8').write(
    "/* Anciens identifiants de refs -> identifiants actuels (favoris préservés malgré les corrections). Généré. */\n"
    "window.TALR_ALIASES = " + json.dumps(out, separators=(',', ':')) + ";\n")
print('versions analysées :', len(states), '| correspondances :', len(out))
