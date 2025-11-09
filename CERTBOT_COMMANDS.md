# Команды для получения SSL сертификатов через Certbot

## 1. Установка Certbot (если не установлен)

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install certbot

# CentOS/RHEL
sudo yum install certbot
```

## 2. Получение сертификатов

### Важно: перед получением сертификатов нужно остановить nginx

```bash
# Остановите nginx
sudo systemctl stop nginx
```

### Получение сертификата для админки (fqxgmrzplndwsyvkeu.ru)

```bash
sudo certbot certonly --standalone -d fqxgmrzplndwsyvkeu.ru
```

### Получение сертификата для формы оплаты (gldwueprxkmbtqsnva.ru)

```bash
sudo certbot certonly --standalone -d gldwueprxkmbtqsnva.ru
```

### Получение обоих сертификатов одной командой

```bash
sudo certbot certonly --standalone -d fqxgmrzplndwsyvkeu.ru -d gldwueprxkmbtqsnva.ru
```

## 3. После получения сертификатов

```bash
# Запустите nginx обратно
sudo systemctl start nginx
```

## 4. Проверка сертификатов

Сертификаты будут сохранены в:
- `/etc/letsencrypt/live/fqxgmrzplndwsyvkeu.ru/fullchain.pem`
- `/etc/letsencrypt/live/fqxgmrzplndwsyvkeu.ru/privkey.pem`
- `/etc/letsencrypt/live/gldwueprxkmbtqsnva.ru/fullchain.pem`
- `/etc/letsencrypt/live/gldwueprxkmbtqsnva.ru/privkey.pem`

Проверьте:
```bash
sudo ls -la /etc/letsencrypt/live/fqxgmrzplndwsyvkeu.ru/
sudo ls -la /etc/letsencrypt/live/gldwueprxkmbtqsnva.ru/
```

## 5. Автоматическое обновление сертификатов

Certbot автоматически обновляет сертификаты. Проверьте таймер:

```bash
sudo systemctl status certbot.timer
```

Если таймер не активен, включите его:

```bash
sudo systemctl enable certbot.timer
sudo systemctl start certbot.timer
```

## 6. Тестовые сертификаты (для проверки)

Если хотите сначала протестировать:

```bash
sudo certbot certonly --standalone --test-cert -d fqxgmrzplndwsyvkeu.ru
sudo certbot certonly --standalone --test-cert -d gldwueprxkmbtqsnva.ru
```

## 7. Обновление существующих сертификатов

```bash
sudo certbot renew
```

## 8. Проверка срока действия сертификатов

```bash
sudo certbot certificates
```

## Важные моменты:

1. **Перед получением сертификатов убедитесь, что:**
   - Домены указывают на IP вашего сервера
   - Порты 80 и 443 открыты в firewall
   - Nginx остановлен (для standalone режима)

2. **После получения сертификатов:**
   - Настройте nginx конфигурацию
   - Запустите nginx
   - Проверьте работу сайтов

3. **Если возникли проблемы:**
   - Проверьте DNS записи: `nslookup fqxgmrzplndwsyvkeu.ru`
   - Проверьте доступность портов: `sudo netstat -tulpn | grep :80`
   - Проверьте логи: `sudo journalctl -u certbot`

