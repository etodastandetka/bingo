# Установка Nginx и SSL сертификатов

## Шаг 1: Установка Nginx

```bash
# Обновление пакетов
sudo apt update

# Установка Nginx
sudo apt install nginx -y

# Проверка статуса
sudo systemctl status nginx

# Включение автозапуска
sudo systemctl enable nginx
```

## Шаг 2: Копирование конфигурационных файлов

```bash
# Скопируйте конфигурационные файлы в nginx
sudo cp nginx-admin.conf /etc/nginx/sites-available/bingo-admin
sudo cp nginx-payment.conf /etc/nginx/sites-available/bingo-payment

# Создайте символические ссылки для активации
sudo ln -s /etc/nginx/sites-available/bingo-admin /etc/nginx/sites-enabled/
sudo ln -s /etc/nginx/sites-available/bingo-payment /etc/nginx/sites-enabled/

# Удалите дефолтный конфиг (опционально)
sudo rm /etc/nginx/sites-enabled/default

# Проверка конфигурации
sudo nginx -t

# Перезагрузка Nginx
sudo systemctl reload nginx
```

## Шаг 3: Настройка DNS

Убедитесь, что DNS записи настроены правильно:

```
A запись для gdsfafdsdf.me -> IP вашего сервера
A запись для erwerewrew.me -> IP вашего сервера
```

Проверка:
```bash
dig gdsfafdsdf.me
dig erwerewrew.me
```

## Шаг 4: Установка Certbot

```bash
# Установка snapd (если не установлен)
sudo apt install snapd -y

# Установка certbot через snap
sudo snap install core; sudo snap refresh core
sudo snap install --classic certbot

# Создание символической ссылки
sudo ln -s /snap/bin/certbot /usr/bin/certbot
```

## Шаг 5: Получение SSL сертификатов

```bash
# Получение сертификатов для обоих доменов
sudo certbot --nginx -d gdsfafdsdf.me -d erwerewrew.me

# Или по отдельности:
# sudo certbot --nginx -d gdsfafdsdf.me
# sudo certbot --nginx -d erwerewrew.me
```

Certbot автоматически:
- Получит сертификаты
- Обновит конфигурацию nginx
- Настроит редирект с HTTP на HTTPS

## Шаг 6: Проверка автоматического обновления

```bash
# Тестовый запуск обновления
sudo certbot renew --dry-run

# Проверка таймера автоматического обновления
sudo systemctl status certbot.timer
```

## Шаг 7: Финальная настройка (после получения сертификатов)

После успешного получения сертификатов:

1. Раскомментируйте HTTPS блоки в конфигурационных файлах
2. Раскомментируйте редирект с HTTP на HTTPS
3. Перезагрузите nginx:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## Шаг 8: Проверка работы

```bash
# Проверка HTTP
curl -I http://gdsfafdsdf.me
curl -I http://erwerewrew.me

# Проверка HTTPS
curl -I https://gdsfafdsdf.me
curl -I https://erwerewrew.me
```

## Полезные команды

```bash
# Просмотр логов nginx
sudo tail -f /var/log/nginx/admin-access.log
sudo tail -f /var/log/nginx/payment-access.log

# Проверка конфигурации nginx
sudo nginx -t

# Перезагрузка nginx
sudo systemctl reload nginx

# Перезапуск nginx
sudo systemctl restart nginx

# Просмотр статуса nginx
sudo systemctl status nginx

# Просмотр сертификатов
sudo certbot certificates

# Обновление сертификатов вручную
sudo certbot renew
```

## Решение проблем

### Если certbot не может получить сертификат:

1. Проверьте, что домены указывают на IP сервера:
   ```bash
   dig gdsfafdsdf.me
   dig erwerewrew.me
   ```

2. Проверьте, что порт 80 открыт:
   ```bash
   sudo ufw allow 80/tcp
   sudo ufw allow 443/tcp
   ```

3. Проверьте, что nginx работает:
   ```bash
   sudo systemctl status nginx
   ```

4. Проверьте логи:
   ```bash
   sudo tail -f /var/log/nginx/error.log
   ```

### Если нужно обновить конфигурацию вручную:

После получения сертификатов certbot автоматически обновит конфиги, но если нужно вручную:

1. Отредактируйте файлы:
   ```bash
   sudo nano /etc/nginx/sites-available/bingo-admin
   sudo nano /etc/nginx/sites-available/bingo-payment
   ```

2. Раскомментируйте HTTPS блоки

3. Проверьте и перезагрузите:
   ```bash
   sudo nginx -t
   sudo systemctl reload nginx
   ```

