# Решение проблемы с занятым портом 80 в Certbot

## Проблема
Certbot не может использовать порт 80, потому что он уже занят (обычно nginx или другой веб-сервер).

## Решение 1: Остановить nginx перед получением сертификатов (Standalone режим)

```bash
# 1. Остановите nginx
sudo systemctl stop nginx

# 2. Получите сертификаты
sudo certbot certonly --standalone -d fqxgmrzplndwsyvkeu.ru
sudo certbot certonly --standalone -d gldwueprxkmbtqsnva.ru

# 3. Запустите nginx обратно
sudo systemctl start nginx
```

## Решение 2: Использовать nginx плагин (рекомендуется)

Если nginx уже настроен, используйте nginx плагин - он автоматически настроит SSL:

```bash
# 1. Убедитесь, что nginx запущен
sudo systemctl start nginx

# 2. Сначала настройте базовые конфиги nginx (без SSL)
# См. инструкцию ниже

# 3. Используйте nginx плагин certbot
sudo certbot --nginx -d fqxgmrzplndwsyvkeu.ru
sudo certbot --nginx -d gldwueprxkmbtqsnva.ru

# Certbot автоматически:
# - Получит сертификаты
# - Настроит nginx для использования SSL
# - Добавит редирект с HTTP на HTTPS
```

## Решение 3: Проверить что занимает порт 80

```bash
# Узнайте что использует порт 80
sudo lsof -i :80
# или
sudo netstat -tulpn | grep :80

# Остановите процесс
sudo systemctl stop nginx
# или
sudo kill -9 <PID>
```

## Настройка nginx перед использованием nginx плагина

Создайте базовые конфиги без SSL:

### `/etc/nginx/sites-available/bingo-admin`:
```nginx
server {
    listen 80;
    server_name fqxgmrzplndwsyvkeu.ru;

    location / {
        proxy_pass http://127.0.0.1:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### `/etc/nginx/sites-available/bingo-payment`:
```nginx
server {
    listen 80;
    server_name gldwueprxkmbtqsnva.ru;

    location / {
        proxy_pass http://127.0.0.1:3003;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Активация:
```bash
sudo ln -s /etc/nginx/sites-available/bingo-admin /etc/nginx/sites-enabled/
sudo ln -s /etc/nginx/sites-available/bingo-payment /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### Затем используйте certbot:
```bash
sudo certbot --nginx -d fqxgmrzplndwsyvkeu.ru
sudo certbot --nginx -d gldwueprxkmbtqsnva.ru
```

Certbot автоматически обновит конфиги nginx для использования SSL!

## Рекомендуемый порядок действий:

1. **Настройте базовые конфиги nginx** (без SSL, как показано выше)
2. **Проверьте что nginx работает**: `sudo nginx -t && sudo systemctl reload nginx`
3. **Используйте nginx плагин certbot**: `sudo certbot --nginx -d fqxgmrzplndwsyvkeu.ru`
4. **Проверьте что SSL работает**: откройте `https://fqxgmrzplndwsyvkeu.ru` в браузере

## Если используете standalone режим:

```bash
# Нажмите 'C' (Cancel) в certbot, затем:

# Остановите nginx
sudo systemctl stop nginx

# Получите сертификаты
sudo certbot certonly --standalone -d fqxgmrzplndwsyvkeu.ru
sudo certbot certonly --standalone -d gldwueprxkmbtqsnva.ru

# Запустите nginx
sudo systemctl start nginx

# Затем вручную настройте nginx конфиги для SSL (см. SERVER_SETUP.md)
```

