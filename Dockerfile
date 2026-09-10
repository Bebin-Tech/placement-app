FROM node:24-bookworm-slim AS frontend
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY index.html tsconfig.json vite.config.ts ./
COPY src ./src
COPY public ./public
RUN npm run build

FROM python:3.12-slim
ENV FLASK_ENV=production HOST=0.0.0.0 PORT=5000 DATABASE_PATH=/app/data/campus.db
WORKDIR /app
COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt
COPY backend ./backend
COPY --from=frontend /app/dist ./dist
RUN mkdir -p /app/data && chown -R nobody:nogroup /app
USER nobody
EXPOSE 5000
VOLUME ["/app/data"]
HEALTHCHECK --interval=30s --timeout=5s CMD python -c "import urllib.request;urllib.request.urlopen('http://127.0.0.1:5000/api/health',timeout=3)"
CMD ["python", "backend/app.py"]
