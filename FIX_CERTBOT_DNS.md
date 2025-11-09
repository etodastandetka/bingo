# Решение проблемы с DNS в Certbot

## Проблема
Certbot не может подключиться к серверам Let's Encrypt из-за проблем с DNS разрешением.

## Решения

### 1. Проверка DNS на сервере

```bash
# Проверьте, работает ли DNS
nslookup acme-v02.api.letsencrypt.org
# или
dig acme-v02.api.letsencrypt.org

# Проверьте DNS серверы
cat /etc/resolv.conf
```

### 2. Исправление DNS серверов

```bash
# Отредактируйте /etc/resolv.conf
sudo nano /etc/resolv.conf

# Добавьте надежные DNS серверы:
nameserver 8.8.8.8
nameserver 8.8.4.4
nameserver 1.1.1.1
```

### 3. Если /etc/resolv.conf перезаписывается

```bash
# Для systemd-resolved
sudo systemd-resolve --status
sudo systemd-resolve --set-dns=8.8.8.8 --set-dns=8.8.4.4

# Или отредактируйте конфиг systemd-resolved
sudo nano /etc/systemd/resolved.conf
# Добавьте:
DNS=8.8.8.8 8.8.4.4 1.1.1.1
FallbackDNS=1.1.1.1
# Затем:
sudo systemctl restart systemd-resolved
```

### 4. Проверка сетевого подключения

```bash
# Проверьте доступность интернета
ping 8.8.8.8
ping google.com

# Проверьте доступность Let's Encrypt
curl -I https://acme-v02.api.letsencrypt.org/directory
```

### 5. Альтернативный способ получения сертификатов (через nginx)

Если DNS не работает, можно использовать nginx плагин вместо standalone:

```bash
# Сначала настройте nginx (без SSL)
# Затем используйте nginx плагин:
sudo certbot --nginx -d fqxgmrzplndwsyvkeu.ru
sudo certbot --nginx -d gldwueprxkmbtqsnva.ru
```

### 6. Ручная настройка DNS (если проблема в сетевых настройках)

```bash
# Временно установите DNS через переменные окружения
export DNS_SERVER=8.8.8.8

# Или используйте dnsmasq
sudo apt install dnsmasq
sudo systemctl start dnsmasq
sudo systemctl enable dnsmasq
```

### 7. Проверка firewall

```bash
# Убедитесь, что порты открыты
sudo ufw status
sudo iptables -L -n

# Если нужно, откройте порты
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
```

### 8. Тест после исправления

```bash
# Проверьте DNS
nslookup acme-v02.api.letsencrypt.org

# Если работает, попробуйте certbot снова
sudo certbot certonly --standalone -d fqxgmrzplndwsyvkeu.ru
```

## Быстрое решение (если DNS не работает)

Если проблема с DNS не решается, можно временно использовать другой метод:

1. **Использовать DNS плагин certbot** (если у вас есть доступ к DNS записям домена)
2. **Использовать webroot плагин** (если nginx уже работает)
3. **Получить сертификаты вручную** и скопировать на сервер

## Проверка после исправления

```bash
# Проверьте что DNS работает
ping -c 3 8.8.8.8
nslookup google.com

# Проверьте доступность Let's Encrypt
curl -I https://acme-v02.api.letsencrypt.org/directory

# Если все работает, запустите certbot
sudo certbot certonly --standalone -d fqxgmrzplndwsyvkeu.ru
```

