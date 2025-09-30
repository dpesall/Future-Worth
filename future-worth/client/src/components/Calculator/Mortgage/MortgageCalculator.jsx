import React, { useMemo, useState, useDeferredValue, memo, useEffect, useRef, useLayoutEffect } from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip } from 'recharts';
import './MortgageCalculator.scss';
import MonthPicker from '../../Calendar/MonthPicker';

// Utility helpers
const clamp = (v, min, max) => Math.min(Math.max(v ?? 0, min), max);
const usd = (n) => n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const usdCents = (n) => n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });

function monthlyPI(principal, aprPct, termMonths) {
  const r = aprPct / 100 / 12;
  if (termMonths <= 0) return 0;
  if (r === 0) return principal / termMonths;
  const a = Math.pow(1 + r, termMonths);
  return principal * (r * a) / (a - 1);
}

function buildSchedule({
  price,
  downPaymentAmt,
  apr,
  termYears,
  taxRatePct,
  insuranceAnnual,
  hoaMonthly,
  pmiAnnualRatePct,
  extraMonthly,
  startDate,
}) {
  const months = Math.round(termYears * 12);
  const loan = Math.max(price - downPaymentAmt, 0);
  const r = apr / 100 / 12;
  const paymentPI = monthlyPI(loan, apr, months);
  const taxMonthly = (price * (taxRatePct / 100)) / 12;
  const insMonthly = insuranceAnnual / 12;
  const pmiMonthlyBase = (pmiAnnualRatePct / 100) * loan / 12;
  const ltvCutoff = 0.80 * price;

  let bal = loan;
  let totalInterest = 0;
  let totalPrincipal = 0;
  let totalPMI = 0;
  let totalEscrow = 0;
  let totalPaid = 0;
  let pmiEndedAt = null;

  const schedule = [];

  let date = startDate ? new Date(startDate) : new Date();
  date.setDate(1);

  for (let i = 1; bal > 0 && i <= months + 600; i++) {
    const interest = bal * r;
    let principal = paymentPI - interest;

    if (paymentPI === 0 && r === 0) {
      principal = Math.min(bal, loan / months);
    }

    let pmi = bal > ltvCutoff ? pmiMonthlyBase : 0;
    if (pmi > 0 && bal - (principal + extraMonthly) <= ltvCutoff && pmiEndedAt == null) {
      pmiEndedAt = i; // PMI ends after this payment
    }

    let appliedExtra = extraMonthly;
    let totalApplied = principal + appliedExtra;
    if (totalApplied > bal) {
      appliedExtra = Math.max(0, bal - principal);
      totalApplied = principal + appliedExtra;
    }

    let newBal = bal - totalApplied;
    if (newBal < 0.01) {
      // Snap very small residuals to zero to avoid negative balances from floating point
      newBal = 0;
    }

    const escrow = taxMonthly + insMonthly + hoaMonthly;
    const total = principal + interest + appliedExtra + pmi + escrow;

    schedule.push({
      idx: i,
      date: new Date(date),
      beginningBalance: bal,
      principal,
      interest,
      extra: appliedExtra,
      pmi,
      escrow,
      endingBalance: newBal,
      total,
    });

    totalInterest += interest;
    totalPrincipal += principal + appliedExtra;
    totalPMI += pmi;
    totalEscrow += escrow;
    totalPaid += total;

    bal = newBal;
    // next month
    date.setMonth(date.getMonth() + 1);
  }

  const payoff = schedule[schedule.length - 1]?.date ?? null;

  return {
    schedule,
    paymentPI,
    escrow: { taxMonthly, insMonthly, hoaMonthly },
    totals: { totalInterest, totalPrincipal, totalPMI, totalEscrow, totalPaid },
    payoff,
    pmiEndedAt,
    loan,
  };
}

// Recharts will render the charts with richer interactivity

function NumericInput({
  value,
  onCommitNumber,
  allowDecimal = false,
  min = undefined,
  max = undefined,
  precision = undefined,
  groupThousands = false,
  syncKey,
  shouldCommitOnBlur,
  ariaLabel,
  placeholder,
}) {
  const formatFromValue = (v) => {
    if (v == null) return '';
    if (precision != null && Number.isFinite(v)) return Number(v).toFixed(precision);
    return String(v);
  };

  const [text, setText] = useState(formatFromValue(value));
  const [focused, setFocused] = useState(false);
  const inputRef = useRef(null);
  const desiredCaretRef = useRef(null);

  useEffect(() => {
    if (!focused) setText(formatFromValue(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, focused]);
  // Force sync when external key changes (e.g., mode toggle)
  useLayoutEffect(() => {
    // Sync immediately on mode toggles before paint to avoid visible lag
    setText(formatFromValue(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncKey]);

  const formatThousands = (digits) => {
    if (!groupThousands) return digits;
    if (!digits) return '';
    return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  };

  const countDigitsLeftOf = (str, caret) => {
    let c = 0;
    for (let i = 0; i < Math.max(0, caret); i++) if (/\d/.test(str[i])) c++;
    return c;
  };
  const caretFromDigitsLeft = (str, digitsLeft) => {
    if (digitsLeft <= 0) return 0;
    let c = 0;
    for (let i = 0; i < str.length; i++) {
      if (/\d/.test(str[i])) c++;
      if (c === digitsLeft) return i + 1;
    }
    return str.length;
  };

  const normalize = (raw) => {
    let s = String(raw ?? '');
    // allow digits and optional dot
    s = allowDecimal ? s.replace(/[^0-9.]/g, '') : s.replace(/[^0-9]/g, '');
    if (allowDecimal) {
      // keep only first dot
      const firstDot = s.indexOf('.');
      if (firstDot !== -1) {
        s = s.slice(0, firstDot + 1) + s.slice(firstDot + 1).replace(/\./g, '');
      }
      // if just a dot, treat as 0.
      if (s === '.') s = '0.';
      // remove leading zeros unless followed by a dot (keep 0.)
      if (s.length > 1 && !s.startsWith('0.')) {
        s = s.replace(/^0+(?=\d)/, '');
      }
    } else {
      // remove leading zeros (but allow single zero)
      if (s.length > 1) s = s.replace(/^0+(?=\d)/, '');
    }
    if (!allowDecimal && groupThousands) {
      // only digits for integer grouping; commas added in format stage
      return s;
    }
    return s;
  };

  const commit = (s) => {
    // Sanitize on commit to handle formatted strings with commas
    let out = normalize(s);
    if (out === '' || out === '.' || out === '-') out = '0';
    let n = allowDecimal ? parseFloat(out) : parseInt(out, 10);
    if (!Number.isFinite(n)) n = 0;
    if (min != null) n = Math.max(min, n);
    if (max != null) n = Math.min(max, n);
    if (onCommitNumber) onCommitNumber(n);
    setText(formatFromValue(n));
  };

  useLayoutEffect(() => {
    const pos = desiredCaretRef.current;
    if (pos != null && inputRef.current) {
      const el = inputRef.current;
      requestAnimationFrame(() => {
        try { el.setSelectionRange(pos, pos); } catch {}
      });
      desiredCaretRef.current = null;
    }
  });

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode={allowDecimal ? 'decimal' : 'numeric'}
      aria-label={ariaLabel}
      placeholder={placeholder}
      value={allowDecimal || !groupThousands ? text : formatThousands(text)}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        setFocused(false);
        const shouldCommit = typeof shouldCommitOnBlur === 'function' ? shouldCommitOnBlur(e) : true;
        if (shouldCommit) {
          commit(e.target.value);
        } else {
          // Re-sync display with external value without committing
          setText(formatFromValue(value));
        }
      }}
      onChange={(e) => {
        const el = e.target;
        const raw = el.value;
        if (!allowDecimal && groupThousands) {
          // compute digits-left before caret in old formatted value
          const digitsLeft = countDigitsLeftOf(raw, el.selectionStart);
          const s = normalize(raw);
          setText(s);
          // place caret at same digits-left position after formatting
          const formatted = formatThousands(s);
          desiredCaretRef.current = caretFromDigitsLeft(formatted, digitsLeft);
        } else {
          const s = normalize(raw);
          setText(s);
        }
      }}
      onKeyDown={(e) => {
        // prevent scientific notation chars
        if (["e", "E", "+", "-"].includes(e.key)) e.preventDefault();
        if (!allowDecimal && groupThousands && (e.key === 'Backspace' || e.key === 'Delete')) {
          const el = e.currentTarget;
          const value = el.value;
          const selStart = el.selectionStart ?? 0;
          const selEnd = el.selectionEnd ?? selStart;
          const digitsOnly = value.replace(/[^0-9]/g, '');
          // Map caret to digit index
          const startDigits = countDigitsLeftOf(value, selStart);
          const endDigits = countDigitsLeftOf(value, selEnd);
          let from = startDigits;
          let to = endDigits;
          if (selStart === selEnd) {
            if (e.key === 'Backspace') {
              from = Math.max(0, startDigits - 1);
              to = startDigits;
            }
            if (e.key === 'Delete') {
              from = startDigits;
              to = Math.min(digitsOnly.length, startDigits + 1);
            }
          }
          if (from !== to) {
            e.preventDefault();
            const newDigits = digitsOnly.slice(0, from) + digitsOnly.slice(to);
            setText(newDigits);
            const formatted = formatThousands(newDigits);
            const nextDigitsLeft = e.key === 'Backspace' ? from : from; // caret stays at from
            desiredCaretRef.current = caretFromDigitsLeft(formatted, nextDigitsLeft);
          }
        }
      }}
    />
  );
}

const DonutCard = memo(function DonutCard({ segments, paymentTotal }) {
  const [active, setActive] = useState(null);
  return (
    <div>
            <div style={{ width: '100%', height: 180, position: 'relative' }}>
        <ResponsiveContainer>
          <PieChart>
            <Pie
              data={segments}
              dataKey="value"
              nameKey="label"
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={90}
              // Use Recharts default pie animation for entry
              onMouseEnter={(_, idx) => setActive(segments[idx])}
              onMouseLeave={() => setActive(null)}
            >
              {segments.map((entry, index) => {
                const isActive = active && active.label === entry.label;
                return (
                  <Cell
                    key={`cell-${index}`}
                    fill={entry.color}
                    stroke={isActive ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.2)'}
                    strokeWidth={isActive ? 2 : 1}
                  />
                );
              })}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="mortgage-calculator__donut-center" aria-hidden>
          {active ? (
            <>
              <div className="mortgage-calculator__donut-center-label">{active.label}</div>
              <div className="mortgage-calculator__donut-center-value">{usdCents(active.value)}</div>
            </>
          ) : (
            <>
              <div className="mortgage-calculator__donut-center-label">Payment</div>
              <div className="mortgage-calculator__donut-center-value">{usdCents(paymentTotal)}</div>
            </>
          )}
        </div>
      </div>
      <div className="mortgage-calculator__chart-legend">
        {segments.map((s) => {
          const isActive = active && active.label === s.label;
          return (
            <div key={s.label} className={`mortgage-calculator__legend-item ${isActive ? 'is-active' : ''}`}>
              <span
                className="mortgage-calculator__legend-dot"
                style={{ background: s.color }}
                onMouseEnter={() => setActive(s)}
                onMouseLeave={() => setActive(null)}
              />
              <span
                className="mortgage-calculator__legend-label"
                onMouseEnter={() => setActive(s)}
                onMouseLeave={() => setActive(null)}
              >
                {s.label}
              </span>
              <span className="mortgage-calculator__legend-value">{usdCents(s.value)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
});

const ScheduleTable = memo(function ScheduleTable({ schedule, totals }) {
  return (
    <section className="mortgage__schedule" aria-label="Amortization schedule">
      <div className="mortgage-calculator__table">
        <div className="mortgage-calculator__table-head">
          <div>#</div>
          <div>Date</div>
          <div>Principal</div>
          <div>Interest</div>
          <div>Extra</div>
          <div>PMI</div>
          <div>Escrow</div>
          <div>Total</div>
          <div>Balance</div>
        </div>
        <div className="mortgage-calculator__table-body">
          {schedule.slice(0, 360).map((row) => (
            <div key={row.idx} className="mortgage-calculator__table-row">
              <div>{row.idx}</div>
              <div>{row.date.toLocaleDateString(undefined, { year: 'numeric', month: 'short' })}</div>
              <div>{usdCents(row.principal)}</div>
              <div>{usdCents(row.interest)}</div>
              <div>{usdCents(row.extra)}</div>
              <div>{row.pmi ? usdCents(row.pmi) : '-'}</div>
              <div>{usdCents(row.escrow)}</div>
              <div>{usdCents(row.total)}</div>
              <div>{usdCents(row.endingBalance)}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="mortgage-calculator__totals">
        <div>
          <span>Total Interest</span>
          <strong>{usdCents(totals.totalInterest)}</strong>
        </div>
        <div>
          <span>Total PMI</span>
          <strong>{usdCents(totals.totalPMI)}</strong>
        </div>
        <div>
          <span>Total Escrow</span>
          <strong>{usdCents(totals.totalEscrow)}</strong>
        </div>
        <div>
          <span>Total Paid</span>
          <strong>{usdCents(totals.totalPaid)}</strong>
        </div>
      </div>
    </section>
  );
});

const MortgageResults = memo(function MortgageResults({ inputs, isUpdating, forceSkeleton = false, granularity, onGranularityChange }) {
  const shouldSkeleton = isUpdating || forceSkeleton;
  const result = useMemo(() => (shouldSkeleton ? null : buildSchedule(inputs)), [inputs, shouldSkeleton]);
  const first = result ? result.schedule[0] : null;
  const monthlyBreakdown = result && first ? [
    { label: 'Principal', value: first.principal, color: 'rgba(255,255,255,0.9)' },
    { label: 'Interest', value: first.interest, color: '#22C55E' },
    { label: 'Tax', value: result.escrow.taxMonthly, color: 'rgba(34,197,94,0.55)' },
    { label: 'Insurance', value: result.escrow.insMonthly, color: 'rgba(34,197,94,0.35)' },
    { label: 'HOA', value: result.escrow.hoaMonthly, color: 'rgba(34,197,94,0.25)' },
    { label: 'PMI', value: first.pmi, color: 'rgba(255,255,255,0.4)' },
  ].filter(s => s.value > 0) : [];
  const { seriesMonthly, seriesYearly } = useMemo(() => {
    if (!result) return { seriesMonthly: [], seriesYearly: [] };
    const monthly = result.schedule.map((row, idx) => ({
      idx,
      date: row.date,
      label: row.date.toLocaleDateString(undefined, { year: '2-digit', month: 'short' }),
      balance: row.endingBalance,
      principal: row.principal + row.extra,
      interest: row.interest,
      escrow: row.escrow,
      pmi: row.pmi,
      total: row.total,
    }));
    const byYear = new Map();
    for (const m of monthly) {
      const y = m.date.getFullYear();
      const acc = byYear.get(y) || { label: String(y), balance: m.balance, principal: 0, interest: 0, escrow: 0, pmi: 0, total: 0 };
      acc.balance = m.balance; // last balance of the year
      acc.principal += m.principal;
      acc.interest += m.interest;
      acc.escrow += m.escrow;
      acc.pmi += m.pmi;
      acc.total += m.total;
      byYear.set(y, acc);
    }
    const yearly = Array.from(byYear.values());
    return { seriesMonthly: monthly, seriesYearly: yearly };
  }, [result]);
  // Table data (both granularities)
  const tableSchedule = useMemo(() => {
    if (!result || !result.schedule || !result.schedule.length) return { monthly: [], yearly: [] };
    const monthly = result.schedule;
    const byYear = new Map();
    for (const row of result.schedule) {
      const y = row.date.getFullYear();
      const acc = byYear.get(y) || {
        idx: byYear.size + 1,
        date: new Date(row.date),
        beginningBalance: row.beginningBalance,
        principal: 0,
        interest: 0,
        extra: 0,
        pmi: 0,
        escrow: 0,
        total: 0,
        endingBalance: row.endingBalance,
      };
      acc.date = new Date(row.date); // last of year
      acc.principal += row.principal;
      acc.interest += row.interest;
      acc.extra += row.extra;
      acc.pmi += row.pmi;
      acc.escrow += row.escrow;
      acc.total += row.total;
      acc.endingBalance = row.endingBalance;
      byYear.set(y, acc);
    }
    const yearly = Array.from(byYear.values()).map((r, i) => ({ ...r, idx: i + 1 }));
    return { monthly, yearly };
  }, [result]);
  const payoffDateStr = result ? (result.payoff ? result.payoff.toLocaleDateString(undefined, { year: 'numeric', month: 'short' }) : '-') : '-';
  const pmiEndStr = result && result.pmiEndedAt ? result.schedule[Math.min(result.pmiEndedAt, result.schedule.length - 1)].date.toLocaleDateString(undefined, { year: 'numeric', month: 'short' }) : 'N/A';
  const sensitivity = useMemo(() => {
    const loan = Math.max(inputs.price - inputs.downPaymentAmt, 0);
    const n = Math.round(inputs.termYears * 12);
    const base = monthlyPI(loan, inputs.apr, n);
    const down1 = monthlyPI(loan, Math.max(inputs.apr - 1, 0), n);
    const up1 = monthlyPI(loan, inputs.apr + 1, n);
    return { down1, base, up1 };
  }, [inputs]);
  const currentGranularity = granularity || 'yearly';
  const setGranularity = onGranularityChange || (() => {});
  if (shouldSkeleton) {
    return (
      <>
        <section className="mortgage-calculator__summary" aria-label="Summary and charts" aria-busy>
          <div className="mortgage-calculator__summary-card">
            <div className="mortgage-calculator__summary-card-line">
              <span className="sk sk-line" style={{ width: '12ch' }} />
              <span className="sk sk-line" style={{ width: '10ch' }} />
            </div>
            <div className="mortgage-calculator__summary-card-line">
              <span className="sk sk-line" style={{ width: '14ch' }} />
              <span className="sk sk-line" style={{ width: '11ch' }} />
            </div>
            <div className="mortgage-calculator__summary-card-line">
              <span className="sk sk-line" style={{ width: '18ch' }} />
              <span className="sk sk-line" style={{ width: '12ch' }} />
            </div>
            <div className="mortgage-calculator__summary-card-line">
              <span className="sk sk-line" style={{ width: '16ch' }} />
              <span className="sk sk-line" style={{ width: '12ch' }} />
            </div>
          </div>

          <div className="mortgage-calculator__charts" aria-busy>
            <div className="mortgage-calculator__chart" style={{ display: 'grid', placeItems: 'center' }}>
              <div className="sk sk-circle" style={{ width: 160, height: 160 }} />
            </div>
            <div className="mortgage-calculator__chart">
              <div className="sk sk-rect" style={{ width: '100%', height: 140 }} />
              <div className="mortgage-calculator__chart-caption"><span className="sk sk-line sm" style={{ width: '40%' }} /></div>
            </div>
          </div>

          <div className="mortgage-calculator__sensitivity">
            <div className="sk sk-pill" />
            <div className="sk sk-pill" />
            <div className="sk sk-pill" />
          </div>
        </section>

        <section className="mortgage-calculator__schedule" aria-label="Amortization schedule" aria-busy>
          <div className="mortgage-calculator__table">
            <div className="mortgage-calculator__table-head">
              {Array.from({ length: 9 }).map((_, i) => (
                <div key={i} className="sk sk-line sm" />
              ))}
            </div>
            <div className="mortgage-calculator__table-body">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="skeleton-row">
                  {Array.from({ length: 9 }).map((__, j) => (<div key={j} className="sk sk-line" />))}
                </div>
              ))}
            </div>
          </div>
        </section>
      </>
    );
  }


  return (
    <>
      <section className="mortgage-calculator__summary" aria-label="Summary and charts">
        <div className="mortgage-calculator__summary-card">
          <div className="mortgage-calculator__summary-card-line">
            <span>Loan Amount</span>
            <strong>{usd(result.loan)}</strong>
          </div>
          <div className="mortgage-calculator__summary-card-line">
            <span>Monthly P&I</span>
            <strong>{usdCents(result.paymentPI)}</strong>
          </div>
          <div className="mortgage-calculator__summary-card-line">
            <span>Escrow (tax, ins, HOA)</span>
            <strong>{usdCents(result.escrow.taxMonthly + result.escrow.insMonthly + result.escrow.hoaMonthly)}</strong>
          </div>
          <div className="mortgage-calculator__summary-card-line">
            <span>Estimated Payment</span>
            <strong>
              {usdCents(result.paymentPI + result.escrow.taxMonthly + result.escrow.insMonthly + result.escrow.hoaMonthly + (first?.pmi || 0))}
            </strong>
          </div>
          <div className="mortgage-calculator__summary-card-meta">
            {inputs.pmiAnnualRatePct > 0 && inputs.downPaymentAmt < inputs.price * 0.2 && result.pmiEndedAt && (
              <>
                <span>PMI ends</span>
                <b>{pmiEndStr}</b>
              </>
            )}
            <span>Payoff</span>
            <b>{payoffDateStr}</b>
          </div>
        </div>

        <div className="mortgage-calculator__charts">
          <div className="mortgage-calculator__chart">
            <DonutCard
              segments={monthlyBreakdown}
              paymentTotal={(first?.principal || 0) + (first?.interest || 0) + (first?.pmi || 0) + result.escrow.taxMonthly + result.escrow.insMonthly + result.escrow.hoaMonthly}
            />
          </div>

          <div className="mortgage-calculator__chart">
            <div className="mortgage-calculator__field-label" style={{ marginBottom: '0.25rem' }}>
              <label>Balance Over Time</label>
              <div className="mortgage-calculator__segmented" role="group" aria-label="Chart granularity">
                <button type="button" className={`mortgage-calculator__segmented-btn ${currentGranularity === 'yearly' ? 'is-active' : ''}`} aria-pressed={currentGranularity === 'yearly'} onPointerDown={() => setGranularity('yearly')}>Yearly</button>
                <button type="button" className={`mortgage-calculator__segmented-btn ${currentGranularity === 'monthly' ? 'is-active' : ''}`} aria-pressed={currentGranularity === 'monthly'} onPointerDown={() => setGranularity('monthly')}>Monthly</button>
              </div>
            </div>
            <div style={{ width: '100%', height: 260 }}>
              <ResponsiveContainer>
                <AreaChart data={currentGranularity === 'monthly' ? seriesMonthly : seriesYearly} margin={{ top: 6, right: 12, bottom: 12, left: 0 }}>
                  <defs>
                    <linearGradient id="balanceGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#22C55E" stopOpacity={0.55} />
                      <stop offset="100%" stopColor="#22C55E" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(255,255,255,0.08)" />
                  <XAxis dataKey="label" tick={{ fill: '#C9D6D6' }} />
                  <YAxis tickFormatter={(v) => `$${Math.round(v/1000)}k`} tick={{ fill: '#C9D6D6' }} />
                  <RechartsTooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload || !payload.length) return null;
                      const d = payload[0].payload;
                      return (
                        <div style={{ background: 'rgba(16,20,26,0.9)', border: '1px solid rgba(34,197,94,0.35)', borderRadius: 12, padding: '8px 10px', color: '#EAF2F2' }}>
                          <div style={{ fontWeight: 800, marginBottom: 4 }}>{label}</div>
                          <div>Balance: {usdCents(d.balance)}</div>
                          <div>Principal: {usdCents(d.principal)}</div>
                          <div>Interest: {usdCents(d.interest)}</div>
                          <div>Escrow: {usdCents(d.escrow)}</div>
                          {d.pmi > 0 && <div>PMI: {usdCents(d.pmi)}</div>}
                        </div>
                      );
                    }}
                  />
                  <Area type="monotone" dataKey="balance" stroke="#22C55E" fill="url(#balanceGrad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            
          </div>
        </div>

        <div className="mortgage-calculator__sensitivity">
          <div className="mortgage-calculator__sensitivity-item">
            <div className="mortgage-calculator__sensitivity-label">Rate -1%</div>
            <div className="mortgage-calculator__sensitivity-value">{usdCents(sensitivity.down1)}</div>
          </div>
          <div className="mortgage-calculator__sensitivity-item is-active">
            <div className="mortgage-calculator__sensitivity-label">Current</div>
            <div className="mortgage-calculator__sensitivity-value">{usdCents(sensitivity.base)}</div>
          </div>
          <div className="mortgage-calculator__sensitivity-item">
            <div className="mortgage-calculator__sensitivity-label">Rate +1%</div>
            <div className="mortgage-calculator__sensitivity-value">{usdCents(sensitivity.up1)}</div>
          </div>
        </div>
      </section>

      {/* Schedule table rendered by parent for full-width */}
      </>
  );
});

const MortgageCalculator = () => {
  // Single source of truth state (commit on blur via NumericInput)
  const [price, setPrice] = useState(450000);
  const [downPct, setDownPct] = useState(20);
  const [downAmt, setDownAmt] = useState(() => Math.round(450000 * 0.2));
  const [termYears, setTermYears] = useState(30);
  const [apr, setApr] = useState(6.25);
  const [taxRatePct, setTaxRatePct] = useState(1.2);
  const [insuranceAnnual, setInsuranceAnnual] = useState(1600);
  const [hoaMonthly, setHoaMonthly] = useState(0);
  const [pmiAnnualRatePct, setPmiAnnualRatePct] = useState(0);
  const [extraMonthly, setExtraMonthly] = useState(0);
  const [startDate, setStartDate] = useState(() => new Date());

  // Down payment mode & sync key for input text resync on toggle
  const [downMode, setDownMode] = useState('percent'); // 'dollar' | 'percent'
  const [dpSyncKey, setDpSyncKey] = useState(0);
  const [taxMode, setTaxMode] = useState('percent'); // 'dollar' | 'percent'
  const [taxSyncKey, setTaxSyncKey] = useState(0);
  const [insuranceMode, setInsuranceMode] = useState('dollar'); // 'dollar' | 'percent'
  const [insSyncKey, setInsSyncKey] = useState(0);
  const [hoaMode, setHoaMode] = useState('monthly'); // 'monthly' | 'yearly'
  const [hoaSyncKey, setHoaSyncKey] = useState(0);

  // We'll only sync values on commit to avoid onChange lag.

  const inputs = useMemo(() => ({
    price,
    downPaymentAmt: downAmt,
    apr,
    termYears,
    taxRatePct,
    insuranceAnnual,
    hoaMonthly,
    pmiAnnualRatePct,
    extraMonthly,
    startDate,
  }), [price, downAmt, apr, termYears, taxRatePct, insuranceAnnual, hoaMonthly, pmiAnnualRatePct, extraMonthly, startDate]);
  const deferredInputs = useDeferredValue(inputs);
  const isUpdating = inputs !== deferredInputs;
  const [forceSkeleton, setForceSkeleton] = useState(true);
  useEffect(() => {
    const id = requestAnimationFrame(() => setForceSkeleton(false));
    return () => cancelAnimationFrame(id);
  }, []);
  const [granularity, setGranularity] = useState('yearly');

  const parentResult = useMemo(() => (forceSkeleton || isUpdating ? null : buildSchedule(deferredInputs)), [deferredInputs, forceSkeleton, isUpdating]);
  const tableSchedule = useMemo(() => {
    if (!parentResult || !parentResult.schedule || !parentResult.schedule.length) return { monthly: [], yearly: [] };
    const monthly = parentResult.schedule;
    const byYear = new Map();
    for (const row of parentResult.schedule) {
      const y = row.date.getFullYear();
      const acc = byYear.get(y) || {
        idx: byYear.size + 1,
        date: new Date(row.date),
        beginningBalance: row.beginningBalance,
        principal: 0,
        interest: 0,
        extra: 0,
        pmi: 0,
        escrow: 0,
        total: 0,
        endingBalance: row.endingBalance,
      };
      acc.date = new Date(row.date);
      acc.principal += row.principal;
      acc.interest += row.interest;
      acc.extra += row.extra;
      acc.pmi += row.pmi;
      acc.escrow += row.escrow;
      acc.total += row.total;
      acc.endingBalance = row.endingBalance;
      byYear.set(y, acc);
    }
    const yearly = Array.from(byYear.values()).map((r, i) => ({ ...r, idx: i + 1 }));
    return { monthly, yearly };
  }, [parentResult]);

  const dpSegRef = useRef(null);
  const taxSegRef = useRef(null);
  const insSegRef = useRef(null);
  const hoaSegRef = useRef(null);
  const [monthOpen, setMonthOpen] = useState(false);

  return (
    <div className="mortgage-calculator">
      <header className="mortgage-calculator__header">
        <h1>Mortgage Calculator</h1>
        <p>Estimate payments, see PMI drop-off, and explore payoff with extra principal.</p>
      </header>

      <div className="mortgage-calculator__grid">
        <section className="mortgage-calculator__inputs" aria-label="Inputs">
          <div className="mortgage-calculator__field home-price">
            <label>Home Price</label>
            <div className="mortgage-calculator__field-control">
              <span className="mortgage-calculator__prefix">$</span>
              <NumericInput
                value={price}
                onCommitNumber={(v) => {
                  setPrice(v);
                  const newDownAmt = Math.round(v * (downPct / 100));
                  setDownAmt(newDownAmt);
                }}
                min={0}
                allowDecimal={false}
                groupThousands={true}
                ariaLabel="Home price"
              />
            </div>
          </div>

          <div className="mortgage-calculator__field down-payment">
            <div className="mortgage-calculator__field-label">
              <label>Down Payment</label>
              <div className="mortgage-calculator__segmented" role="group" aria-label="Down payment mode" ref={dpSegRef}>
                <button
                  type="button"
                  className={`mortgage-calculator__segmented-btn ${downMode === 'dollar' ? 'is-active' : ''}`}
                  aria-pressed={downMode === 'dollar'}
                  onPointerDown={() => { setDownMode('dollar'); setDpSyncKey((k) => k + 1); }}
                >
                  $
                </button>
                <button
                  type="button"
                  className={`mortgage-calculator__segmented-btn ${downMode === 'percent' ? 'is-active' : ''}`}
                  aria-pressed={downMode === 'percent'}
                  onPointerDown={() => { setDownMode('percent'); setDpSyncKey((k) => k + 1); }}
                >
                  %
                </button>
              </div>
            </div>
            <div className="mortgage-calculator__field-control">
              {downMode === 'dollar' && <span className="mortgage-calculator__prefix">$</span>}
              <NumericInput
                value={downMode === 'dollar' ? Math.round(downAmt) : Number(downPct.toFixed(1))}
                onCommitNumber={(val) => {
                  if (downMode === 'dollar') {
                    const vv = Math.min(val, price);
                    setDownAmt(vv);
                    const pp = price > 0 ? (vv / price) * 100 : 0;
                    setDownPct(pp);
                  } else {
                    const pp = clamp(val, 0, 100);
                    setDownPct(pp);
                    const amt = Math.round(price * (pp / 100));
                    setDownAmt(amt);
                  }
                }}
                shouldCommitOnBlur={(ev) => {
                  const rt = ev.relatedTarget;
                  if (dpSegRef.current && rt instanceof Node && dpSegRef.current.contains(rt)) {
                    return false; // do not commit when clicking toggle
                  }
                  return true;
                }}
                min={0}
                max={downMode === 'dollar' ? price : 100}
                allowDecimal={downMode !== 'dollar'}
                precision={downMode === 'dollar' ? undefined : 1}
                groupThousands={downMode === 'dollar'}
                syncKey={dpSyncKey}
                ariaLabel="Down payment"
              />
              {downMode === 'percent' && <span className="mortgage-calculator__suffix">%</span>}
            </div>
          </div>

          <div className="mortgage-calculator__field mortgage-calculator__field--split">
            <div className="term-years">
              <label>Term (years)</label>
              <div className="mortgage-calculator__field-control">
                <NumericInput value={termYears} onCommitNumber={(v) => { const vv = Math.round(v); setTermYears(vv); }} min={1} max={40} allowDecimal={false} groupThousands={true} ariaLabel="Term in years" />
                <span className="mortgage-calculator__suffix">yrs</span>
              </div>
            </div>
            <div className="apr-rate">
              <label>Interest Rate (APR)</label>
              <div className="mortgage-calculator__field-control">
                <NumericInput value={apr} onCommitNumber={(v) => { setApr(v); }} min={0} allowDecimal={true} precision={2} ariaLabel="APR" />
                <span className="mortgage-calculator__suffix">%</span>
              </div>
            </div>
          </div>

          <div className="mortgage-calculator__field">
            <div className="mortgage-calculator__field-label">
              <label>Property Tax</label>
              <div className="mortgage-calculator__segmented" role="group" aria-label="Property tax mode" ref={taxSegRef}>
                <button type="button" className={`mortgage-calculator__segmented-btn ${taxMode === 'dollar' ? 'is-active' : ''}`} aria-pressed={taxMode === 'dollar'} onPointerDown={() => { setTaxMode('dollar'); setTaxSyncKey((k) => k + 1); }}>$</button>
                <button type="button" className={`mortgage-calculator__segmented-btn ${taxMode === 'percent' ? 'is-active' : ''}`} aria-pressed={taxMode === 'percent'} onPointerDown={() => { setTaxMode('percent'); setTaxSyncKey((k) => k + 1); }}>%</button>
              </div>
            </div>
            <div className="mortgage-calculator__field-control">
              {taxMode === 'dollar' && <span className="mortgage-calculator__prefix">$</span>}
              <NumericInput
                value={taxMode === 'dollar' ? Math.round(price * (taxRatePct / 100)) : Number(taxRatePct.toFixed(2))}
                onCommitNumber={(val) => {
                  if (taxMode === 'dollar') {
                    const annual = Math.max(0, val);
                    const rate = price > 0 ? (annual / price) * 100 : 0;
                    setTaxRatePct(rate);
                  } else {
                    setTaxRatePct(val);
                  }
                }}
                shouldCommitOnBlur={(ev) => {
                  const rt = ev.relatedTarget;
                  if (taxSegRef.current && rt instanceof Node && taxSegRef.current.contains(rt)) {
                    return false;
                  }
                  return true;
                }}
                min={0}
                max={taxMode === 'percent' ? 100 : undefined}
                allowDecimal={taxMode === 'percent'}
                precision={taxMode === 'percent' ? 2 : undefined}
                groupThousands={taxMode === 'dollar'}
                syncKey={taxSyncKey}
                ariaLabel="Property tax"
              />
              {taxMode === 'percent' && <span className="mortgage-calculator__suffix">%</span>}
            </div>
          </div>

          <div className="mortgage-calculator__field">
            <div className="mortgage-calculator__field-label">
              <label>Insurance</label>
              <div className="mortgage-calculator__segmented" role="group" aria-label="Insurance mode" ref={insSegRef}>
                <button type="button" className={`mortgage-calculator__segmented-btn ${insuranceMode === 'dollar' ? 'is-active' : ''}`} aria-pressed={insuranceMode === 'dollar'} onPointerDown={() => { setInsuranceMode('dollar'); setInsSyncKey((k) => k + 1); }}>$</button>
                <button type="button" className={`mortgage-calculator__segmented-btn ${insuranceMode === 'percent' ? 'is-active' : ''}`} aria-pressed={insuranceMode === 'percent'} onPointerDown={() => { setInsuranceMode('percent'); setInsSyncKey((k) => k + 1); }}>%</button>
              </div>
            </div>
            <div className="mortgage-calculator__field-control">
              {insuranceMode === 'dollar' && <span className="mortgage-calculator__prefix">$</span>}
              <NumericInput
                value={insuranceMode === 'dollar' ? Math.round(insuranceAnnual) : Number((price > 0 ? (insuranceAnnual / price) * 100 : 0).toFixed(2))}
                onCommitNumber={(val) => {
                  if (insuranceMode === 'dollar') {
                    setInsuranceAnnual(Math.max(0, val));
                  } else {
                    const pct = Math.max(0, val);
                    const amt = Math.round(price * (pct / 100));
                    setInsuranceAnnual(amt);
                  }
                }}
                shouldCommitOnBlur={(ev) => {
                  const rt = ev.relatedTarget;
                  if (insSegRef.current && rt instanceof Node && insSegRef.current.contains(rt)) {
                    return false;
                  }
                  return true;
                }}
                min={0}
                max={insuranceMode === 'percent' ? 100 : undefined}
                allowDecimal={insuranceMode === 'percent'}
                precision={insuranceMode === 'percent' ? 2 : undefined}
                groupThousands={insuranceMode === 'dollar'}
                syncKey={insSyncKey}
                ariaLabel="Insurance"
              />
              {insuranceMode === 'percent' && <span className="mortgage-calculator__suffix">%</span>}
            </div>
          </div>

          <div className="mortgage-calculator__field">
            <div>
              <div className="mortgage-calculator__field-label">
                <label>HOA</label>
                <div className="mortgage-calculator__segmented" role="group" aria-label="HOA cadence" ref={hoaSegRef}>
                  <button
                    type="button"
                    className={`mortgage-calculator__segmented-btn ${hoaMode === 'monthly' ? 'is-active' : ''}`}
                    aria-pressed={hoaMode === 'monthly'}
                    onPointerDown={() => { setHoaMode('monthly'); setHoaSyncKey((k) => k + 1); }}
                  >
                    Monthly
                  </button>
                  <button
                    type="button"
                    className={`mortgage-calculator__segmented-btn ${hoaMode === 'yearly' ? 'is-active' : ''}`}
                    aria-pressed={hoaMode === 'yearly'}
                    onPointerDown={() => { setHoaMode('yearly'); setHoaSyncKey((k) => k + 1); }}
                  >
                    Yearly
                  </button>
                </div>
              </div>
              <div className="mortgage-calculator__field-control">
                <span className="mortgage-calculator__prefix">$</span>
                <NumericInput
                  value={hoaMode === 'monthly' ? hoaMonthly : Math.round(hoaMonthly * 12)}
                  onCommitNumber={(v) => {
                    if (hoaMode === 'monthly') {
                      setHoaMonthly(v);
                    } else {
                      const monthly = Math.round(v / 12);
                      setHoaMonthly(monthly);
                    }
                  }}
                  shouldCommitOnBlur={(ev) => {
                    const rt = ev.relatedTarget;
                    if (hoaSegRef.current && rt instanceof Node && hoaSegRef.current.contains(rt)) {
                      return false;
                    }
                    return true;
                  }}
                  min={0}
                  allowDecimal={false}
                  groupThousands={true}
                  syncKey={hoaSyncKey}
                  ariaLabel="HOA"
                />
              </div>
            </div>
          </div>

          <div className="mortgage-calculator__field">
            <label>PMI (annual %)</label>
            <div className="mortgage-calculator__field-control">
              <NumericInput value={pmiAnnualRatePct} onCommitNumber={(v) => { setPmiAnnualRatePct(v); }} min={0} allowDecimal={true} precision={2} ariaLabel="PMI annual percent" />
              <span className="mortgage-calculator__suffix">%</span>
            </div>
          </div>

          <div className="mortgage-calculator__field extra-principal">
            <label>Extra Principal (monthly)</label>
            <div className="mortgage-calculator__field-control">
              <span className="mortgage-calculator__prefix">$</span>
              <NumericInput value={extraMonthly} onCommitNumber={(v) => { setExtraMonthly(v); }} min={0} allowDecimal={false} groupThousands={true} ariaLabel="Extra principal monthly" />
            </div>
          </div>

          <div className="mortgage-calculator__field start-month" style={{ position: 'relative' }}>
            <label>Start Month</label>
            <div className="mortgage-calculator__field-control">
              <input
                type="text"
                readOnly
                value={startDate.toLocaleDateString(undefined, { year: 'numeric', month: 'short' })}
                aria-label="Loan start month"
              />
              <button
                type="button"
                className="mortgage-calculator__calendar-btn"
                aria-label="Open month picker"
                onClick={() => setMonthOpen((o) => !o)}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect x="3" y="5" width="18" height="16" rx="2" stroke="#CFE9D6" strokeWidth="1.6"/>
                  <path d="M8 3v4M16 3v4M3 10h18" stroke="#CFE9D6" strokeWidth="1.6" strokeLinecap="round"/>
                </svg>
              </button>
              {monthOpen && (
                <MonthPicker
                  value={startDate}
                  onSelect={(d) => {
                    const same = startDate && startDate.getFullYear() === d.getFullYear() && startDate.getMonth() === d.getMonth();
                    if (!same) setStartDate(d);
                  }}
                  onClose={() => setMonthOpen(false)}
                />
              )}
            </div>
          </div>
        </section>
        <MortgageResults inputs={deferredInputs} isUpdating={isUpdating} forceSkeleton={forceSkeleton} granularity={granularity} onGranularityChange={setGranularity} />
      </div>

      {/* Full-width schedule below the two-column grid */}
      {forceSkeleton || isUpdating || !parentResult ? (
        <section className="mortgage-calculator__schedule" aria-label="Amortization schedule" aria-busy>
          <div className="mortgage-calculator__table">
            <div className="mortgage-calculator__table-head">
              {Array.from({ length: 9 }).map((_, i) => (
                <div key={i} className="sk sk-line sm" />
              ))}
            </div>
            <div className="mortgage-calculator__table-body">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="skeleton-row">
                  {Array.from({ length: 9 }).map((__, j) => (<div key={j} className="sk sk-line" />))}
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : (
        <ScheduleTable schedule={granularity === 'monthly' ? tableSchedule.monthly : tableSchedule.yearly} totals={parentResult.totals} />
      )}
    </div>
  );
};

export default MortgageCalculator;
