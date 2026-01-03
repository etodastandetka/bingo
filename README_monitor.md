# Мониторинг сервера Ubuntu

Безопасный скрипт для демонстрации активности на сервере Ubuntu.

## Установка и запуск

### Базовый запуск (проверки каждые 30 секунд):
```bash
python3 server_monitor.py
```

### С настройками:
```bash
# Проверки каждые 60 секунд
python3 server_monitor.py --interval 60

# С указанием файлов логов
python3 server_monitor.py --log-file /var/log/server_activity.log --stats-file /var/log/server_stats.json
```

### Запуск в фоне (как демон):
```bash
# Запуск в screen
screen -S monitor
python3 server_monitor.py --interval 30
# Нажмите Ctrl+A, затем D для отсоединения

# Или через nohup
nohup python3 server_monitor.py --interval 30 > monitor_output.log 2>&1 &
```

### Запуск как systemd сервис:

Создайте файл `/etc/systemd/system/server-monitor.service`:
```ini
[Unit]
Description=Server Monitor Service
After=network.target

[Service]
Type=simple
User=your_user
WorkingDirectory=/path/to/Bingo
ExecStart=/usr/bin/python3 /path/to/Bingo/server_monitor.py --interval 30
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Затем:
```bash
sudo systemctl daemon-reload
sudo systemctl enable server-monitor
sudo systemctl start server-monitor
sudo systemctl status server-monitor
```

## Что делает скрипт:

1. ✅ Периодически проверяет состояние системы (uptime, диск, память)
2. ✅ Логирует всю активность в файл
3. ✅ Сохраняет статистику в JSON формате
4. ✅ Показывает работу системы
5. ✅ Безопасный - только чтение данных, без изменения системы

## Файлы:

- `server_activity.log` - логи всех проверок
- `server_stats.json` - статистика работы (uptime, количество проверок)

## Просмотр логов:

```bash
# Последние 50 строк
tail -n 50 server_activity.log

# В реальном времени
tail -f server_activity.log

# Статистика
cat server_stats.json | python3 -m json.tool
```

## Безопасность:

- ✅ Только чтение системной информации
- ✅ Не требует root прав (кроме некоторых проверок)
- ✅ Не изменяет файловую систему
- ✅ Не делает внешние запросы
- ✅ Локальная работа

