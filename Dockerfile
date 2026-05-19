FROM gdssingapore/airbase:nginx-1.28

COPY --chown=app:app index.html /usr/share/nginx/html/
COPY --chown=app:app styles.css /usr/share/nginx/html/
COPY --chown=app:app bundle.js /usr/share/nginx/html/
COPY --chown=app:app logo.png /usr/share/nginx/html/
COPY --chown=app:app fonts/ /usr/share/nginx/html/fonts/
