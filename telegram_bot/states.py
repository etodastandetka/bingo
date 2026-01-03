from aiogram.fsm.state import State, StatesGroup

class DepositStates(StatesGroup):
    waiting_for_casino = State()
    waiting_for_account_id = State()
    waiting_for_amount = State()
    waiting_for_bank_selection = State()
    waiting_for_receipt = State()

class WithdrawStates(StatesGroup):
    waiting_for_casino = State()
    waiting_for_bank = State()
    waiting_for_phone = State()
    waiting_for_qr_photo = State()
    waiting_for_account_id = State()
    waiting_for_withdrawal_code = State()

class LanguageStates(StatesGroup):
    waiting_for_language = State()

