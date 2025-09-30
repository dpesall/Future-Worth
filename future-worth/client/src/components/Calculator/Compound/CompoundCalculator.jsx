import React, { useEffect, useMemo, useState, useRef, useLayoutEffect, memo, useDeferredValue } from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip } from 'recharts';
import './CompoundCalculator.scss';

const clamp = (v, min, max) => Math.min(Math.max(v ?? 0, min), max);
const usd = (n) => n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const usdCents = (n) => n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });

function monthlyEffectiveRate(aprPct, comp) {
  const r = aprPct / 100;
  const m = comp === 'monthly' ? 12 : comp === 'quarterly' ? 4 : comp === 'annual' ? 1 : 365;
  const f = Math.pow(1 + r / m, m / 12) - 1;
  return f;
}

function buildCompoundSchedule({
  principal,
  contribAmount,
  contribFreq, // 'monthly' | 'annual'
  apr,
  compounding, // 'monthly' | 'quarterly' | 'annual' | 'daily'
  years,
  contribAnnualIncreasePct,
  inflationPct,
}) {
  const months = Math.round(years * 12);
  const r_m = monthlyEffectiveRate(apr, compounding);
  const infl_m = inflationPct > 0 ? Math.pow(1 + inflationPct / 100, 1 / 12) : 1;
  let bal = principal;
  let totalContrib = 0;
  let totalInterest = 0;

  const schedule = [];
  for (let i = 0; i < months; i++) {
    const yearIndex = Math.floor(i / 12);
    const contribBase = contribAmount * Math.pow(1 + contribAnnualIncreasePct / 100, yearIndex);
    const thisMonthContrib = (contribFreq === 'monthly') ? contribBase : (i % 12 === 0 ? contribBase : 0);

    // Always contribute at the start of the period (e.g., 1st of month/year)
    if (thisMonthContrib > 0) {
      bal += thisMonthContrib;
      totalContrib += thisMonthContrib;
    }

    const interest = bal * r_m;
    bal += interest;
    totalInterest += interest;

    // No end-of-period contribution; timing is always at the start now

    const realBalance = bal / Math.pow(infl_m, i + 1);
    schedule.push({
      idx: i + 1,
      label: `M${i + 1}`,
      balance: bal,
      realBalance,
      interest,
      contribution: thisMonthContrib,
      totalContrib,
      totalInterest,
    });
  }

  return {
    schedule,
    final: { balance: bal, totalContrib, totalInterest },
  };
}

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

const DonutCard = memo(function DonutCard({ segments, total }) {
  const [active, setActive] = useState(null);
  return (
    <div>
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
        <div className="compound-calculator__donut-center" aria-hidden>
          {active ? (
            <>
              <div className="compound-calculator__donut-center-label">{active.label}</div>
              <div className="compound-calculator__donut-center-value">{usdCents(active.value)}</div>
            </>
          ) : (
            <>
              <div className="compound-calculator__donut-center-label">Final Balance</div>
              <div className="compound-calculator__donut-center-value">{usdCents(total)}</div>
            </>
          )}
        </div>
      </div>
      <div className="compound-calculator__chart-legend">
        {segments.map((s) => {
          const isActive = active && active.label === s.label;
          return (
            <div key={s.label} className={`compound-calculator__legend-item ${isActive ? 'is-active' : ''}`}>
              <span className="compound-calculator__legend-dot" style={{ background: s.color }} onMouseEnter={() => setActive(s)} onMouseLeave={() => setActive(null)} />
              <span className="compound-calculator__legend-label" onMouseEnter={() => setActive(s)} onMouseLeave={() => setActive(null)}>{s.label}</span>
              <span className="compound-calculator__legend-value">{usdCents(s.value)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
});

const ScheduleTable = memo(function ScheduleTable({ rows, totals }) {
  return (
    <section className="compound-calculator__schedule" aria-label="Growth schedule">
      <div className="compound-calculator__totals">
        <div>
          <span>Total Contributions</span>
          <strong>{usdCents(totals.totalContrib)}</strong>
        </div>
        <div>
          <span>Total Earnings</span>
          <strong>{usdCents(totals.totalInterest)}</strong>
        </div>
        <div>
          <span>Final Balance</span>
          <strong>{usdCents(totals.balance)}</strong>
        </div>
      </div>

      <div className="compound-calculator__table">
        <div className="compound-calculator__table-head">
          <div>#</div>
          <div>Date</div>
          <div>Contribution</div>
          <div>Interest</div>
          <div>Cumulative Contrib</div>
          <div>Cumulative Earn</div>
          <div>Balance</div>
        </div>
        <div className="compound-calculator__table-body">
          {rows.map((r) => (
            <div key={r.idx} className="compound-calculator__table-row">
              <div>{r.idx}</div>
              <div>{r.dateStr}</div>
              <div>{usdCents(r.contribution)}</div>
              <div>{usdCents(r.interest)}</div>
              <div>{usdCents(r.totalContrib)}</div>
              <div>{usdCents(r.totalInterest)}</div>
              <div>{usdCents(r.balance)}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
});

const CompoundResults = memo(function CompoundResults({ inputs, isUpdating, forceSkeleton }) {
  const shouldSkeleton = isUpdating || forceSkeleton;
  const result = useMemo(() => (shouldSkeleton ? null : buildCompoundSchedule(inputs)), [inputs, shouldSkeleton]);

  const breakdown = useMemo(() => {
    if (!result) return [];
    const { totalContrib, totalInterest } = result.final;
    return [
      { label: 'Contributions', value: totalContrib, color: 'rgba(34,197,94,0.55)' },
      { label: 'Earnings', value: totalInterest, color: '#22C55E' },
    ];
  }, [result]);

  const startDate = useMemo(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const monthlySeries = useMemo(() => {
    if (!result) return [];
    return result.schedule.map((m, i) => {
      const d = new Date(startDate);
      d.setMonth(d.getMonth() + i);
      return {
        date: d,
        label: d.toLocaleDateString(undefined, { year: '2-digit', month: 'short' }),
        balance: inputs.inflationPct > 0 ? m.realBalance : m.balance,
        principal: m.totalContrib + inputs.principal,
        earnings: m.totalInterest,
      };
    });
  }, [result, inputs.inflationPct, inputs.principal, startDate]);

  const yearlySeries = useMemo(() => {
    if (!result) return [];
    const byYear = new Map();
    monthlySeries.forEach((m) => {
      const y = m.date.getFullYear();
      byYear.set(y, { ...m, label: String(y) });
    });
    return Array.from(byYear.values());
  }, [monthlySeries]);

  const [granularity, setGranularity] = useState('yearly');

  const tableRowsMonthly = useMemo(() => {
    if (!result) return [];
    return result.schedule.map((m, i) => {
      const d = new Date(startDate);
      d.setMonth(d.getMonth() + i);
      return {
        idx: i + 1,
        dateStr: d.toLocaleDateString(undefined, { year: '2-digit', month: 'short' }),
        contribution: m.contribution,
        interest: m.interest,
        totalContrib: m.totalContrib,
        totalInterest: m.totalInterest,
        balance: m.balance,
      };
    });
  }, [result, startDate]);

  const tableRowsYearly = useMemo(() => {
    if (!result) return [];
    const byYear = new Map();
    result.schedule.forEach((m, i) => {
      const d = new Date(startDate); d.setMonth(d.getMonth() + i);
      const y = d.getFullYear();
      const acc = byYear.get(y) || {
        idx: byYear.size + 1,
        dateStr: String(y),
        contribution: 0,
        interest: 0,
        totalContrib: 0,
        totalInterest: 0,
        balance: m.balance,
      };
      acc.dateStr = String(y);
      acc.contribution += m.contribution;
      acc.interest += m.interest;
      acc.totalContrib = m.totalContrib; // cumulative as of end of year
      acc.totalInterest = m.totalInterest; // cumulative as of end of year
      acc.balance = m.balance; // end-of-year balance
      byYear.set(y, acc);
    });
    return Array.from(byYear.values()).map((r, i) => ({ ...r, idx: i + 1 }));
  }, [result, startDate]);

  if (shouldSkeleton) {
    return (
      <>
        <section className="compound-calculator__summary" aria-label="Summary and charts" aria-busy>
          <div className="compound-calculator__summary-card">
            <div className="sk sk-line" style={{ width: '60%' }} />
            <div className="sk sk-line" style={{ width: '70%', marginTop: 8 }} />
            <div className="sk sk-line" style={{ width: '50%', marginTop: 8 }} />
          </div>
          <div className="compound-calculator__charts">
            <div className="compound-calculator__chart"><div className="sk sk-circle" style={{ width: 160, height: 160, margin: '0 auto' }} /></div>
            <div className="compound-calculator__chart"><div className="sk sk-rect" style={{ width: '100%', height: 260 }} /></div>
          </div>
        </section>
        <section className="compound-calculator__schedule" aria-label="Growth schedule" aria-busy>
          <div className="compound-calculator__totals">
            <div><span className="sk sk-line" style={{ width: '12ch' }} /></div>
            <div><span className="sk sk-line" style={{ width: '12ch' }} /></div>
            <div><span className="sk sk-line" style={{ width: '12ch' }} /></div>
          </div>
          <div className="compound-calculator__table">
            <div className="compound-calculator__table-head">
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="sk sk-line sm" />
              ))}
            </div>
            <div className="compound-calculator__table-body">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="skeleton-row">{Array.from({ length: 7 }).map((__, j) => (<div key={j} className="sk sk-line" />))}</div>
              ))}
            </div>
          </div>
        </section>
      </>
    );
  }

  return (
    <>
    <section className="compound-calculator__summary" aria-label="Summary and charts">
      <div className="compound-calculator__summary-card">
        <div className="compound-calculator__summary-card-line">
          <span>Final Balance</span>
          <strong>{usdCents(result.final.balance)}</strong>
        </div>
        <div className="compound-calculator__summary-card-line">
          <span>Total Contributions</span>
          <strong>{usdCents(result.final.totalContrib)}</strong>
        </div>
        <div className="compound-calculator__summary-card-line">
          <span>Total Earnings</span>
          <strong>{usdCents(result.final.totalInterest)}</strong>
        </div>
      </div>

      <div className="compound-calculator__charts">
        <div className="compound-calculator__chart">
          <DonutCard segments={breakdown} total={result.final.balance} />
        </div>
        <div className="compound-calculator__chart">
          <div className="compound-calculator__field-label" style={{ marginBottom: '0.25rem' }}>
            <label>Balance Over Time</label>
            <div className="compound-calculator__segmented" role="group" aria-label="Chart granularity">
              <button type="button" className={`compound-calculator__segmented-btn ${granularity === 'yearly' ? 'is-active' : ''}`} aria-pressed={granularity === 'yearly'} onPointerDown={() => setGranularity('yearly')}>Yearly</button>
              <button type="button" className={`compound-calculator__segmented-btn ${granularity === 'monthly' ? 'is-active' : ''}`} aria-pressed={granularity === 'monthly'} onPointerDown={() => setGranularity('monthly')}>Monthly</button>
            </div>
          </div>
          <div style={{ width: '100%', height: 260 }}>
            <ResponsiveContainer>
              <AreaChart
                data={granularity === 'monthly' ? monthlySeries : yearlySeries}
                margin={{ top: 6, right: 12, bottom: 12, left: 0 }}
              >
                <defs>
                  <linearGradient id="ciGrad" x1="0" y1="0" x2="0" y2="1">
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
                      <div>Principal: {usdCents(d.principal)}</div>
                      <div>Earnings: {usdCents(d.earnings)}</div>
                    </div>
                  );
                }} />
                <Area type="monotone" dataKey="balance" stroke="#22C55E" fill="url(#ciGrad)" strokeWidth={2} />
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

const CompoundCalculator = () => {
  const [principal, setPrincipal] = useState(10000);
  const [contribMode, setContribMode] = useState('monthly');
  const [contrib, setContrib] = useState(500);
  const [apr, setApr] = useState(7);
  const [compounding, setCompounding] = useState('monthly');
  const [years, setYears] = useState(20);
  const [increasePct, setIncreasePct] = useState(0);
  const [inflPct, setInflPct] = useState(0);

  const inputs = useMemo(() => ({
    principal,
    contribAmount: contrib,
    contribFreq: contribMode,
    apr,
    compounding,
    years,
    contribAnnualIncreasePct: increasePct,
    inflationPct: inflPct,
  }), [principal, contrib, contribMode, apr, compounding, years, increasePct, inflPct]);

  const deferredInputs = useDeferredValue(inputs);
  const isUpdating = inputs !== deferredInputs;

  const [forceSkeleton, setForceSkeleton] = useState(true);
  useEffect(() => { const id = requestAnimationFrame(() => setForceSkeleton(false)); return () => cancelAnimationFrame(id); }, []);

  return (
    <div className="compound-calculator">
      <header className="compound-calculator__header">
        <h1>Compound Interest</h1>
        <p>Project future value with contributions, compounding, and inflation.</p>
      </header>

      <div className="compound-calculator__grid">
        <section className="compound-calculator__inputs" aria-label="Inputs">
          <div className="compound-calculator__field initial-principal">
            <label>Initial Principal</label>
            <div className="compound-calculator__field-control">
              <span className="compound-calculator__prefix">$</span>
              <NumericInput value={principal} onCommitNumber={setPrincipal} min={0} allowDecimal={false} groupThousands ariaLabel="Initial principal" />
            </div>
          </div>

          <div className="compound-calculator__field contribution-amount">
            <div className="compound-calculator__field-label">
              <label>Contribution</label>
              <div className="compound-calculator__segmented" role="group" aria-label="Contribution frequency">
                <button type="button" className={`compound-calculator__segmented-btn ${contribMode === 'monthly' ? 'is-active' : ''}`} aria-pressed={contribMode === 'monthly'} onPointerDown={() => setContribMode('monthly')}>Monthly</button>
                <button type="button" className={`compound-calculator__segmented-btn ${contribMode === 'annual' ? 'is-active' : ''}`} aria-pressed={contribMode === 'annual'} onPointerDown={() => setContribMode('annual')}>Annual</button>
              </div>
            </div>
            <div className="compound-calculator__field-control">
              <span className="compound-calculator__prefix">$</span>
              <NumericInput value={contrib} onCommitNumber={setContrib} min={0} allowDecimal={false} groupThousands ariaLabel="Contribution amount" />
            </div>
          </div>

          <div className="compound-calculator__field apr">
            <label>APR</label>
            <div className="compound-calculator__field-control">
              <NumericInput value={apr} onCommitNumber={setApr} min={0} allowDecimal precision={2} ariaLabel="APR" />
              <span className="compound-calculator__suffix">%</span>
            </div>
          </div>

          <div className="compound-calculator__field years">
            <label>Years</label>
            <div className="compound-calculator__field-control">
              <NumericInput value={years} onCommitNumber={(v) => setYears(Math.max(1, Math.round(v)))} min={1} allowDecimal={false} ariaLabel="Years" />
              <span className="compound-calculator__suffix">yrs</span>
            </div>
          </div>

          <div className="compound-calculator__field compounding">
            <div className="compound-calculator__field-label">
              <label>Compounding</label>
            </div>
            <div className="compound-calculator__field-control compound-calculator__select-control">
              <select
                aria-label="Compounding frequency"
                value={compounding}
                onChange={(e) => setCompounding(e.target.value)}
              >
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="annual">Annual</option>
              </select>
            </div>
          </div>

          <div className="compound-calculator__field contrib-increase">
            <label>Contribution Increase</label>
            <div className="compound-calculator__field-control">
              <NumericInput value={increasePct} onCommitNumber={setIncreasePct} min={0} allowDecimal precision={2} ariaLabel="Annual increase percent" />
              <span className="compound-calculator__suffix">%/yr</span>
            </div>
          </div>

          <div className="compound-calculator__field inflation">
            <label>Inflation</label>
            <div className="compound-calculator__field-control">
              <NumericInput value={inflPct} onCommitNumber={setInflPct} min={0} allowDecimal precision={2} ariaLabel="Inflation percent" />
              <span className="compound-calculator__suffix">%/yr</span>
            </div>
          </div>
        </section>

        <CompoundResults inputs={deferredInputs} isUpdating={isUpdating} forceSkeleton={forceSkeleton} />
      </div>
    </div>
  );
};

export default CompoundCalculator;
