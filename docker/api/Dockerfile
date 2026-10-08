FROM python:3.12-slim-bookworm AS builder

WORKDIR /app

COPY pyproject.toml README.md ./
COPY apps/services/api ./apps/services/api
RUN pip install --no-cache-dir --prefix=/install .

FROM python:3.12-slim-bookworm AS runtime

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
# Generated decks live on the artifact volume; the application directory is read-only for appuser.
ENV ARTIFACT_ROOT=/artifacts
ENV PYTHONPATH=/app:/app/apps/services/api:/app/apps/api

RUN apt-get update \
    # LibreOffice + poppler + Inter render the Master Presentation (PDF and slide previews)
    # from the assembled PPTX. fonts-inter is the Inter family under the SIL Open Font License.
    && apt-get install -y --no-install-recommends curl poppler-utils libreoffice-impress fontconfig fonts-inter \
    && fc-cache -f \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 10001 appuser \
    && mkdir -p /artifacts \
    && chown appuser:appuser /artifacts

COPY --from=builder /install /usr/local
COPY apps/services/api ./apps/services/api
COPY apps/api ./apps/api
COPY generated/python ./generated/python
COPY config ./config
COPY packages ./packages
# Borek deck generator (pre-/post-meeting decks)
COPY borek_pptx.py deck_text.py llm_planner.py make_ai_tech_deck.py make_master_deck.py preview_pptx.py ./
COPY borek_assets ./borek_assets
COPY tests/fixtures/renderer ./tests/fixtures/renderer

EXPOSE 8000

HEALTHCHECK --interval=15s --timeout=5s --retries=5 \
  CMD curl -fsS http://127.0.0.1:8000/health || exit 1

WORKDIR /app/apps/services/api
USER appuser
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
