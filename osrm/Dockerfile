# Roteador de rotas a pé (OSRM) com o mapa da região de Ciudad del Este (OpenStreetMap,
# via Geofabrik).
# O mapa é baixado e pré-processado no build — a imagem final já sobe pronta, sem
# depender de serviço externo em tempo de execução. O deploy NÃO rebuilda o OSRM sem
# cache (ver .github/workflows/deploy.yml); pra atualizar o mapa (ruas novas):
#   docker compose build --no-cache osrm && docker compose up -d osrm
ARG OSRM_IMAGE=ghcr.io/project-osrm/osrm-backend:v5.27.1

FROM debian:bookworm-slim AS download
ARG PBF_URL=https://download.geofabrik.de/south-america/paraguay-latest.osm.pbf
# Recorte (oeste,sul,leste,norte): Ciudad del Este + Pres. Franco + Hernandarias, onde
# ficam as lojas. O Paraguai inteiro pede 1–2 GB de RAM pra processar; o recorte cabe
# folgado num VPS pequeno. Loja em outra cidade = ampliar o recorte e rebuildar.
ARG BBOX=-54.80,-25.62,-54.55,-25.38
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl osmium-tool \
 && curl -fsSL --retry 3 -o /country.osm.pbf "$PBF_URL" \
 && osmium extract --bbox "$BBOX" --strategy smart -o /map.osm.pbf /country.osm.pbf \
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
