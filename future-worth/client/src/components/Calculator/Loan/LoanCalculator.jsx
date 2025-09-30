import React, { useEffect, useMemo, useRef, useState, useLayoutEffect, memo, useDeferredValue } from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip } from 'recharts';
import MonthPicker from '../../Calendar/MonthPicker';
import './LoanCalculator.scss';

// Utils
const usd = (n) => n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
const usd0 = (n) => n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const clamp = (v, min, max) => Math.min(Math.max(v ?? 0, min), max);

function monthlyPI(principal, aprPct, termMonths) {
  const r = (aprPct / 100) / 12;
  if (termMonths <= 0) return 0;
  if (r === 0) return principal / termMonths;
  const a = Math.pow(1 + r, termMonths);
  return principal * (r * a) / (a - 1);
}

function buildLoanSchedule({
  amount,
  apr,
  termYears,
  startDate,
  extraMonthly = 0,
  oneTimeExtra = 0,
  oneTimeExtraMonth = 0, // 1-based; 0 means disabled
  monthlyFees = 0,
}) {
  const termMonths = Math.round(termYears * 12);
  const r = (apr / 100) / 12;

  let principal = amount;

  const paymentPI = monthlyPI(principal, apr, termMonths);

  let bal = principal;
  const schedule = [];
  let date = startDate ? new Date(startDate) : new Date();
  date.setDate(1);

  let totals = { totalInterest: 0, totalPrincipal: 0, totalFeesMonthly: 0, totalPaid: 0 };

  for (let idx = 1; bal > 0 && idx <= termMonths + 600; idx++) {
    const interest = bal * r;
    let principalPortion = paymentPI - interest;
    if (paymentPI === 0 && r === 0) {
      principalPortion = Math.min(bal, principal / termMonths);
    }

    let extra = extraMonthly;
    if (oneTimeExtra > 0 && oneTimeExtraMonth === idx) extra += oneTimeExtra;

    // Cap to avoid overpay beyond balance
    let appliedPrincipal = principalPortion + extra;
    if (appliedPrincipal > bal) {
      appliedPrincipal = bal;
      // reduce extra first
      const maxExtra = Math.max(0, appliedPrincipal - principalPortion);
      extra = Math.max(0, Math.min(extra, maxExtra));
      principalPortion = appliedPrincipal - extra;
    }

    const fees = monthlyFees;
    const total = principalPortion + interest + extra + fees;
    const newBal = Math.max(0, bal - (principalPortion + extra));

    schedule.push({
      idx,
      date: new Date(date),
      beginningBalance: bal,
      principal: principalPortion,
      interest,
      extra,
      fees,
      total,
      endingBalance: newBal,
    });

    totals.totalInterest += interest;
    totals.totalPrincipal += principalPortion + extra;
    totals.totalFeesMonthly += fees;
    totals.totalPaid += total;

    bal = newBal;
    date.setMonth(date.getMonth() + 1);
  }

  const payoff = schedule[schedule.length - 1]?.date ?? null;

  // Baseline without extras to compute savings
  const baseline = buildLoanScheduleBaseline({ amount, apr, termYears, startDate, monthlyFees });
  const interestSaved = Math.max(0, baseline.totals.totalInterest - totals.totalInterest);
  const monthsSaved = Math.max(0, baseline.schedule.length - schedule.length);

  return { schedule, paymentPI, totals, payoff, loan: principal, savings: { interestSaved, monthsSaved } };
}

function buildLoanScheduleBaseline({ amount, apr, termYears, startDate, monthlyFees }) {
  // No extras, no origination changes
  const termMonths = Math.round(termYears * 12);
  const r = (apr / 100) / 12;
  const paymentPI = monthlyPI(amount, apr, termMonths);
  let bal = amount;
  const schedule = [];
  let date = startDate ? new Date(startDate) : new Date();
  date.setDate(1);
  let totals = { totalInterest: 0, totalFeesMonthly: 0, totalPaid: 0 };
  for (let idx = 1; bal > 0 && idx <= termMonths + 600; idx++) {
    const interest = bal * r;
    let principalPortion = paymentPI - interest;
    if (paymentPI === 0 && r === 0) principalPortion = Math.min(bal, amount / termMonths);
    if (principalPortion > bal) principalPortion = bal;
    const fees = monthlyFees;
    const total = principalPortion + interest + fees;
    const newBal = Math.max(0, bal - principalPortion);
    schedule.push({ idx, date: new Date(date), beginningBalance: bal, principal: principalPortion, interest, extra: 0, fees, total, endingBalance: newBal });
    totals.totalInterest += interest;
    totals.totalFeesMonthly += fees;
    totals.totalPaid += total;
    bal = newBal;
    date.setMonth(date.getMonth() + 1);
  }
  return { schedule, paymentPI, totals };
}

// Input component
function NumericInput({ value, onCommitNumber, allowDecimal = false, min, max, precision, groupThousands, syncKey, ariaLabel, placeholder }) {
  const formatFromValue = (v) => { if (v == null) return ''; if (precision != null && Number.isFinite(v)) return Number(v).toFixed(precision); return String(v); };
  const [text, setText] = useState(formatFromValue(value));
  const [focused, setFocused] = useState(false);
  const inputRef = useRef(null);
  const desiredCaretRef = useRef(null);
  useEffect(() => { if (!focused) setText(formatFromValue(value)); }, [value, focused]);
  useLayoutEffect(() => { setText(formatFromValue(value)); }, [syncKey]);
  const formatThousands = (digits) => { if (!groupThousands) return digits; if (!digits) return ''; return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ','); };
  const countDigitsLeftOf = (str, caret) => { let c = 0; for (let i = 0; i < Math.max(0, caret); i++) if (/\d/.test(str[i])) c++; return c; };
  const caretFromDigitsLeft = (str, digitsLeft) => { if (digitsLeft <= 0) return 0; let c = 0; for (let i = 0; i < str.length; i++) { if (/\d/.test(str[i])) c++; if (c === digitsLeft) return i + 1; } return str.length; };
  const normalize = (raw) => {
    let s = String(raw ?? '');
    s = allowDecimal ? s.replace(/[^0-9.]/g, '') : s.replace(/[^0-9]/g, '');
    if (allowDecimal) {
      const firstDot = s.indexOf('.');
      if (firstDot !== -1) s = s.slice(0, firstDot + 1) + s.slice(firstDot + 1).replace(/\./g, '');
      if (s === '.') s = '0.';
      if (s.length > 1 && !s.startsWith('0.')) s = s.replace(/^0+(?=\d)/, '');
    } else {
      if (s.length > 1) s = s.replace(/^0+(?=\d)/, '');
    }
    return s;
  };
  const commit = (s) => { let out = normalize(s); if (out === '' || out === '.' || out === '-') out = '0'; let n = allowDecimal ? parseFloat(out) : parseInt(out, 10); if (!Number.isFinite(n)) n = 0; if (min != null) n = Math.max(min, n); if (max != null) n = Math.min(max, n); onCommitNumber?.(n); setText(formatFromValue(n)); };
  useLayoutEffect(() => { const pos = desiredCaretRef.current; if (pos != null && inputRef.current) { const el = inputRef.current; requestAnimationFrame(() => { try { el.setSelectionRange(pos, pos); } catch {} }); desiredCaretRef.current = null; } });
  return (
    <input ref={inputRef} type="text" inputMode={allowDecimal ? 'decimal' : 'numeric'} aria-label={ariaLabel} placeholder={placeholder}
      value={allowDecimal || !groupThousands ? text : formatThousands(text)} onFocus={() => setFocused(true)}
      onBlur={(e) => { setFocused(false); commit(e.target.value); }}
      onChange={(e) => { const el = e.target; const raw = el.value; if (!allowDecimal && groupThousands) { const digitsLeft = countDigitsLeftOf(raw, el.selectionStart); const s = normalize(raw); setText(s); const formatted = formatThousands(s); desiredCaretRef.current = caretFromDigitsLeft(formatted, digitsLeft); } else { const s = normalize(raw); setText(s); } }}
      onKeyDown={(e) => { if (["e","E","+","-"].includes(e.key)) e.preventDefault(); }} />
  );
}

const DonutCard = memo(function DonutCard({ segments, paymentTotal }) {
  const [active, setActive] = useState(null);
  return (
    <div>
      <div style={{ width: '100%', height: 180, position: 'relative' }}>
        <ResponsiveContainer>
          <PieChart>
            <Pie data={segments} dataKey="value" nameKey="label" cx="50%" cy="50%" innerRadius={60} outerRadius={90}
              onMouseEnter={(_, idx) => setActive(segments[idx])} onMouseLeave={() => setActive(null)}>
              {segments.map((entry, idx) => {
                const isActive = active && active.label === entry.label;
                return (
                  <Cell key={idx} fill={entry.color} stroke={isActive ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.2)'} strokeWidth={isActive ? 2 : 1} />
                );
              })}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="loan-calculator__donut-center" aria-hidden>
          {active ? (
            <>
              <div className="loan-calculator__donut-center-label">{active.label}</div>
              <div className="loan-calculator__donut-center-value">{usd(active.value)}</div>
            </>
          ) : (
            <>
              <div className="loan-calculator__donut-center-label">Payment</div>
              <div className="loan-calculator__donut-center-value">{usd(paymentTotal)}</div>
            </>
          )}
        </div>
      </div>
      <div className="loan-calculator__chart-legend">
        {segments.map((s) => {
          const isActive = active && active.label === s.label;
          return (
            <div key={s.label} className={`loan-calculator__legend-item ${isActive ? 'is-active' : ''}`}>
              <span className="loan-calculator__legend-dot" style={{ background: s.color }} onMouseEnter={() => setActive(s)} onMouseLeave={() => setActive(null)} />
              <span className="loan-calculator__legend-label" onMouseEnter={() => setActive(s)} onMouseLeave={() => setActive(null)}>{s.label}</span>
              <span className="loan-calculator__legend-value">{usd(s.value)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
});

const ScheduleTable = memo(function ScheduleTable({ schedule, totals }) {
  return (
    <section className="loan-calculator__schedule" aria-label="Amortization schedule">
      <div className="loan-calculator__table">
        <div className="loan-calculator__table-head">
          <div>#</div>
          <div>Date</div>
          <div>Principal</div>
          <div>Interest</div>
          <div>Extra</div>
          <div>Fees</div>
          <div>Total</div>
          <div>Balance</div>
        </div>
        <div className="loan-calculator__table-body">
          {schedule.slice(0, 360).map((row) => (
            <div key={row.idx} className="loan-calculator__table-row">
              <div>{row.idx}</div>
              <div>{row.date.toLocaleDateString(undefined, { year: 'numeric', month: 'short' })}</div>
              <div>{usd(row.principal)}</div>
              <div>{usd(row.interest)}</div>
              <div>{usd(row.extra)}</div>
              <div>{usd(row.fees)}</div>
              <div>{usd(row.total)}</div>
              <div>{usd(row.endingBalance)}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="loan-calculator__totals">
        <div>
          <span>Total Interest</span>
          <strong>{usd(totals.totalInterest)}</strong>
        </div>
        <div>
          <span>Total Fees (monthly)</span>
          <strong>{usd(totals.totalFeesMonthly)}</strong>
        </div>
        <div>
          <span>Total Paid</span>
          <strong>{usd(totals.totalPaid)}</strong>
        </div>
      </div>
    </section>
  );
});

const LoanResults = memo(function LoanResults({ inputs, isUpdating, forceSkeleton = false }) {
  const shouldSkeleton = isUpdating || forceSkeleton;
  const result = useMemo(() => (shouldSkeleton ? null : buildLoanSchedule(inputs)), [inputs, shouldSkeleton]);
  const [granularity, setGranularity] = useState('yearly');

  const first = result ? result.schedule[0] : null;
  const monthlyBreakdown = result && first ? [
    { label: 'Principal', value: first.principal + first.extra, color: 'rgba(255,255,255,0.9)' },
    { label: 'Interest', value: first.interest, color: '#22C55E' },
    ...(first.fees ? [{ label: 'Fees', value: first.fees, color: 'rgba(34,197,94,0.35)' }] : []),
  ] : [];

  const seriesMonthly = useMemo(() => {
    if (!result) return [];
    return result.schedule.map((row) => ({
      label: row.date.toLocaleDateString(undefined, { year: '2-digit', month: 'short' }),
      balance: row.endingBalance,
      principal: row.principal + row.extra,
      interest: row.interest,
      fees: row.fees,
      total: row.total,
    }));
  }, [result]);
  const seriesYearly = useMemo(() => {
    if (!result) return [];
    const byYear = new Map();
    for (const r of result.schedule) {
      const y = r.date.getFullYear();
      const acc = byYear.get(y) || { label: String(y), balance: r.endingBalance, principal: 0, interest: 0, fees: 0, total: 0 };
      acc.balance = r.endingBalance;
      acc.principal += r.principal + r.extra;
      acc.interest += r.interest;
      acc.fees += r.fees;
      acc.total += r.total;
      byYear.set(y, acc);
    }
    return Array.from(byYear.values());
  }, [result]);

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
        fees: 0,
        total: 0,
        endingBalance: row.endingBalance,
      };
      acc.date = new Date(row.date);
      acc.principal += row.principal;
      acc.interest += row.interest;
      acc.extra += row.extra;
      acc.fees += row.fees;
      acc.total += row.total;
      acc.endingBalance = row.endingBalance;
      byYear.set(y, acc);
    }
    const yearly = Array.from(byYear.values()).map((r, i) => ({ ...r, idx: i + 1 }));
    return { monthly, yearly };
  }, [result]);

  const payoffDateStr = result ? (result.payoff ? result.payoff.toLocaleDateString(undefined, { year: 'numeric', month: 'short' }) : '-') : '-';

  if (shouldSkeleton) {
    return (
      <>
        <section className="loan-calculator__summary" aria-label="Summary and charts" aria-busy>
          <div className="loan-calculator__summary-card">
            <div className="sk sk-line" style={{ width: '12ch' }} />
            <div className="sk sk-line" style={{ width: '10ch' }} />
            <div className="sk sk-line" style={{ width: '14ch' }} />
            <div className="sk sk-line" style={{ width: '12ch' }} />
          </div>
          <div className="loan-calculator__charts" aria-busy>
            <div className="loan-calculator__chart" style={{ display: 'grid', placeItems: 'center' }}>
              <div className="sk sk-circle" style={{ width: 160, height: 160 }} />
            </div>
            <div className="loan-calculator__chart">
              <div className="sk sk-rect" style={{ width: '100%', height: 140 }} />
            </div>
          </div>
        </section>
        <section className="loan-calculator__schedule" aria-busy>
          <div className="loan-calculator__table">
            <div className="loan-calculator__table-head">{Array.from({ length: 8 }).map((_, i) => (<div key={i} className="sk sk-line sm" />))}</div>
            <div className="loan-calculator__table-body">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="skeleton-row">{Array.from({ length: 8 }).map((__, j) => (<div key={j} className="sk sk-line" />))}</div>
              ))}
            </div>
          </div>
        </section>
      </>
    );
  }

  return (
    <>
      <section className="loan-calculator__summary" aria-label="Summary and charts">
        <div className="loan-calculator__summary-card">
          <div className="loan-calculator__summary-card-line"><span>Loan Amount</span><strong>{usd0(result.loan)}</strong></div>
          <div className="loan-calculator__summary-card-line"><span>Monthly P&I</span><strong>{usd(result.paymentPI)}</strong></div>
          <div className="loan-calculator__summary-card-line"><span>Estimated Payment</span><strong>{usd(result.paymentPI + (result.schedule[0]?.fees || 0))}</strong></div>
          <div className="loan-calculator__summary-card-line"><span>Payoff</span><strong>{payoffDateStr}</strong></div>
          {result.savings && (result.savings.interestSaved > 0 || result.savings.monthsSaved > 0) && (
            <div className="loan-calculator__summary-card-meta" style={{ marginTop: '0.4rem', display: 'grid', gridTemplateColumns: 'auto 1fr auto auto', gap: '0.5rem', color: '#C9D6D6' }}>
              <span>Interest saved</span>
              <b>{usd(result.savings.interestSaved)}</b>
              <span>Months saved</span>
              <b>{result.savings.monthsSaved}</b>
            </div>
          )}
        </div>

        <div className="loan-calculator__charts">
          <div className="loan-calculator__chart">
            <DonutCard segments={monthlyBreakdown} paymentTotal={(first?.principal || 0) + (first?.interest || 0) + (first?.fees || 0) + (first?.extra || 0)} />
          </div>
          <div className="loan-calculator__chart">
            <div className="loan-calculator__field-label" style={{ marginBottom: '0.25rem' }}>
              <label>Balance Over Time</label>
              <div className="loan-calculator__segmented" role="group" aria-label="Chart granularity">
                <button type="button" className={`loan-calculator__segmented-btn ${granularity === 'yearly' ? 'is-active' : ''}`} aria-pressed={granularity === 'yearly'} onPointerDown={() => setGranularity('yearly')}>Yearly</button>
                <button type="button" className={`loan-calculator__segmented-btn ${granularity === 'monthly' ? 'is-active' : ''}`} aria-pressed={granularity === 'monthly'} onPointerDown={() => setGranularity('monthly')}>Monthly</button>
              </div>
            </div>
            <div style={{ width: '100%', height: 260 }}>
              <ResponsiveContainer>
                <AreaChart data={granularity === 'monthly' ? seriesMonthly : seriesYearly} margin={{ top: 6, right: 12, bottom: 12, left: 0 }}>
                  <defs>
                    <linearGradient id="loanGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#22C55E" stopOpacity={0.55} />
                      <stop offset="100%" stopColor="#22C55E" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(255,255,255,0.08)" />
                  <XAxis dataKey="label" tick={{ fill: '#C9D6D6' }} />
                  <YAxis tickFormatter={(v) => `$${Math.round(v/1000)}k`} tick={{ fill: '#C9D6D6' }} />
                  <RechartsTooltip content={({ active, payload, label }) => {
                    if (!active || !payload || !payload.length) return null;
                    const d = payload[0].payload;
                    return (
                      <div style={{ background: 'rgba(16,20,26,0.9)', border: '1px solid rgba(34,197,94,0.35)', borderRadius: 12, padding: '8px 10px', color: '#EAF2F2' }}>
                        <div style={{ fontWeight: 800, marginBottom: 4 }}>{label}</div>
                        <div>Balance: {usd(d.balance)}</div>
                        <div>Principal: {usd(d.principal)}</div>
                        <div>Interest: {usd(d.interest)}</div>
                        {d.fees > 0 && <div>Fees: {usd(d.fees)}</div>}
                        <div>Total: {usd(d.total)}</div>
                      </div>
                    );
                  }} />
                  <Area type="monotone" dataKey="balance" stroke="#22C55E" fill="url(#loanGrad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </section>

      <ScheduleTable schedule={granularity === 'monthly' ? tableSchedule.monthly : tableSchedule.yearly} totals={result.totals} />
    </>
  );
});

const LoanCalculator = () => {
  const [amount, setAmount] = useState(20000);
  const [apr, setApr] = useState(9.99);
  const [termYears, setTermYears] = useState(5);
  const [startDate, setStartDate] = useState(() => new Date());

  const [extraMonthly, setExtraMonthly] = useState(0);
  const [oneTimeExtra, setOneTimeExtra] = useState(0);
  const [oneTimeExtraDate, setOneTimeExtraDate] = useState(null); // calendar-selected month
  const [monthlyFees, setMonthlyFees] = useState(0);

  // Origination fee removed for simplicity

  const [monthOpen, setMonthOpen] = useState(false);
  const [oneTimeOpen, setOneTimeOpen] = useState(false);

  // Derive one-time extra month index from selected date relative to startDate
  const oneTimeExtraMonth = useMemo(() => {
    if (!oneTimeExtraDate) return 0;
    const a = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
    const b = new Date(oneTimeExtraDate.getFullYear(), oneTimeExtraDate.getMonth(), 1);
    const diff = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
    const idx = diff + 1; // 1-based index
    return idx >= 1 ? idx : 0;
  }, [oneTimeExtraDate, startDate]);

  const inputs = useMemo(() => ({ amount, apr, termYears, startDate, extraMonthly, oneTimeExtra, oneTimeExtraMonth, monthlyFees }), [amount, apr, termYears, startDate, extraMonthly, oneTimeExtra, oneTimeExtraMonth, monthlyFees]);
  const deferredInputs = useDeferredValue(inputs);
  const isUpdating = inputs !== deferredInputs;
  const [forceSkeleton, setForceSkeleton] = useState(true);
  useEffect(() => { const id = requestAnimationFrame(() => setForceSkeleton(false)); return () => cancelAnimationFrame(id); }, []);

  return (
    <div className="loan-calculator">
      <header className="loan-calculator__header">
        <h1>Loan Payoff Calculator</h1>
        <p>Explore payments, payoff date, and savings with extra principal.</p>
      </header>

      <div className="loan-calculator__grid">
        <section className="loan-calculator__inputs" aria-label="Inputs">
          <div className="loan-calculator__field loan-amount">
            <label>Loan Amount</label>
            <div className="loan-calculator__field-control">
              <span className="loan-calculator__prefix">$</span>
              <NumericInput value={amount} onCommitNumber={setAmount} min={0} allowDecimal={false} groupThousands ariaLabel="Loan amount" />
            </div>
          </div>

          <div className="loan-calculator__field loan-calculator__field--split">
            <div>
              <label>APR</label>
              <div className="loan-calculator__field-control">
                <NumericInput value={apr} onCommitNumber={setApr} min={0} allowDecimal precision={2} ariaLabel="APR" />
                <span className="loan-calculator__suffix">%</span>
              </div>
            </div>
            <div>
              <label>Term</label>
              <div className="loan-calculator__field-control">
                <NumericInput value={termYears} onCommitNumber={(v) => setTermYears(Math.max(0.5, Math.round(v)))} min={0.5} allowDecimal precision={0} ariaLabel="Term in years" />
                <span className="loan-calculator__suffix">yrs</span>
              </div>
            </div>
          </div>

          <div className="loan-calculator__field start-month" style={{ position: 'relative' }}>
            <label>Start Month</label>
            <div className="loan-calculator__field-control">
              <input type="text" readOnly value={startDate.toLocaleDateString(undefined, { year: 'numeric', month: 'short' })} aria-label="Loan start month" />
              <button type="button" className="loan-calculator__calendar-btn" aria-label="Open month picker" onClick={() => setMonthOpen((o) => !o)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect x="3" y="5" width="18" height="16" rx="2" stroke="#CFE9D6" strokeWidth="1.6"/>
                  <path d="M8 3v4M16 3v4M3 10h18" stroke="#CFE9D6" strokeWidth="1.6" strokeLinecap="round"/>
                </svg>
              </button>
              {monthOpen && (
                <MonthPicker value={startDate} onSelect={(d) => { setStartDate(d); }} onClose={() => setMonthOpen(false)} />
              )}
            </div>
          </div>

          <div className="loan-calculator__field extra-monthly">
            <label>Extra Principal (monthly)</label>
            <div className="loan-calculator__field-control">
              <span className="loan-calculator__prefix">$</span>
              <NumericInput value={extraMonthly} onCommitNumber={setExtraMonthly} min={0} allowDecimal={false} groupThousands ariaLabel="Extra principal monthly" />
            </div>
          </div>

          <details className="advanced">
            <summary>Advanced</summary>

            <div className="loan-calculator__field one-time-extra">
              <label>One-time Extra Payment</label>
              <div className="loan-calculator__field-control">
                <span className="loan-calculator__prefix">$</span>
                <NumericInput value={oneTimeExtra} onCommitNumber={setOneTimeExtra} min={0} allowDecimal={false} groupThousands ariaLabel="One-time extra" />
              </div>
              <div className="loan-calculator__field one-time-month" style={{ position: 'relative', marginTop: '0.5rem' }}>
                <div className="loan-calculator__field-control">
                  <input type="text" readOnly value={oneTimeExtraDate ? oneTimeExtraDate.toLocaleDateString(undefined, { year: 'numeric', month: 'short' }) : 'Not set'} aria-label="One-time extra month" />
                  <button type="button" className="loan-calculator__calendar-btn" aria-label="Open month picker" onClick={() => setOneTimeOpen((o) => !o)}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <rect x="3" y="5" width="18" height="16" rx="2" stroke="#CFE9D6" strokeWidth="1.6"/>
                      <path d="M8 3v4M16 3v4M3 10h18" stroke="#CFE9D6" strokeWidth="1.6" strokeLinecap="round"/>
                    </svg>
                  </button>
                  {oneTimeOpen && (
                    <MonthPicker value={oneTimeExtraDate || startDate} onSelect={(d) => { setOneTimeExtraDate(d); }} onClose={() => setOneTimeOpen(false)} />
                  )}
                </div>
              </div>
            </div>

            {null}

            <div className="loan-calculator__field monthly-fees">
              <label>Other Monthly Fees</label>
              <div className="loan-calculator__field-control">
                <span className="loan-calculator__prefix">$</span>
                <NumericInput value={monthlyFees} onCommitNumber={setMonthlyFees} min={0} allowDecimal={false} groupThousands ariaLabel="Monthly fees" />
              </div>
            </div>
          </details>
        </section>

        <LoanResults inputs={deferredInputs} isUpdating={isUpdating} forceSkeleton={forceSkeleton} />
      </div>
    </div>
  );
};

export default LoanCalculator;
