# Настройка SSL сертификата для BINGO Admin Panel

## Предварительные требования

1. Домен `fqxgmrzplndwsyvkeu.ru` должен указывать на IP вашего сервера
2. Nginx должен быть установлен и настроен
3. Порты 80 и 443 должны быть открыты в firewall

## Шаг 1: Установка Certbot

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install certbot python3-certbot-nginx -y

# CentOS/RHEL
sudo yum install certbot python3-certbot-nginx -y
```

## Шаг 2: Получение SSL сертификата

```bash
sudo certbot --nginx -d fqxgmrzplndwsyvkeu.ru -d www.fqxgmrzplndwsyvkeu.ru
```

Certbot автоматически:
- Получит сертификат от Let's Encrypt
- Настроит Nginx для использования HTTPS
- Настроит автоматическое обновление сертификата

## Шаг 3: Ручная настройка (если нужно)

Если Certbot не настроил автоматически, выполните:

1. Отредактируйте `/etc/nginx/sites-available/bingo-admin`:

```nginx
server {
    listen 80;
    server_name fqxgmrzplndwsyvkeu.ru www.fqxgmrzplndwsyvkeu.ru;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name fqxgmrzplndwsyvkeu.ru www.fqxgmrzplndwsyvkeu.ru;

    ssl_certificate /etc/letsencrypt/live/fqxgmrzplndwsyvkeu.ru/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/fqxgmrzplndwsyvkeu.ru/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    location / {
        proxy_pass http://localhost:3001;
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

2. Проверьте конфигурацию:
```bash
sudo nginx -t
```

3. Перезапустите Nginx:
```bash
sudo systemctl reload nginx
```

## Шаг 4: Проверка автоматического обновления

Certbot автоматически настроит обновление сертификата. Проверить можно:

```bash
sudo certbot renew --dry-run
```

## Полезные команды

- Проверить статус сертификата: `sudo certbot certificates`
- Обновить сертификат вручную: `sudo certbot renew`
- Удалить сертификат: `sudo certbot delete --cert-name fqxgmrzplndwsyvkeu.ru`

