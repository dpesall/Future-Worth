import React, { useEffect, useMemo, useRef, useState, useLayoutEffect, memo, useDeferredValue } from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip } from 'recharts';
import './RetirementCalculator.scss';

// Utils
const clamp = (v, min, max) => Math.min(Math.max(v ?? 0, min), max);
const usd = (n) => n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const usdCents = (n) => n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });

function monthlyEffectiveRate(aprPct, comp) {
  const r = aprPct / 100;
  const m = comp === 'monthly' ? 12 : comp === 'quarterly' ? 4 : comp === 'annual' ? 1 : 12;
  return Math.pow(1 + r / m, m / 12) - 1;
}

// Build retirement schedule: accumulation then drawdown
function buildRetirementSchedule({
  currentAge, // years (int)
  retireAge,  // years (int)
  endAge,     // years (int)
  balanceStart,
  contribMonthly,
  contribAnnualIncreasePct,
  aprPre,
  aprPost,
  inflationPct,
  incomeMode, // 'target' | 'rate'
  targetIncomeMonthlyToday,
  withdrawalRatePct, // annual, %
  ssStartAge,
  ssMonthlyToday,
  employerMatchMonthly,
}) {
  const monthsAccum = Math.max(0, Math.round((retireAge - currentAge) * 12));
  const monthsDraw = Math.max(0, Math.round((endAge - retireAge) * 12));
  const r_pre = monthlyEffectiveRate(aprPre, 'monthly');
  const r_post = monthlyEffectiveRate(aprPost, 'monthly');
  const infl_m = inflationPct > 0 ? Math.pow(1 + inflationPct / 100, 1 / 12) : 1;

  let bal = balanceStart;
  let totalContrib = 0;
  let totalInterest = 0;
  let totalWithdrawn = 0;

  let atRetirement = null; // snapshot at retirement
  let depletedAt = null;   // snapshot when depleted (date index)

  const schedule = [];

  // Accumulation phase
  for (let i = 0; i < monthsAccum; i++) {
    const yearIndex = Math.floor(i / 12);
    const base = contribMonthly * Math.pow(1 + contribAnnualIncreasePct / 100, yearIndex);
    const contrib = base + (employerMatchMonthly || 0);
    if (contrib > 0) {
      bal += contrib; // start-of-month contribution
      totalContrib += contrib;
    }
    const interest = bal * r_pre;
    bal += interest;
    totalInterest += interest;
    const realBalance = infl_m !== 1 ? bal / Math.pow(infl_m, i + 1) : bal;
    schedule.push({
      phase: 'accum',
      idx: i + 1,
      contribution: contrib,
      interest,
      withdrawal: 0,
      totalContrib,
      totalInterest,
      totalWithdrawn,
      balance: bal,
      realBalance,
    });
  }

  // Record retirement snapshot
  atRetirement = {
    balance: bal,
    totalContrib,
    totalInterest,
  };

  // Drawdown phase
  const rateMonthly = (withdrawalRatePct / 100) / 12;
  for (let j = 0; j < monthsDraw; j++) {
    const i = monthsAccum + j;
    const monthsFromNow = i; // since start
    // Inflate monthly target & SS from today's dollars
    const inflFactor = Math.pow(infl_m, monthsFromNow);
    const ssNominal = ssMonthlyToday > 0 && (currentAge * 12 + i) >= (ssStartAge * 12) ? ssMonthlyToday * inflFactor : 0;
    let desiredWithdrawal = 0;
    if (incomeMode === 'target') {
      const targetNominal = targetIncomeMonthlyToday * inflFactor;
      desiredWithdrawal = Math.max(0, targetNominal - ssNominal);
    } else {
      // rate mode: proportion of balance minus SS offset
      const rateAmt = bal * rateMonthly;
      desiredWithdrawal = Math.max(0, rateAmt - ssNominal);
    }
    // Apply withdrawal at start of month
    let appliedWithdrawal = Math.min(bal, desiredWithdrawal);
    bal -= appliedWithdrawal;
    totalWithdrawn += appliedWithdrawal;

    // Then apply growth
    const interest = bal * r_post;
    bal += interest;
    totalInterest += interest;

    const realBalance = infl_m !== 1 ? bal / Math.pow(infl_m, monthsFromNow + 1) : bal;
    schedule.push({
      phase: 'retire',
      idx: i + 1,
      contribution: 0,
      interest,
      withdrawal: appliedWithdrawal,
      totalContrib,
      totalInterest,
      totalWithdrawn,
      balance: bal,
      realBalance,
    });

    if (depletedAt == null && bal <= 0.01) {
      depletedAt = i + 1; // month index since start (1-based)
      bal = 0;
      break;
    }
  }

  return {
    schedule,
    atRetirement,
    depletedAt,
    final: { balance: bal, totalContrib, totalInterest, totalWithdrawn },
  };
}

// Inputs
function NumericInput({ value, onCommitNumber, allowDecimal = false, min, max, precision, groupThousands, syncKey, ariaLabel, placeholder }) {
  const formatFromValue = (v) => {
    if (v == null) return '';
    if (precision != null && Number.isFinite(v)) return Number(v).toFixed(precision);
    return String(v);
  };
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
  const commit = (s) => {
    let out = normalize(s);
    if (out === '' || out === '.' || out === '-') out = '0';
    let n = allowDecimal ? parseFloat(out) : parseInt(out, 10);
    if (!Number.isFinite(n)) n = 0;
    if (min != null) n = Math.max(min, n);
    if (max != null) n = Math.min(max, n);
    onCommitNumber?.(n);
    setText(formatFromValue(n));
  };
  useLayoutEffect(() => {
    const pos = desiredCaretRef.current;
    if (pos != null && inputRef.current) {
      const el = inputRef.current;
      requestAnimationFrame(() => { try { el.setSelectionRange(pos, pos); } catch {} });
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
      onBlur={(e) => { setFocused(false); commit(e.target.value); }}
      onChange={(e) => {
        const el = e.target; const raw = el.value;
        if (!allowDecimal && groupThousands) {
          const digitsLeft = countDigitsLeftOf(raw, el.selectionStart);
          const s = normalize(raw); setText(s);
          const formatted = formatThousands(s);
          desiredCaretRef.current = caretFromDigitsLeft(formatted, digitsLeft);
        } else { const s = normalize(raw); setText(s); }
      }}
      onKeyDown={(e) => { if (["e","E","+","-"].includes(e.key)) e.preventDefault(); }}
    />
  );
}

const DonutCard = memo(function DonutCard({ segments, total, title }) {
  const [active, setActive] = useState(null);
  return (
    <div>
      <div className="retirement-calculator__field-label" style={{ marginBottom: '0.25rem' }}>
        <label>{title}</label>
      </div>
      <div style={{ width: '100%', height: 180, position: 'relative' }}>
        <ResponsiveContainer>
          <PieChart>
            <Pie data={segments} dataKey="value" nameKey="label" cx="50%" cy="50%" innerRadius={60} outerRadius={90}
              onMouseEnter={(_, idx) => setActive(segments[idx])} onMouseLeave={() => setActive(null)}>
              {segments.map((entry, idx) => (
                <Cell key={idx} fill={entry.color} stroke={(active && active.label === entry.label) ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.2)'} strokeWidth={(active && active.label === entry.label) ? 2 : 1} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="retirement-calculator__donut-center" aria-hidden>
          {active ? (
            <>
              <div className="retirement-calculator__donut-center-label">{active.label}</div>
              <div className="retirement-calculator__donut-center-value">{usdCents(active.value)}</div>
            </>
          ) : (
            <>
              <div className="retirement-calculator__donut-center-label">Total</div>
              <div className="retirement-calculator__donut-center-value">{usdCents(total)}</div>
            </>
          )}
        </div>
      </div>
      <div className="retirement-calculator__chart-legend">
        {segments.map((s) => {
          const isActive = active && active.label === s.label;
          return (
            <div key={s.label} className={`retirement-calculator__legend-item ${isActive ? 'is-active' : ''}`}>
              <span className="retirement-calculator__legend-dot" style={{ background: s.color }} onMouseEnter={() => setActive(s)} onMouseLeave={() => setActive(null)} />
              <span className="retirement-calculator__legend-label" onMouseEnter={() => setActive(s)} onMouseLeave={() => setActive(null)}>{s.label}</span>
              <span className="retirement-calculator__legend-value">{usdCents(s.value)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
});

const ScheduleTable = memo(function ScheduleTable({ rows, totals }) {
  return (
    <section className="retirement-calculator__schedule" aria-label="Retirement schedule">
      <div className="retirement-calculator__totals">
        <div>
          <span>Total Contributions</span>
          <strong>{usdCents(totals.totalContrib)}</strong>
        </div>
        <div>
          <span>Total Earnings</span>
          <strong>{usdCents(totals.totalInterest)}</strong>
        </div>
        <div>
          <span>Total Withdrawn</span>
          <strong>{usdCents(totals.totalWithdrawn)}</strong>
        </div>
        <div>
          <span>Ending Balance</span>
          <strong>{usdCents(totals.balance)}</strong>
        </div>
      </div>
      <div className="retirement-calculator__table">
        <div className="retirement-calculator__table-head">
          <div>#</div>
          <div>Date</div>
          <div>Age</div>
          <div>Contribution</div>
          <div>Interest</div>
          <div>Withdrawal</div>
          <div>Balance</div>
        </div>
        <div className="retirement-calculator__table-body">
          {rows.map((r) => (
            <div key={r.idx} className="retirement-calculator__table-row">
              <div>{r.idx}</div>
              <div>{r.dateStr}</div>
              <div>{r.ageStr}</div>
              <div>{usdCents(r.contribution)}</div>
              <div>{usdCents(r.interest)}</div>
              <div>{usdCents(r.withdrawal)}</div>
              <div>{usdCents(r.balance)}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
});

const RetirementResults = memo(function RetirementResults({ inputs, isUpdating, forceSkeleton }) {
  const shouldSkeleton = isUpdating || forceSkeleton;
  const result = useMemo(() => (shouldSkeleton ? null : buildRetirementSchedule(inputs)), [inputs, shouldSkeleton]);

  const startDate = useMemo(() => { const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); return d; }, []);
  const [granularity, setGranularity] = useState('yearly');

  // Derived data (must be declared before any early returns to satisfy hooks rules)
  const retirementBalance = result?.atRetirement?.balance ?? 0;
  const retirementDonut = [
    { label: 'Contributions', value: result?.atRetirement?.totalContrib || 0, color: 'rgba(34,197,94,0.55)' },
    { label: 'Earnings', value: result?.atRetirement?.totalInterest || 0, color: '#22C55E' },
  ];

  const seriesMonthly = useMemo(() => {
    if (!result) return [];
    return result.schedule.map((row, i) => {
      const d = new Date(startDate); d.setMonth(d.getMonth() + i);
      return {
        label: d.toLocaleDateString(undefined, { year: '2-digit', month: 'short' }),
        balance: row.balance,
        principal: row.totalContrib,
        interest: row.totalInterest,
        withdrawal: row.totalWithdrawn,
      };
    });
  }, [result, startDate]);

  const seriesYearly = useMemo(() => {
    if (!result) return [];
    const byYear = new Map();
    seriesMonthly.forEach((m, i) => {
      const d = new Date(startDate); d.setMonth(d.getMonth() + i);
      const y = d.getFullYear();
      byYear.set(y, { label: String(y), ...m });
    });
    return Array.from(byYear.values());
  }, [seriesMonthly, startDate, result]);

  const depletionStr = useMemo(() => {
    if (!result || !result.depletedAt) return 'Not depleted by end age';
    const d = new Date(startDate); d.setMonth(d.getMonth() + (result.depletedAt - 1));
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short' });
  }, [result, startDate]);

  const tableRowsMonthly = useMemo(() => {
    if (!result) return [];
    return result.schedule.map((m, i) => {
      const d = new Date(startDate); d.setMonth(d.getMonth() + i);
      const monthsAge = (inputs.currentAge * 12) + i;
      const ageY = Math.floor(monthsAge / 12);
      const ageM = monthsAge % 12;
      return {
        idx: i + 1,
        dateStr: d.toLocaleDateString(undefined, { year: '2-digit', month: 'short' }),
        ageStr: `${ageY}y ${ageM}m`,
        contribution: m.contribution,
        interest: m.interest,
        withdrawal: m.withdrawal,
        balance: m.balance,
      };
    });
  }, [result, startDate, inputs.currentAge]);

  const tableRowsYearly = useMemo(() => {
    if (!result) return [];
    const byYear = new Map();
    result.schedule.forEach((m, i) => {
      const d = new Date(startDate); d.setMonth(d.getMonth() + i);
      const y = d.getFullYear();
      const monthsAge = (inputs.currentAge * 12) + i;
      const ageY = Math.floor(monthsAge / 12);
      const acc = byYear.get(y) || {
        idx: byYear.size + 1,
        dateStr: String(y),
        ageStr: `${ageY}y`,
        contribution: 0,
        interest: 0,
        withdrawal: 0,
        balance: m.balance,
      };
      acc.dateStr = String(y);
      acc.ageStr = `${ageY}y`;
      acc.contribution += m.contribution;
      acc.interest += m.interest;
      acc.withdrawal += m.withdrawal;
      acc.balance = m.balance; // end-of-year balance
      byYear.set(y, acc);
    });
    return Array.from(byYear.values()).map((r, i) => ({ ...r, idx: i + 1 }));
  }, [result, startDate, inputs.currentAge]);

  if (shouldSkeleton) {
    return (
      <>
        <section className="retirement-calculator__summary" aria-label="Summary and charts" aria-busy>
          <div className="retirement-calculator__summary-card">
            <div className="sk sk-line" style={{ width: '60%' }} />
            <div className="sk sk-line" style={{ width: '70%', marginTop: 8 }} />
            <div className="sk sk-line" style={{ width: '50%', marginTop: 8 }} />
          </div>
          <div className="retirement-calculator__charts">
            <div className="retirement-calculator__chart"><div className="sk sk-circle" style={{ width: 160, height: 160, margin: '0 auto' }} /></div>
            <div className="retirement-calculator__chart"><div className="sk sk-rect" style={{ width: '100%', height: 260 }} /></div>
          </div>
        </section>
        <section className="retirement-calculator__schedule" aria-busy>
          <div className="retirement-calculator__totals">
            {Array.from({ length: 4 }).map((_, i) => (<div key={i}><span className="sk sk-line" style={{ width: '12ch' }} /></div>))}
          </div>
          <div className="retirement-calculator__table">
            <div className="retirement-calculator__table-head">{Array.from({ length: 7 }).map((_, i) => (<div key={i} className="sk sk-line sm" />))}</div>
            <div className="retirement-calculator__table-body">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="skeleton-row">{Array.from({ length: 7 }).map((__, j) => (<div key={j} className="sk sk-line" />))}</div>
              ))}
            </div>
          </div>
        </section>
      </>
    );
  }

  // Summary numbers are derived above

  return (
    <>
      <section className="retirement-calculator__summary" aria-label="Summary and charts">
        <div className="retirement-calculator__summary-card">
          <div className="retirement-calculator__summary-card-line">
            <span>Balance at Retirement</span>
            <strong>{usdCents(retirementBalance)}</strong>
          </div>
          <div className="retirement-calculator__summary-card-line">
            <span>Total Contributions</span>
            <strong>{usdCents(result.final.totalContrib)}</strong>
          </div>
          <div className="retirement-calculator__summary-card-line">
            <span>Total Earnings</span>
            <strong>{usdCents(result.final.totalInterest)}</strong>
          </div>
          <div className="retirement-calculator__summary-card-meta" style={{ marginTop: '0.4rem' }}>
            <span>Depletion</span>
            <b>{depletionStr}</b>
          </div>
        </div>

        <div className="retirement-calculator__charts">
          <div className="retirement-calculator__chart">
            <DonutCard segments={retirementDonut} total={retirementBalance} title="At-Retirement Breakdown" />
          </div>
          <div className="retirement-calculator__chart">
            <div className="retirement-calculator__field-label" style={{ marginBottom: '0.25rem' }}>
              <label>Balance Over Time</label>
              <div className="retirement-calculator__segmented" role="group" aria-label="Chart granularity">
                <button type="button" className={`retirement-calculator__segmented-btn ${granularity === 'yearly' ? 'is-active' : ''}`} aria-pressed={granularity === 'yearly'} onPointerDown={() => setGranularity('yearly')}>Yearly</button>
                <button type="button" className={`retirement-calculator__segmented-btn ${granularity === 'monthly' ? 'is-active' : ''}`} aria-pressed={granularity === 'monthly'} onPointerDown={() => setGranularity('monthly')}>Monthly</button>
              </div>
            </div>
            <div style={{ width: '100%', height: 260 }}>
              <ResponsiveContainer>
                <AreaChart data={granularity === 'monthly' ? seriesMonthly : seriesYearly} margin={{ top: 6, right: 12, bottom: 12, left: 0 }}>
                  <defs>
                    <linearGradient id="rtGrad" x1="0" y1="0" x2="0" y2="1">
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
                        <div>Balance: {usdCents(d.balance)}</div>
                        <div>Contrib (cum): {usdCents(d.principal)}</div>
                        <div>Earnings (cum): {usdCents(d.interest)}</div>
                        <div>Withdrawn (cum): {usdCents(d.withdrawal)}</div>
                      </div>
                    );
                  }} />
                  <Area type="monotone" dataKey="balance" stroke="#22C55E" fill="url(#rtGrad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </section>
      <ScheduleTable rows={granularity === 'monthly' ? tableRowsMonthly : tableRowsYearly} totals={result.final} />
    </>
  );
});

const RetirementCalculator = () => {
  // Basic inputs
  const [currentAge, setCurrentAge] = useState(35);
  const [retireAge, setRetireAge] = useState(67);
  const [endAge, setEndAge] = useState(95);
  const [balanceStart, setBalanceStart] = useState(80000);
  const [contribMonthly, setContribMonthly] = useState(800);
  const [contribAnnualIncreasePct, setContribIncrease] = useState(2.0);
  const [aprPre, setAprPre] = useState(7.0);
  const [aprPost, setAprPost] = useState(5.0);
  const [inflationPct, setInflationPct] = useState(0);

  const [incomeMode, setIncomeMode] = useState('target'); // 'target' | 'rate'
  const [targetIncomeMonthlyToday, setTargetIncomeMonthlyToday] = useState(4000);
  const [withdrawalRatePct, setWithdrawalRatePct] = useState(4.0);

  // Advanced
  const [ssStartAge, setSsStartAge] = useState(67);
  const [ssMonthlyToday, setSsMonthlyToday] = useState(0);
  const [employerMatchMonthly, setEmployerMatchMonthly] = useState(0);

  const inputs = useMemo(() => ({
    currentAge, retireAge, endAge,
    balanceStart,
    contribMonthly,
    contribAnnualIncreasePct,
    aprPre, aprPost,
    inflationPct,
    incomeMode,
    targetIncomeMonthlyToday,
    withdrawalRatePct,
    ssStartAge,
    ssMonthlyToday,
    employerMatchMonthly,
  }), [currentAge, retireAge, endAge, balanceStart, contribMonthly, contribAnnualIncreasePct, aprPre, aprPost, inflationPct, incomeMode, targetIncomeMonthlyToday, withdrawalRatePct, ssStartAge, ssMonthlyToday, employerMatchMonthly]);

  const deferredInputs = useDeferredValue(inputs);
  const isUpdating = inputs !== deferredInputs;
  const [forceSkeleton, setForceSkeleton] = useState(true);
  useEffect(() => { const id = requestAnimationFrame(() => setForceSkeleton(false)); return () => cancelAnimationFrame(id); }, []);

  return (
    <div className="retirement-calculator">
      <header className="retirement-calculator__header">
        <h1>Retirement Calculator</h1>
        <p>Project your savings to retirement and model withdrawals with inflation.</p>
      </header>

      <div className="retirement-calculator__grid">
        <section className="retirement-calculator__inputs" aria-label="Inputs">
          <div className="retirement-calculator__field ages">
            <div className="retirement-calculator__field-label"><label>Ages</label></div>
            <div className="retirement-calculator__field--split">
              <div>
                <div className="retirement-calculator__field-control">
                  <NumericInput value={currentAge} onCommitNumber={(v) => setCurrentAge(clamp(Math.round(v), 18, 80))} min={18} allowDecimal={false} ariaLabel="Current age" />
                  <span className="retirement-calculator__suffix">now</span>
                </div>
              </div>
              <div>
                <div className="retirement-calculator__field-control">
                  <NumericInput value={retireAge} onCommitNumber={(v) => setRetireAge(clamp(Math.round(v), currentAge + 1, 80))} min={currentAge + 1} allowDecimal={false} ariaLabel="Retirement age" />
                  <span className="retirement-calculator__suffix">retire</span>
                </div>
              </div>
              <div>
                <div className="retirement-calculator__field-control">
                  <NumericInput value={endAge} onCommitNumber={(v) => setEndAge(clamp(Math.round(v), retireAge + 1, 110))} min={retireAge + 1} allowDecimal={false} ariaLabel="End age" />
                  <span className="retirement-calculator__suffix">end</span>
                </div>
              </div>
            </div>
          </div>

          <div className="retirement-calculator__field start-balance">
            <label>Starting Balance</label>
            <div className="retirement-calculator__field-control">
              <span className="retirement-calculator__prefix">$</span>
              <NumericInput value={balanceStart} onCommitNumber={setBalanceStart} min={0} allowDecimal={false} groupThousands ariaLabel="Starting balance" />
            </div>
          </div>

          <div className="retirement-calculator__field contribution">
            <div className="retirement-calculator__field-label">
              <label>Monthly Contribution</label>
            </div>
            <div className="retirement-calculator__field-control">
              <span className="retirement-calculator__prefix">$</span>
              <NumericInput value={contribMonthly} onCommitNumber={setContribMonthly} min={0} allowDecimal={false} groupThousands ariaLabel="Monthly contribution" />
            </div>
          </div>

          <div className="retirement-calculator__field contrib-inc">
            <label>Contribution Increase</label>
            <div className="retirement-calculator__field-control">
              <NumericInput value={contribAnnualIncreasePct} onCommitNumber={setContribIncrease} min={0} allowDecimal precision={2} ariaLabel="Contribution increase percent" />
              <span className="retirement-calculator__suffix">%/yr</span>
            </div>
          </div>

          <div className="retirement-calculator__field returns">
            <div className="retirement-calculator__field-label"><label>Expected Returns</label></div>
            <div className="retirement-calculator__field--split">
              <div>
                <div className="retirement-calculator__field-control">
                  <NumericInput value={aprPre} onCommitNumber={setAprPre} min={0} allowDecimal precision={2} ariaLabel="APR pre-retirement" />
                  <span className="retirement-calculator__suffix">% pre</span>
                </div>
              </div>
              <div>
                <div className="retirement-calculator__field-control">
                  <NumericInput value={aprPost} onCommitNumber={setAprPost} min={0} allowDecimal precision={2} ariaLabel="APR post-retirement" />
                  <span className="retirement-calculator__suffix">% post</span>
                </div>
              </div>
            </div>
          </div>

          <div className="retirement-calculator__field income-mode">
            <div className="retirement-calculator__field-label">
              <label>Retirement Income</label>
              <div className="retirement-calculator__segmented" role="group" aria-label="Retirement income mode">
                <button type="button" className={`retirement-calculator__segmented-btn ${incomeMode === 'target' ? 'is-active' : ''}`} aria-pressed={incomeMode === 'target'} onPointerDown={() => setIncomeMode('target')}>$</button>
                <button type="button" className={`retirement-calculator__segmented-btn ${incomeMode === 'rate' ? 'is-active' : ''}`} aria-pressed={incomeMode === 'rate'} onPointerDown={() => setIncomeMode('rate')}>%</button>
              </div>
            </div>
            <div className="retirement-calculator__field-control">
              {incomeMode === 'target' && <span className="retirement-calculator__prefix">$</span>}
              {incomeMode === 'target' ? (
                <NumericInput value={targetIncomeMonthlyToday} onCommitNumber={setTargetIncomeMonthlyToday} min={0} allowDecimal={false} groupThousands ariaLabel="Target income monthly" />
              ) : (
                <NumericInput value={withdrawalRatePct} onCommitNumber={setWithdrawalRatePct} min={0} allowDecimal precision={2} ariaLabel="Withdrawal rate percent" />
              )}
              {incomeMode === 'target' && <span className="retirement-calculator__suffix">per month</span>}
              {incomeMode === 'rate' && <span className="retirement-calculator__suffix">%/yr</span>}
            </div>
          </div>

          <details className="retirement-calculator__advanced">
            <summary>Advanced</summary>
            <div className="retirement-calculator__field ss-amount">
              <label>Social Security (monthly)</label>
              <div className="retirement-calculator__field-control">
                <span className="retirement-calculator__prefix">$</span>
                <NumericInput value={ssMonthlyToday} onCommitNumber={setSsMonthlyToday} min={0} allowDecimal={false} groupThousands ariaLabel="SS monthly" />
              </div>
            </div>
            <div className="retirement-calculator__field ss-age">
              <label>SS Start Age</label>
              <div className="retirement-calculator__field-control">
                <NumericInput value={ssStartAge} onCommitNumber={(v) => setSsStartAge(clamp(Math.round(v), retireAge, 70))} min={retireAge} allowDecimal={false} ariaLabel="SS start age" />
                <span className="retirement-calculator__suffix">years</span>
              </div>
            </div>
            <div className="retirement-calculator__field inflation">
              <label>Inflation</label>
              <div className="retirement-calculator__field-control">
                <NumericInput value={inflationPct} onCommitNumber={setInflationPct} min={0} allowDecimal precision={2} ariaLabel="Inflation percent" />
                <span className="retirement-calculator__suffix">%/yr</span>
              </div>
            </div>
            <div className="retirement-calculator__field employer">
              <label>Employer Match (monthly)</label>
              <div className="retirement-calculator__field-control">
                <span className="retirement-calculator__prefix">$</span>
                <NumericInput value={employerMatchMonthly} onCommitNumber={setEmployerMatchMonthly} min={0} allowDecimal={false} groupThousands ariaLabel="Employer match monthly" />
              </div>
            </div>
          </details>
        </section>

        <RetirementResults inputs={deferredInputs} isUpdating={isUpdating} forceSkeleton={forceSkeleton} />
      </div>
    </div>
  );
};

export default RetirementCalculator;
