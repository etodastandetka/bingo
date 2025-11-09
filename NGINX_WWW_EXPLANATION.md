# Объяснение про www в nginx конфиге

## Почему убрать www?

Если сертификат получен только для основного домена (без www), то в `server_name` нужно указать только этот домен.

## Вариант 1: Только основной домен (без www)

Если сертификат получен так:
```bash
sudo certbot certonly --standalone -d fqxgmrzplndwsyvkeu.ru
```

То в конфиге должно быть:
```nginx
server_name fqxgmrzplndwsyvkeu.ru;
```

## Вариант 2: С www (если нужен)

Если хотите поддерживать и www версию, получите сертификат для обоих:

```bash
sudo certbot certonly --standalone -d fqxgmrzplndwsyvkeu.ru -d www.fqxgmrzplndwsyvkeu.ru
```

Тогда в конфиге можно указать оба:
```nginx
server_name fqxgmrzplndwsyvkeu.ru www.fqxgmrzplndwsyvkeu.ru;
```

## Вариант 3: Редирект www на основной домен

Если хотите, чтобы www редиректил на основной домен:

```nginx
# Редирект www на основной домен
server {
    listen 80;
    server_name www.fqxgmrzplndwsyvkeu.ru;
    return 301 https://fqxgmrzplndwsyvkeu.ru$request_uri;
}

server {
    listen 443 ssl http2;
    server_name www.fqxgmrzplndwsyvkeu.ru;
    
    ssl_certificate /etc/letsencrypt/live/fqxgmrzplndwsyvkeu.ru/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/fqxgmrzplndwsyvkeu.ru/privkey.pem;
    
    return 301 https://fqxgmrzplndwsyvkeu.ru$request_uri;
}

# Основной домен
server {
    listen 443 ssl http2;
    server_name fqxgmrzplndwsyvkeu.ru;
    
    ssl_certificate /etc/letsencrypt/live/fqxgmrzplndwsyvkeu.ru/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/fqxgmrzplndwsyvkeu.ru/privkey.pem;
    
    # ... остальная конфигурация
}
```

## Рекомендация

**Для админки и формы оплаты лучше использовать только основной домен без www** - это проще и безопаснее.

Если в вашем конфиге было `www.fqxgmrzplndwsyvkeu.ru`, но сертификат получен только для основного домена, то:
- Либо уберите www из конфига
- Либо получите сертификат заново с www

## Проверка текущего сертификата

```bash
# Посмотрите для каких доменов получен сертификат
sudo certbot certificates
```

Если там только `fqxgmrzplndwsyvkeu.ru` (без www), то в конфиге должно быть только `fqxgmrzplndwsyvkeu.ru`.

