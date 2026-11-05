# Montador de Drama AI Studio (Cloud Run Job). Genérico: descarga lo que diga
# la lista del trabajo, ejecuta el guion que escribió el servidor y sube el
# resultado. No conoce ningún archivo por su nombre.
FROM gcr.io/google.com/cloudsdktool/google-cloud-cli:slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg fonts-dejavu-core zip ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY correr.sh /usr/local/bin/drama-studio-montador
RUN chmod +x /usr/local/bin/drama-studio-montador

ENTRYPOINT ["/usr/local/bin/drama-studio-montador"]
