import React from 'react';
import { Link } from 'react-router-dom';
import './Home.scss';
import { FiHome } from 'react-icons/fi';
import { MdPayments } from 'react-icons/md';
import { LuChartNoAxesCombined } from 'react-icons/lu';
import { FaChartPie } from 'react-icons/fa6';

const calculators = [
  {
    key: 'mortgage',
    title: 'Mortgage Calculator',
    desc: 'Estimate monthly payments, total interest, and payoff timelines.',
    to: '/calculator/mortgage',
    icon: (<FiHome />),
  },
  {
    key: 'compound',
    title: 'Compound Interest',
    desc: 'Project growth over time with principal, rate, and contributions.',
    to: '/calculator/compound-interest',
    icon: (<LuChartNoAxesCombined />),
  },
  {
    key: 'retirement',
    title: 'Retirement Savings',
    desc: 'Forecast retirement readiness based on savings and returns.',
    to: '/calculator/retirement',
    icon: (<FaChartPie />),
  },
  {
    key: 'loan',
    title: 'Loan Payoff',
    desc: 'Compare payoff strategies and interest saved over time.',
    to: '/calculator/loan-payoff',
    icon: (<MdPayments />),
  },
];

const Home = () => {
  return (
    <div className="home">
      <section className="home__hero" aria-label="Hero">
        <div className="home__hero-kicker">Plan with clarity</div>
        <h1 className="home__hero-title">Financial calculators to forecast your future.</h1>
        <p className="home__hero-subtitle">
          Explore intuitive tools to estimate payments, project growth, and build confidence in your financial decisions.
        </p>
      </section>

      <div className="home__section-header" id="calculators">
        <h2>Calculators</h2>
      </div>

      <section className="home__cards" aria-label="Calculator Cards">
        {calculators.map((c) => (
          <article key={c.key} className="home__calc-card">
            <div className="home__calc-card-icon" aria-hidden="true">{c.icon}</div>
            <h3 className="home__calc-card-title">{c.title}</h3>
            <p className="home__calc-card-desc">{c.desc}</p>
            <Link className="home__calc-card-cta" to={c.to} aria-label={`Open ${c.title}`}>
              Open
            </Link>
          </article>
        ))}
      </section>
    </div>
  );
};

export default Home;
