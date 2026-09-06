FROM python:3.11-slim

# Установка системных утилит и Node.js 20
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    gnupg \
    && mkdir -p /etc/apt/keyrings \
    && curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg \
    && echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" | tee /etc/apt/sources.list.d/nodesource.list \
    && apt-get update \
    && apt-get install -y nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Создание стандартного пользователя Hugging Face (UID 1000)
RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH \
    PORT=10000 \
    HOST=0.0.0.0

WORKDIR /home/user/app

# Копируем проект
COPY --chown=user . /home/user/app

# Устанавливаем зависимости Python (Aiogram и др.)
RUN pip install --no-cache-dir -r bot/requirements.txt

# Устанавливаем зависимости Node.js (Fastify и др.)
RUN cd backend && npm install --omit=dev

# Даём права на выполнение entrypoint.sh
USER root
RUN chmod +x /home/user/app/entrypoint.sh
USER user

EXPOSE 10000

CMD ["bash", "entrypoint.sh"]
