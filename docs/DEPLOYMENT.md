# Rrrrrrain — Разворачиваем сервер (наименее больной путь)

Сервер Colyseus — обычный Node.js процесс, слушает WebSocket на порту **2567**. Ниже — 4 варианта от «5 минут» до «свой VPS».

---

## Локально (для теста и LAN-игры)

Быстрее всего убедиться, что всё работает:

```bash
cd magic_hands_fps
npm install
npm run dev           # запускает и клиент (5173), и сервер (2567) параллельно
```

Открой `http://localhost:5173` → **HOST**. Друзья в той же локалке подключаются на `http://<твой-IP>:5173` и вписывают `ws://<твой-IP>:2567` в поле endpoint (там же в меню).

Если играть по интернету из локалки — нужен порт-форвардинг или туннель:

```bash
# Тоннель через ngrok (WSS автоматом)
npx ngrok tcp 2567
# Копируй tcp://X.tcp.ngrok.io:YYYYY → в меню игры введи ws://X.tcp.ngrok.io:YYYYY
```

Плюсы: 0 денег. Минусы: у хоста горит канал; ngrok free = 1 подключение с редиректами каждые 2 часа.

---

## Railway (проще всего для 24/7)

**Стоимость:** free-тир $5 кредитов/мес, хватит на маленький ру́м. Дальше ~$5/мес за always-on.

1. Зарегься на [railway.app](https://railway.app) через GitHub.
2. Запушь этот репозиторий в GitHub (или соедини напрямую).
3. `New Project → Deploy from GitHub → выбери репу`.
4. В настройках нового сервиса:
   - **Root Directory:** `server`
   - **Start Command:** `node src/index.js`
   - **Variables:** `PORT` (Railway задаёт сам, наш код читает `process.env.PORT`)
5. Во вкладке `Settings → Networking → Generate Domain`. Получишь адрес `xxx.up.railway.app`.
6. В игре впиши endpoint: `wss://xxx.up.railway.app` (без порта — Railway проксирует 443 → внутренний порт).

Готово, кооп работает из любой точки мира.

---

## Fly.io (глобальные регионы, чуть сложнее)

**Стоимость:** free-тир до 3 маленьких VM 256 МБ, хватит.

1. Установи CLI: `curl -L https://fly.io/install.sh | sh`
2. `fly launch` в папке `server` (согласись на dockerfile, выбери регион ближе к тебе — `fra` для EU, `sin` для SEA).
3. В `fly.toml` укажи:
   ```toml
   [[services]]
     internal_port = 2567
     protocol = "tcp"

     [[services.ports]]
       port = 80
       handlers = ["http"]
     [[services.ports]]
       port = 443
       handlers = ["tls", "http"]

     [services.concurrency]
       type = "connections"
       hard_limit = 200
       soft_limit = 100
   ```
4. `fly deploy`
5. В игре впиши `wss://<app-name>.fly.dev`.

Плюс: глобальные регионы, легко масштабировать. Минус: sleep через 5 мин без коннектов (для WS-игры это ок).

---

## Свой VPS (Hetzner / Contabo / DigitalOcean) — max контроль

**Стоимость:** Hetzner CX11 ≈ €4/мес, Contabo VPS S ≈ €4/мес.

1. Создай VPS, Ubuntu 22.04+.
2. По SSH:
   ```bash
   # Node.js 20
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
   sudo apt install -y nodejs

   # PM2 для авто-рестарта
   sudo npm install -g pm2

   # Клонируешь репу
   git clone <твой-репо> rrrrrrain && cd rrrrrrain
   npm install
   pm2 start server/src/index.js --name rrrr-server
   pm2 startup && pm2 save
   ```
3. **HTTPS/WSS через Caddy** (проще всего):
   ```bash
   sudo apt install -y caddy
   sudo nano /etc/caddy/Caddyfile
   ```
   Впиши:
   ```
   rrr.example.com {
     reverse_proxy localhost:2567
   }
   ```
   ```bash
   sudo systemctl reload caddy
   ```
4. Направь DNS `rrr.example.com` на IP VPS. Caddy получит TLS-сертификат автоматом.
5. В игре: `wss://rrr.example.com`.

**Открыть порт (если файрвол UFW):**
```bash
sudo ufw allow 80/tcp && sudo ufw allow 443/tcp && sudo ufw reload
```

---

## Render.com (альтернатива Railway)

Аналогичный workflow, но при бесплатном тире засыпает через 15 мин без трафика (первый коннект после сна ждёт ~30 сек — плохо для быстрых сессий). Годится для тестов, для прода бери paid tier ($7/мес).

---

## Что писать в endpoint игры

- Локально: `ws://localhost:2567`
- LAN: `ws://192.168.x.x:2567`
- ngrok TCP: `ws://X.tcp.ngrok.io:YYYYY`
- Railway/Fly/Render с генеренным доменом: `wss://xxx.example.com` (без порта!)
- Свой VPS с Caddy/nginx перед сервером: `wss://твой-домен.com`

Endpoint вбивается в первое поле меню перед нажатием HOST/JOIN.

---

## Мониторинг

- `http://<host>:2567/health` → `{ok: true}` (для uptime-пингеров типа UptimeRobot).
- `http://<host>:2567/colyseus` → веб-панель Colyseus Monitor (комнаты, игроки, схема). **Обязательно защити basic-auth или закрой файрволом в проде.**

---

## Обновление

1. Локально: правишь код → пушишь в GitHub.
2. Railway/Fly: авто-деплой по push (или `fly deploy`).
3. VPS: `git pull && pm2 restart rrrr-server`.

Живые сессии рвутся при рестарте — игрокам придётся заново подключиться. Zero-downtime deploy — уже про этап после релиза.

---

## Известные ограничения

- **Один инстанс сервера** = один регион. Пинг латам из EU в SEA-инстанс будет ~250 мс. Многорегиональный кластер — стоит денег и не нужен до сотен игроков.
- **UDP/WebRTC**: не подключен. Для сверхбыстрых снарядов в будущем — `@geckos.io/server`, но потребует TURN-сервер.
- **Anti-DDoS**: базовое покрытие даёт Cloudflare Tunnel (бесплатно, работает поверх WSS). Настройка — 15 мин, инструкция при желании отдельно.
