'use client';

import { useState, useRef, useEffect } from 'react';

interface DatePickerProps {
  value?: string | { from: string; to: string } | null;
  onChange?: (date: string | { from: string; to: string } | null) => void;
  placeholder?: string;
  range?: boolean;
}

const MONTHS_RU = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
];

const DAYS_RU = ['ВС', 'ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ'];

export function DatePicker({ 
  value, 
  onChange, 
  placeholder = 'Выберите период',
  range = true 
}: DatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [tempStartDate, setTempStartDate] = useState<Date | null>(null);
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (value) {
      if (typeof value === 'string') {
        const date = new Date(value);
        if (!isNaN(date.getTime())) {
          setStartDate(date);
          setEndDate(date);
          setCurrentMonth(date.getMonth());
          setCurrentYear(date.getFullYear());
        }
      } else if (value.from && value.to) {
        const from = new Date(value.from);
        const to = new Date(value.to);
        if (!isNaN(from.getTime()) && !isNaN(to.getTime())) {
          setStartDate(from);
          setEndDate(to);
          setCurrentMonth(from.getMonth());
          setCurrentYear(from.getFullYear());
        }
      }
    } else {
      setStartDate(null);
      setEndDate(null);
    }
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const formatDate = (date: Date | null): string => {
    if (!date) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const formatDisplayDate = (): string => {
    if (range && startDate && endDate) {
      return `${formatDate(startDate)} — ${formatDate(endDate)}`;
    }
    if (startDate) {
      return formatDate(startDate);
    }
    return '';
  };

  const getDaysInMonth = (month: number, year: number): number => {
    return new Date(year, month + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (month: number, year: number): number => {
    return new Date(year, month, 1).getDay();
  };

  const handleDateSelect = (day: number) => {
    const selectedDate = new Date(currentYear, currentMonth, day);
    
    if (range) {
      if (!tempStartDate) {
        setTempStartDate(selectedDate);
        setStartDate(selectedDate);
        setEndDate(null);
      } else {
        if (selectedDate < tempStartDate) {
          setStartDate(selectedDate);
          setEndDate(tempStartDate);
          setTempStartDate(null);
        } else {
          setEndDate(selectedDate);
          setTempStartDate(null);
        }
      }
    } else {
      setStartDate(selectedDate);
      setEndDate(selectedDate);
    }
  };

  const handleApply = () => {
    if (range && startDate && endDate) {
      onChange?.({ from: formatDate(startDate), to: formatDate(endDate) });
    } else if (startDate) {
      onChange?.(formatDate(startDate));
    }
    setIsOpen(false);
    setTempStartDate(null);
  };

  const handleReset = () => {
    setStartDate(null);
    setEndDate(null);
    setTempStartDate(null);
    onChange?.(null);
    setIsOpen(false);
  };

  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(currentYear - 1);
    } else {
      setCurrentMonth(currentMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(currentYear + 1);
    } else {
      setCurrentMonth(currentMonth + 1);
    }
  };

  const renderCalendar = () => {
    const daysInMonth = getDaysInMonth(currentMonth, currentYear);
    const firstDay = getFirstDayOfMonth(currentMonth, currentYear);
    const days: Array<{ day: number; isCurrentMonth: boolean; date: Date }> = [];

    const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
    const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;
    const prevMonthDays = getDaysInMonth(prevMonth, prevYear);
    for (let i = firstDay - 1; i >= 0; i--) {
      const day = prevMonthDays - i;
      days.push({ 
        day, 
        isCurrentMonth: false,
        date: new Date(prevYear, prevMonth, day)
      });
    }

    for (let i = 1; i <= daysInMonth; i++) {
      days.push({ 
        day: i, 
        isCurrentMonth: true,
        date: new Date(currentYear, currentMonth, i)
      });
    }

    const remainingDays = 42 - days.length;
    const nextMonth = currentMonth === 11 ? 0 : currentMonth + 1;
    const nextYear = currentMonth === 11 ? currentYear + 1 : currentYear;
    for (let i = 1; i <= remainingDays; i++) {
      days.push({ 
        day: i, 
        isCurrentMonth: false,
        date: new Date(nextYear, nextMonth, i)
      });
    }

    return days;
  };

  const isInRange = (date: Date): boolean => {
    if (!startDate || !endDate) return false;
    return date >= startDate && date <= endDate;
  };

  const isStartDate = (date: Date): boolean => {
    if (!startDate) return false;
    return date.getTime() === startDate.getTime();
  };

  const isEndDate = (date: Date): boolean => {
    if (!endDate) return false;
    return date.getTime() === endDate.getTime();
  };

  const isSelected = (date: Date): boolean => {
    if (!range) {
      return startDate?.getTime() === date.getTime();
    }
    return isStartDate(date) || isEndDate(date);
  };

  const calendarDays = renderCalendar();
  const hasSelection = range ? (startDate && endDate) : startDate;

  return (
    <div className="relative" ref={pickerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white cursor-pointer flex items-center justify-between hover:border-blue-500 transition-colors"
      >
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span className="text-gray-300">
            {formatDisplayDate() || placeholder}
          </span>
        </div>
        <svg
          className={`w-5 h-5 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 overflow-hidden">
          <div className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className="text-sm text-gray-400">Выберите период</span>
            </div>
            <div className="flex items-center justify-between mb-4">
              <button
                type="button"
                onClick={handlePrevMonth}
                className="rounded-lg p-2 text-white/70 transition hover:bg-white/10 hover:text-white"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <div className="flex items-center gap-2">
                <select
                  value={currentMonth}
                  onChange={(e) => setCurrentMonth(Number(e.target.value))}
                  className="rounded-lg border border-gray-700 bg-gray-900 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                >
                  {MONTHS_RU.map((month, index) => (
                    <option key={index} value={index} className="bg-gray-900">
                      {month}
                    </option>
                  ))}
                </select>
                <select
                  value={currentYear}
                  onChange={(e) => setCurrentYear(Number(e.target.value))}
                  className="rounded-lg border border-gray-700 bg-gray-900 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                >
                  {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - 5 + i).map((year) => (
                    <option key={year} value={year} className="bg-gray-900">
                      {year}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={handleNextMonth}
                className="rounded-lg p-2 text-white/70 transition hover:bg-white/10 hover:text-white"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>

            <div className="mb-4">
              <div className="grid grid-cols-7 gap-1 mb-2">
                {DAYS_RU.map((day) => (
                  <div key={day} className="p-2 text-center text-xs font-semibold text-gray-500">
                    {day}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-0.5">
                {calendarDays.map(({ day, isCurrentMonth, date }, index) => {
                  const selected = isSelected(date);
                  const inRange = range && isInRange(date);
                  const isStart = isStartDate(date);
                  const isEnd = isEndDate(date);
                  const isInRangeButNotEdge = inRange && !isStart && !isEnd;
                  
                  const positionInRow = index % 7;
                  const isFirstInRow = positionInRow === 0;
                  const isLastInRow = positionInRow === 6;
                  
                  return (
                    <button
                      key={index}
                      type="button"
                      onClick={() => handleDateSelect(day)}
                      disabled={!isCurrentMonth}
                      className={`
                        relative p-2.5 text-sm font-medium transition-all
                        ${!isCurrentMonth 
                          ? 'text-white/30 cursor-not-allowed' 
                          : selected
                          ? 'bg-blue-500 text-white font-bold shadow-lg shadow-blue-500/50 ring-2 ring-blue-400/50 z-10'
                          : isInRangeButNotEdge
                          ? 'bg-blue-500/15 text-white'
                          : 'text-white/90 hover:bg-white/10 hover:text-white'
                        }
                        ${isStart && range 
                          ? 'rounded-l-xl' 
                          : isEnd && range 
                          ? 'rounded-r-xl' 
                          : !inRange && isCurrentMonth
                          ? 'rounded-lg'
                          : ''
                        }
                        ${isInRangeButNotEdge && isFirstInRow ? 'rounded-l-none' : ''}
                        ${isInRangeButNotEdge && isLastInRow ? 'rounded-r-none' : ''}
                      `}
                    >
                      {day}
                      {isInRangeButNotEdge && (
                        <>
                          <span className="absolute inset-y-0 left-0 w-0.5 bg-blue-400/30" />
                          <span className="absolute inset-y-0 right-0 w-0.5 bg-blue-400/30" />
                        </>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {hasSelection && (
              <div className="mb-4 rounded-lg bg-blue-500/10 border border-blue-500/20 px-3 py-2 text-center">
                <p className="text-xs font-medium text-blue-300">Период выбран</p>
              </div>
            )}

            <div className="flex gap-2 pt-3 border-t border-gray-700">
              <button
                type="button"
                onClick={handleApply}
                disabled={!hasSelection}
                className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Применить
              </button>
              <button
                type="button"
                onClick={handleReset}
                className="px-4 py-2.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
              >
                Сбросить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

