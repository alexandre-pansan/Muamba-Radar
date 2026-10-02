"""Recorta um .osm.pbf para um retângulo, só com as vias (highway=*), usando pouca
memória. O `osmium extract` monta índices do país inteiro (2–4 GB de pico) e era
morto por falta de memória no VPS (exit 137).

Três passadas pelo arquivo (no .pbf os nós vêm antes das vias e em ordem de ID):
  1. IDs dos nós dentro do retângulo   -> array compacto ordenado (8 bytes/nó)
  2. vias highway com >= 2 nós dentro   -> IDs dos nós que elas usam
  3. grava esses nós (com tags: barreiras, travessias) e depois as vias
Memória: proporcional aos nós da região, não ao país.

uso: clip.py <entrada.osm.pbf> <saida.osm.pbf> <oeste,sul,leste,norte>
"""
import sys
from array import array
from bisect import bisect_left

import osmium

src, dst, bbox = sys.argv[1], sys.argv[2], sys.argv[3]
west, south, east, north = map(float, bbox.split(","))


def contains(sorted_ids, value):
    i = bisect_left(sorted_ids, value)
    return i < len(sorted_ids) and sorted_ids[i] == value


class InsideNodes(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.ids = array("q")

    def node(self, n):
        loc = n.location
        if loc.valid() and west <= loc.lon <= east and south <= loc.lat <= north:
            self.ids.append(n.id)


class HighwayWays(osmium.SimpleHandler):
    def __init__(self, inside):
        super().__init__()
        self.inside = inside
        self.used = array("q")

    def way(self, w):
        if "highway" not in w.tags:
            return
        refs = [r.ref for r in w.nodes if contains(self.inside, r.ref)]
        if len(refs) >= 2:
            self.used.extend(refs)


class Write(osmium.SimpleHandler):
    def __init__(self, writer, inside, used):
        super().__init__()
        self.writer = writer
        self.inside = inside
        self.used = used
        self.ways = 0

    def node(self, n):
        if contains(self.used, n.id):
            self.writer.add_node(n)

    def way(self, w):
        if "highway" not in w.tags:
            return
        refs = [r.ref for r in w.nodes if contains(self.inside, r.ref)]
        if len(refs) >= 2:
            self.writer.add_way(osmium.osm.mutable.Way(w, nodes=refs))
            self.ways += 1


inside = InsideNodes()
inside.apply_file(src)
inside_ids = inside.ids
assert all(inside_ids[i] < inside_ids[i + 1] for i in range(min(len(inside_ids) - 1, 10000))), "pbf sem ordem de ID"
del inside

ways = HighwayWays(inside_ids)
ways.apply_file(src)
used = array("q", sorted(set(ways.used)))
del ways

writer = osmium.SimpleWriter(dst)
out = Write(writer, inside_ids, used)
out.apply_file(src)
writer.close()
print(f"recorte: {len(used)} nós de via, {out.ways} vias (de {len(inside_ids)} nós na região)")
