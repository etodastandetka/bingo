#!/usr/bin/env python3
"""
Скрипт для автоматического удаления заявок из базы данных PostgreSQL
(без интерактивного подтверждения)
Удаляет заявки с указанными ID из таблицы requests
"""

import psycopg2
import sys

# Параметры подключения к базе данных
DB_CONFIG = {
    'host': '92.51.38.85',
    'port': 5432,
    'database': 'default_db',
    'user': 'gen_user',
    'password': 'dastan10dz'
}

# ID заявок для удаления
REQUEST_IDS = [22, 44, 23]


def delete_requests(request_ids, auto_confirm=False):
    """
    Удаляет заявки с указанными ID из базы данных
    
    Args:
        request_ids: список ID заявок для удаления
        auto_confirm: если True, удаляет без подтверждения
    """
    conn = None
    try:
        # Подключение к базе данных
        print(f"🔌 Подключение к базе данных {DB_CONFIG['host']}:{DB_CONFIG['port']}...")
        conn = psycopg2.connect(**DB_CONFIG)
        cursor = conn.cursor()
        
        # Проверяем существование заявок перед удалением
        print(f"\n📋 Проверка заявок перед удалением...")
        placeholders = ','.join(['%s'] * len(request_ids))
        check_query = f"""
            SELECT id, user_id, request_type, status, amount, created_at
            FROM requests
            WHERE id IN ({placeholders})
            ORDER BY id
        """
        cursor.execute(check_query, request_ids)
        existing_requests = cursor.fetchall()
        
        if not existing_requests:
            print("❌ Заявки с указанными ID не найдены в базе данных")
            return False
        
        print(f"\n📊 Найдено заявок для удаления: {len(existing_requests)}")
        print("-" * 80)
        for req in existing_requests:
            req_id, user_id, req_type, status, amount, created_at = req
            amount_str = f"{float(amount):.2f} KGS" if amount else "N/A"
            print(f"  ID: {req_id} | User: {user_id} | Type: {req_type} | Status: {status} | Amount: {amount_str} | Created: {created_at}")
        print("-" * 80)
        
        # Подтверждение удаления (если не автоматический режим)
        if not auto_confirm:
            print(f"\n⚠️  ВНИМАНИЕ: Вы собираетесь удалить {len(existing_requests)} заявок!")
            confirm = input("Продолжить? (yes/no): ").strip().lower()
            
            if confirm not in ['yes', 'y', 'да', 'д']:
                print("❌ Удаление отменено")
                return False
        
        # Удаление заявок
        print(f"\n🗑️  Удаление заявок...")
        delete_query = f"""
            DELETE FROM requests
            WHERE id IN ({placeholders})
        """
        cursor.execute(delete_query, request_ids)
        deleted_count = cursor.rowcount
        
        # Подтверждение изменений
        conn.commit()
        
        print(f"✅ Успешно удалено {deleted_count} заявок")
        
        # Проверяем, что заявки действительно удалены
        cursor.execute(check_query, request_ids)
        remaining = cursor.fetchall()
        
        if remaining:
            print(f"⚠️  Предупреждение: {len(remaining)} заявок все еще существуют в базе данных")
            for req in remaining:
                print(f"  - ID: {req[0]}")
            return False
        else:
            print("✅ Все заявки успешно удалены из базы данных")
            return True
        
    except psycopg2.Error as e:
        if conn:
            conn.rollback()
        print(f"❌ Ошибка базы данных: {e}")
        return False
    except Exception as e:
        if conn:
            conn.rollback()
        print(f"❌ Неожиданная ошибка: {e}")
        return False
    finally:
        if conn:
            cursor.close()
            conn.close()
            print("\n🔌 Соединение с базой данных закрыто")


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description='Удаление заявок из базы данных')
    parser.add_argument('--auto', action='store_true', help='Автоматическое удаление без подтверждения')
    parser.add_argument('--ids', nargs='+', type=int, help='ID заявок для удаления (через пробел)')
    
    args = parser.parse_args()
    
    # Используем переданные ID или ID по умолчанию
    request_ids = args.ids if args.ids else REQUEST_IDS
    
    print("=" * 80)
    print("🗑️  СКРИПТ УДАЛЕНИЯ ЗАЯВОК ИЗ БАЗЫ ДАННЫХ")
    print("=" * 80)
    print(f"\n📝 Заявки для удаления: {request_ids}")
    if args.auto:
        print("⚡ Режим: автоматический (без подтверждения)")
    print()
    
    success = delete_requests(request_ids, auto_confirm=args.auto)
    
    print("\n" + "=" * 80)
    if success:
        print("✅ Скрипт завершен успешно")
    else:
        print("⚠️  Скрипт завершен с предупреждениями")
    print("=" * 80)
    
    sys.exit(0 if success else 1)

