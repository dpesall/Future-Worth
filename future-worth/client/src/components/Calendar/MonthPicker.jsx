import React, { useEffect, useMemo, useState, useRef } from 'react';
import './MonthPicker.scss';

const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const MonthPicker = ({ value, onSelect, onClose }) => {
  const [year, setYear] = useState(value?.getFullYear?.() || new Date().getFullYear());
  const [yearOpen, setYearOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    setYear(value?.getFullYear?.() || new Date().getFullYear());
  }, [value]);

  const selectedKey = useMemo(() => {
    if (!value) return '';
    return `${value.getFullYear()}-${value.getMonth()}`;
  }, [value]);

  const now = new Date();
  const currentKey = `${now.getFullYear()}-${now.getMonth()}`;
  const baseYear = now.getFullYear();
  const startYear = baseYear - 30;
  const years = useMemo(() => Array.from({ length: 61 }, (_, i) => startYear + i), [startYear]);
  const yearListRef = useRef(null);

  useEffect(() => {
    const onDocDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        onClose?.();
      }
    };
    document.addEventListener('mousedown', onDocDown);
    document.addEventListener('touchstart', onDocDown, { passive: true });
    return () => {
      document.removeEventListener('mousedown', onDocDown);
      document.removeEventListener('touchstart', onDocDown);
    };
  }, [onClose]);

  useEffect(() => {
    if (!yearOpen || !yearListRef.current) return;
    const container = yearListRef.current;
    const idx = years.findIndex((y) => y === year);
    if (idx < 0) return;
    const child = container.children[idx];
    if (!child) return;
    const offset = child.offsetTop - (container.clientHeight / 2) + (child.clientHeight / 2);
    container.scrollTop = Math.max(0, offset);
  }, [yearOpen, year, years]);

  return (
    <div ref={rootRef} className="month-picker" role="dialog" aria-label="Select start month" onClick={() => setYearOpen(false)}>
      <div className="month-picker__header">
        <button type="button" className="month-picker__nav" onClick={() => setYear((y) => y - 1)} aria-label="Previous year">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M15 19l-7-7 7-7" stroke="#CFE9D6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        <button type="button" className="month-picker__year" onClick={(e) => { e.stopPropagation(); setYearOpen((o) => !o); }} aria-haspopup="listbox" aria-expanded={yearOpen} aria-label="Select year">
          {year}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ marginLeft: 6 }}>
            <path d="M6 9l6 6 6-6" stroke="#CFE9D6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <button type="button" className="month-picker__nav" onClick={() => setYear((y) => y + 1)} aria-label="Next year">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9 5l7 7-7 7" stroke="#CFE9D6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
      </div>
      {yearOpen && (
        <div ref={yearListRef} className="month-picker__year-dropdown" role="listbox" aria-label="Select year" onClick={(e) => e.stopPropagation()}>
          {years.map((yr) => {
            const isSel = yr === year;
            const isCur = yr === now.getFullYear();
            return (
              <button
                key={yr}
                type="button"
                role="option"
                aria-selected={isSel}
                className={`month-picker__year-option ${isSel ? 'is-selected' : ''} ${isCur ? 'is-current' : ''}`}
                onClick={() => { setYear(yr); setYearOpen(false); }}
              >
                {yr}
              </button>
            );
          })}
        </div>
      )}
      <div className="month-picker__grid">
        {months.map((m, idx) => {
          const key = `${year}-${idx}`;
          const isSelected = key === selectedKey;
          const isCurrent = key === currentKey;
          return (
            <button
              key={m}
              type="button"
              className={`month-picker__month ${isSelected ? 'is-selected' : ''} ${isCurrent ? 'is-current' : ''}`}
              onClick={() => {
                const d = new Date();
                d.setFullYear(year);
                d.setMonth(idx, 1);
                d.setHours(0,0,0,0);
                onSelect?.(d);
                onClose?.();
              }}
            >
              {m}
            </button>
          );
        })}
      </div>
      <div className="month-picker__footer">
        <button type="button" className="month-picker__close" onClick={onClose}>Close</button>
      </div>
    </div>
  );
};

export default MonthPicker;
