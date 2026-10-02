# Roteador de rotas a pé (OSRM) com as vias da região de Ciudad del Este
# (OpenStreetMap, via Geofabrik). Build inteiro cabe em 256 MB de RAM.
# O mapa é baixado e pré-processado no build — a imagem final já sobe pronta, sem
# depender de serviço externo em tempo de execução. O deploy NÃO rebuilda o OSRM sem
# cache (ver .github/workflows/deploy.yml); pra atualizar o mapa (ruas novas):
#   docker compose build --no-cache osrm && docker compose up -d osrm
ARG OSRM_IMAGE=ghcr.io/project-osrm/osrm-backend:v5.27.1

FROM debian:bookworm-slim AS download
ARG PBF_URL=https://download.geofabrik.de/south-america/paraguay-latest.osm.pbf
# Recorte (oeste,sul,leste,norte): Ciudad del Este + Pres. Franco + Hernandarias, onde
# ficam as lojas. Loja em outra cidade = ampliar o recorte e rebuildar.
ARG BBOX=-54.80,-25.62,-54.55,-25.38
# Recorte com clip.py (pyosmium, em streaming, só vias): ~150 MB de RAM. O
# `osmium extract` montava índices do Paraguai inteiro (2–4 GB) e era morto por
# falta de memória no VPS (exit 137).
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl python3-pyosmium \
 && rm -rf /var/lib/apt/lists/*
COPY clip.py /clip.py
RUN curl -fsSL --retry 3 -o /country.osm.pbf "$PBF_URL" \
 && python3 /clip.py /country.osm.pbf /map.osm.pbf "$BBOX" \
 && rm /country.osm.pbf

FROM ${OSRM_IMAGE} AS build
COPY --from=download /map.osm.pbf /data/map.osm.pbf
# Perfil "foot": calçadas, travessias, ruas de pedestre. MLD = partition + customize.
RUN osrm-extract -p /opt/foot.lua /data/map.osm.pbf \
 && osrm-partition /data/map.osrm \
 && osrm-customize /data/map.osrm \
 && rm /data/map.osm.pbf

FROM ${OSRM_IMAGE}
COPY --from=build /data /data
EXPOSE 5000
CMD ["osrm-routed", "--algorithm", "mld", "--max-table-size", "50", "--max-trip-size", "25", "/data/map.osrm"]
