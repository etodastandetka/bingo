#!/usr/bin/env python3
"""
Безопасный мониторинг-сервис для Ubuntu сервера
Показывает активность: проверки статуса, логирование, статистику
"""

import time
import json
import subprocess
import sys
import threading
import random
from datetime import datetime
from pathlib import Path
import os

# ============================================================================
# НАСТРОЙКИ БАНЕРА - измените текст здесь
# ============================================================================
BANNER_TEXT = """
 /$$       /$$                              
| $$      |__/                              
| $$$$$$$  /$$ /$$$$$$$   /$$$$$$   /$$$$$$ 
| $$__  $$| $$| $$__  $$ /$$__  $$ /$$__  $$
| $$  \ $$| $$| $$  \ $$| $$  \ $$| $$  \ $$
| $$  | $$| $$| $$  | $$| $$  | $$| $$  | $$
| $$$$$$$/| $$| $$  | $$|  $$$$$$$|  $$$$$$/
|_______/ |__/|__/  |__/ \____  $$ \______/ 
                         /$$  \ $$          
                        |  $$$$$$/          
                         \______/           
"""

# Частота показа банера (каждые N проверок)
BANNER_SHOW_EVERY = 3  # Показывать каждые 3 проверки

# ============================================================================
# РАЗНЫЕ ТЕКСТЫ ДЛЯ РОТАЦИИ (чтобы не было спама одинаковых сообщений)
# ============================================================================

# Разные сообщения для проверки uptime
UPTIME_MESSAGES = [
    'Анализ времени работы системы...',
    'Проверка uptime сервера...',
    'Сбор данных о времени работы...',
    'Мониторинг работоспособности...',
    'Проверка активности системы...',
    'Анализ времени безотказной работы...',
    'Сканирование статуса сервера...',
]

# Разные сообщения для проверки диска
DISK_MESSAGES = [
    'Проверка дискового пространства...',
    'Анализ использования диска...',
    'Сканирование файловой системы...',
    'Мониторинг свободного места...',
    'Проверка объема хранилища...',
    'Анализ дисковых ресурсов...',
    'Проверка состояния накопителя...',
]

# Разные сообщения для проверки памяти
MEMORY_MESSAGES = [
    'Проверка оперативной памяти...',
    'Анализ использования RAM...',
    'Сканирование памяти системы...',
    'Мониторинг ресурсов памяти...',
    'Проверка загрузки памяти...',
    'Анализ состояния RAM...',
    'Проверка доступной памяти...',
]

# Разные сообщения для общего статуса проверки (нейтральные)
CHECK_MESSAGES = [
    'Выполнение системных задач...',
    'Обработка фоновых процессов...',
    'Обновление системных метрик...',
    'Синхронизация данных...',
    'Выполнение плановых операций...',
    'Обработка очереди задач...',
    'Обслуживание системы...',
    'Выполнение автоматических процедур...',
]

# Разные сообщения ожидания
WAITING_MESSAGES = [
    'Подготовка к следующей проверке...',
    'Ожидание следующего цикла...',
    'Пауза между проверками...',
    'Система в режиме ожидания...',
    'Переход к следующей итерации...',
    'Ожидание следующего сканирования...',
]

# Разные стили спиннеров для ротации
SPINNER_STYLES = ['dots2', 'dots3', 'dots4', 'dots8', 'dots9', 'dots10', 'line', 'triangle']

# ANSI цвета для терминала
class Colors:
    RESET = '\033[0m'
    BOLD = '\033[1m'
    DIM = '\033[2m'
    
    # Цвета
    BLACK = '\033[30m'
    RED = '\033[31m'
    GREEN = '\033[32m'
    YELLOW = '\033[33m'
    BLUE = '\033[34m'
    MAGENTA = '\033[35m'
    CYAN = '\033[36m'
    WHITE = '\033[37m'
    
    # Яркие цвета
    BRIGHT_BLACK = '\033[90m'
    BRIGHT_RED = '\033[91m'
    BRIGHT_GREEN = '\033[92m'
    BRIGHT_YELLOW = '\033[93m'
    BRIGHT_BLUE = '\033[94m'
    BRIGHT_MAGENTA = '\033[95m'
    BRIGHT_CYAN = '\033[96m'
    BRIGHT_WHITE = '\033[97m'

class Spinner:
    """Красивый спиннер для индикации загрузки"""
    SPINNERS = {
        'dots': ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
        'dots2': ['⣾', '⣽', '⣻', '⢿', '⡿', '⣟', '⣯', '⣷'],
        'dots3': ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
        'dots4': ['⠄', '⠆', '⠇', '⠋', '⠙', '⠸', '⠰', '⠠', '⠰', '⠸', '⠙', '⠋', '⠇', '⠆'],
        'dots5': ['⠋', '⠙', '⠚', '⠞', '⠖', '⠦', '⠴', '⠲', '⠳', '⠓'],
        'dots6': ['⠁', '⠂', '⠄', '⠂'],
        'dots7': ['⢄', '⢂', '⢁', '⡁', '⡈', '⡐', '⡠'],
        'dots8': ['⢀', '⡀', '⡄', '⡎', '⡮', '⡾', '⡿', '⣿', '⡿', '⡾', '⡮', '⡎', '⡄', '⡀'],
        'dots9': ['⣾', '⣽', '⣻', '⢿', '⡿', '⣟', '⣯', '⣷'],
        'dots10': ['⣷', '⣯', '⣟', '⡿', '⢿', '⣻', '⣽', '⣾'],
        'dots11': ['⠁', '⠂', '⠄', '⠂'],
        'line': ['-', '\\', '|', '/'],
        'triangle': ['◢', '◣', '◤', '◥'],
        'arrow': ['←', '↖', '↑', '↗', '→', '↘', '↓', '↙'],
        'clock': ['🕐', '🕑', '🕒', '🕓', '🕔', '🕕', '🕖', '🕗', '🕘', '🕙', '🕚', '🕛'],
    }
    
    def __init__(self, style='dots2', color=Colors.BRIGHT_CYAN, message=''):
        self.style = style
        self.color = color
        self.message = message
        self.frames = self.SPINNERS.get(style, self.SPINNERS['dots2'])
        self.frame_index = 0
        self.active = False
        self.thread = None
        
    def _spin(self):
        """Внутренний метод для анимации"""
        while self.active:
            frame = self.frames[self.frame_index % len(self.frames)]
            print(f'\r{self.color}{frame}{Colors.RESET} {self.message}', end='', flush=True)
            self.frame_index += 1
            time.sleep(0.1)
    
    def start(self, message=None):
        """Запуск спиннера"""
        if message:
            self.message = message
        self.active = True
        self.thread = threading.Thread(target=self._spin, daemon=True)
        self.thread.start()
    
    def stop(self, final_message=''):
        """Остановка спиннера"""
        self.active = False
        if self.thread:
            self.thread.join(timeout=0.2)
        print(f'\r{" " * (len(self.message) + 5)}{Colors.RESET}', end='')  # Очистка строки
        if final_message:
            print(f'\r{final_message}')
        else:
            print()

class ProgressBar:
    """Прогресс-бар для визуализации процесса"""
    def __init__(self, total=100, width=50, color=Colors.BRIGHT_GREEN):
        self.total = total
        self.width = width
        self.color = color
        self.current = 0
    
    def update(self, value, message=''):
        """Обновление прогресс-бара"""
        self.current = min(max(0, value), self.total)
        percent = (self.current / self.total) * 100
        filled = int(self.width * self.current / self.total)
        bar = '█' * filled + '░' * (self.width - filled)
        status = f'{self.color}{bar}{Colors.RESET} {percent:.1f}%'
        if message:
            status += f' {message}'
        print(f'\r{status}', end='', flush=True)
    
    def finish(self, message=''):
        """Завершение прогресс-бара"""
        self.update(self.total)
        if message:
            print(f' {message}')
        else:
            print()

class ServerMonitor:
    def __init__(self, log_file='server_activity.log', stats_file='server_stats.json'):
        self.log_file = log_file
        self.stats_file = stats_file
        self.start_time = datetime.now()
        self.check_count = 0
        self.use_color = sys.stdout.isatty()  # Проверка поддержки цветов
        
        # Счетчики для ротации сообщений (чтобы не повторялись)
        self.uptime_msg_index = 0
        self.disk_msg_index = 0
        self.memory_msg_index = 0
        self.check_msg_index = 0
        self.waiting_msg_index = 0
    
    def get_uptime_message(self):
        """Получить следующее сообщение для uptime (ротация)"""
        msg = UPTIME_MESSAGES[self.uptime_msg_index % len(UPTIME_MESSAGES)]
        self.uptime_msg_index += 1
        return msg
    
    def get_disk_message(self):
        """Получить следующее сообщение для диска (ротация)"""
        msg = DISK_MESSAGES[self.disk_msg_index % len(DISK_MESSAGES)]
        self.disk_msg_index += 1
        return msg
    
    def get_memory_message(self):
        """Получить следующее сообщение для памяти (ротация)"""
        msg = MEMORY_MESSAGES[self.memory_msg_index % len(MEMORY_MESSAGES)]
        self.memory_msg_index += 1
        return msg
    
    def get_check_message(self):
        """Получить следующее сообщение для проверки (ротация)"""
        msg = CHECK_MESSAGES[self.check_msg_index % len(CHECK_MESSAGES)]
        self.check_msg_index += 1
        return msg
    
    def get_waiting_message(self):
        """Получить следующее сообщение ожидания (ротация)"""
        msg = WAITING_MESSAGES[self.waiting_msg_index % len(WAITING_MESSAGES)]
        self.waiting_msg_index += 1
        return msg
    
    def get_random_spinner_style(self):
        """Получить случайный стиль спиннера"""
        return random.choice(SPINNER_STYLES)
        
    def _get_color(self, color_code):
        """Получение цветового кода или пустой строки"""
        return color_code if self.use_color else ''
    
    def log(self, message, level='INFO', color=None):
        """Логирование активности с поддержкой цветов"""
        timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        
        # Цвета для уровней
        level_colors = {
            'INFO': Colors.BRIGHT_CYAN,
            'SUCCESS': Colors.BRIGHT_GREEN,
            'WARNING': Colors.BRIGHT_YELLOW,
            'ERROR': Colors.BRIGHT_RED,
            'DEBUG': Colors.BRIGHT_BLUE
        }
        
        log_color = color or level_colors.get(level, '')
        reset = Colors.RESET if self.use_color else ''
        
        log_entry = f"[{timestamp}] [{level}] {message}\n"
        
        # В файл пишем без цветов
        with open(self.log_file, 'a', encoding='utf-8') as f:
            f.write(log_entry)
        
        # В консоль с цветами
        colored_msg = f"{self._get_color(log_color)}[{timestamp}] {message}{reset}"
        print(colored_msg)
    
    def print_banner(self):
        """Красивый баннер при запуске"""
        banner = f"""
{self._get_color(Colors.BRIGHT_CYAN)}{'='*60}{Colors.RESET}
{self._get_color(Colors.BOLD)}{Colors.BRIGHT_GREEN}    🚀 СИСТЕМА МОНИТОРИНГА СЕРВЕРА{Colors.RESET}
{self._get_color(Colors.BRIGHT_CYAN)}{'='*60}{Colors.RESET}
"""
        print(banner)
    
    def show_status_banner(self):
        """Показ банера статуса в темно-синем цвете"""
        # Темно-синий цвет: используем насыщенный темно-синий через 256-цветную палитру
        # \033[38;5;18m = темно-синий, \033[38;5;19m = темно-синий 2, \033[38;5;20m = темно-синий 3
        # Если не поддерживается, используем обычный BLUE
        dark_blue_256 = '\033[38;5;18m' if self.use_color else ''
        dark_blue_fallback = Colors.BLUE if self.use_color else ''
        dark_blue = dark_blue_256 if self.use_color else dark_blue_fallback
        bold = Colors.BOLD if self.use_color else ''
        reset = Colors.RESET if self.use_color else ''
        
        # Применяем темно-синий цвет к каждой строке банера
        banner_lines = BANNER_TEXT.strip().split('\n')
        colored_banner = '\n'.join([
            f"{self._get_color(dark_blue)}{self._get_color(bold)}{line}{reset}"
            for line in banner_lines
        ])
        
        print()  # Пустая строка перед банером
        print(colored_banner)
        print()  # Пустая строка после банера
    
    def check_system_health(self):
        """Безопасная проверка здоровья системы с красивой анимацией"""
        checks = {
            'uptime': None,
            'disk_usage': None,
            'memory_usage': None,
            'timestamp': datetime.now().isoformat()
        }
        
        # Создаем прогресс-бар
        progress = ProgressBar(total=100, width=30, color=Colors.BRIGHT_GREEN)
        
        # Проверка uptime с анимацией (используем разные сообщения)
        uptime_msg = self.get_uptime_message()
        spinner1 = Spinner(style=self.get_random_spinner_style(), color=Colors.BRIGHT_CYAN, message=uptime_msg)
        spinner1.start()
        try:
            result = subprocess.run(['uptime'], capture_output=True, text=True, timeout=5)
            checks['uptime'] = result.stdout.strip()
            time.sleep(0.3 + random.uniform(0, 0.2))  # Имитация работы с вариацией
        except Exception as e:
            checks['uptime'] = f"Error: {str(e)}"
        spinner1.stop(f"{self._get_color(Colors.BRIGHT_GREEN)}[OK]{Colors.RESET} Операция завершена")
        progress.update(33, 'Uptime')
        
        # Проверка диска с анимацией (используем разные сообщения)
        disk_msg = self.get_disk_message()
        spinner2 = Spinner(style=self.get_random_spinner_style(), color=Colors.BRIGHT_YELLOW, message=disk_msg)
        spinner2.start()
        try:
            result = subprocess.run(['df', '-h', '/'], capture_output=True, text=True, timeout=5)
            checks['disk_usage'] = result.stdout.strip().split('\n')[1] if result.stdout else "N/A"
            time.sleep(0.3 + random.uniform(0, 0.2))
        except Exception as e:
            checks['disk_usage'] = f"Error: {str(e)}"
        spinner2.stop(f"{self._get_color(Colors.BRIGHT_GREEN)}[OK]{Colors.RESET} Операция завершена")
        progress.update(66, 'Диск')
        
        # Проверка памяти с анимацией (используем разные сообщения)
        memory_msg = self.get_memory_message()
        spinner3 = Spinner(style=self.get_random_spinner_style(), color=Colors.BRIGHT_MAGENTA, message=memory_msg)
        spinner3.start()
        try:
            result = subprocess.run(['free', '-h'], capture_output=True, text=True, timeout=5)
            if result.stdout:
                lines = result.stdout.strip().split('\n')
                checks['memory_usage'] = lines[1] if len(lines) > 1 else "N/A"
            time.sleep(0.3 + random.uniform(0, 0.2))
        except Exception as e:
            checks['memory_usage'] = f"Error: {str(e)}"
        spinner3.stop(f"{self._get_color(Colors.BRIGHT_GREEN)}[OK]{Colors.RESET} Операция завершена")
        progress.update(100, 'Память')
        progress.finish()
        
        return checks
    
    def update_stats(self):
        """Обновление статистики"""
        uptime = datetime.now() - self.start_time
        stats = {
            'start_time': self.start_time.isoformat(),
            'current_time': datetime.now().isoformat(),
            'uptime_seconds': int(uptime.total_seconds()),
            'uptime_formatted': str(uptime),
            'total_checks': self.check_count,
            'checks_per_minute': round(self.check_count / (uptime.total_seconds() / 60), 2) if uptime.total_seconds() > 0 else 0
        }
        
        with open(self.stats_file, 'w', encoding='utf-8') as f:
            json.dump(stats, f, indent=2, ensure_ascii=False)
        
        return stats
    
    def run_monitoring(self, interval=30):
        """Запуск мониторинга с указанным интервалом (в секундах)"""
        self.print_banner()
        
        # Показываем банер статуса сразу при запуске
        self.show_status_banner()
        
        # Нейтральные системные сообщения (без упоминания мониторинга)
        print(f"{self._get_color(Colors.BRIGHT_GREEN)}[OK] Системные процессы инициализированы{Colors.RESET}")
        print(f"{self._get_color(Colors.BRIGHT_BLUE)}[INFO] Фоновые задачи активны{Colors.RESET}")
        print(f"{self._get_color(Colors.BRIGHT_CYAN)}[INFO] Автоматическое обслуживание запущено{Colors.RESET}")
        print()
        
        try:
            while True:
                self.check_count += 1
                
                # Нейтральный вывод (используем разные сообщения)
                check_msg = self.get_check_message()
                # Убираем эмодзи и делаем похоже на системные логи
                print(f"\n{self._get_color(Colors.DIM)}{'─'*60}{Colors.RESET}")
                sys_msg = check_msg.replace('🔍', '').strip()
                self.log(f"{self._get_color(Colors.BRIGHT_CYAN)}[TASK]{Colors.RESET} {sys_msg}", level='INFO')
                print(f"{self._get_color(Colors.DIM)}{'─'*60}{Colors.RESET}\n")
                
                # Проверка здоровья системы (с анимацией внутри)
                health = self.check_system_health()
                
                print()
                # Нейтральный вывод результатов (без упоминания "проверка")
                print(f"{self._get_color(Colors.DIM)}{'─'*60}{Colors.RESET}")
                print(f"{self._get_color(Colors.BRIGHT_GREEN)}[OK] Системные метрики обновлены{Colors.RESET}")
                print(f"{self._get_color(Colors.DIM)}{'─'*60}{Colors.RESET}")
                
                print(f"{self._get_color(Colors.DIM)}Uptime:{Colors.RESET}     {health['uptime']}")
                print(f"{self._get_color(Colors.DIM)}Disk:{Colors.RESET}       {health['disk_usage']}")
                print(f"{self._get_color(Colors.DIM)}Memory:{Colors.RESET}    {health['memory_usage']}")
                
                # Обновление статистики (скрыто, только в лог файл)
                stats = self.update_stats()
                # Не показываем статистику в консоль, только в файл
                print(f"{self._get_color(Colors.DIM)}{'─'*60}{Colors.RESET}")
                
                # Показ банера статуса (каждые N проверок)
                if self.check_count % BANNER_SHOW_EVERY == 0:
                    self.show_status_banner()
                
                # Ожидание следующей итерации (нейтральный вывод)
                if interval > 0:
                    # Минимальный вывод, без явных упоминаний
                    spinner_chars = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
                    for remaining in range(interval, 0, -1):
                        mins, secs = divmod(remaining, 60)
                        timer_display = f'{mins:02d}:{secs:02d}'
                        spinner_char = spinner_chars[remaining % len(spinner_chars)]
                        # Нейтральные сообщения
                        messages = [
                            f'Ожидание следующего цикла: {timer_display}',
                            f'Фоновые процессы активны: {timer_display}',
                            f'Система в режиме ожидания: {timer_display}',
                            f'Следующая итерация: {timer_display}',
                        ]
                        message = messages[remaining % len(messages)]
                        print(f'\r{self._get_color(Colors.BRIGHT_BLACK)}{spinner_char}{Colors.RESET} {self._get_color(Colors.DIM)}{message}{Colors.RESET}', end='', flush=True)
                        time.sleep(1)
                    print(f'\r{" " * 80}', end='')  # Очистка строки
                    print()
                
        except KeyboardInterrupt:
            print(f"\n{self._get_color(Colors.BRIGHT_YELLOW)}[INFO] Процесс завершен{Colors.RESET}\n")
            self.log("Процесс завершен пользователем", level='WARNING')
        except Exception as e:
            print(f"\n{self._get_color(Colors.BRIGHT_RED)}[ERROR] Системная ошибка: {str(e)}{Colors.RESET}\n")
            self.log(f"Ошибка: {str(e)}", level='ERROR')
            sys.exit(1)

def main():
    """Главная функция"""
    import argparse
    
    parser = argparse.ArgumentParser(description='Безопасный мониторинг сервера Ubuntu')
    parser.add_argument('--interval', type=int, default=30, 
                       help='Интервал проверок в секундах (по умолчанию: 30)')
    parser.add_argument('--log-file', type=str, default='server_activity.log',
                       help='Файл для логов (по умолчанию: server_activity.log)')
    parser.add_argument('--stats-file', type=str, default='server_stats.json',
                       help='Файл для статистики (по умолчанию: server_stats.json)')
    
    args = parser.parse_args()
    
    monitor = ServerMonitor(log_file=args.log_file, stats_file=args.stats_file)
    monitor.run_monitoring(interval=args.interval)

if __name__ == '__main__':
    main()

