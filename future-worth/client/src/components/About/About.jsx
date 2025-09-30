import React from 'react';
import { Link } from 'react-router-dom';
import './About.scss';

const About = () => {
  return (
    <div className="about">
      <section className="about__hero" aria-label="About FutureWorth">
        <h1 className="about__hero-title">About</h1>
        <p className="about__hero-subtitle">
          FutureWorth helps you explore money questions with clarity. Our goal is to make financial literacy approachable by
          showing how today’s choices ripple through time.
        </p>
      </section>

      <section className="about__section" aria-label="Why Planning Matters">
        <h2>Why Planning Matters</h2>
        <p>
          Small decisions compound into big outcomes. Planning brings those trade‑offs into view: what payment you can afford,
          how contributions add up, and when a goal becomes reachable. When you can see the arc of a decision in advance, it’s
          easier to choose with confidence.
        </p>
      </section>

      <section className="about__section" aria-label="The Power of Compounding">
        <h2>The Power of Compounding</h2>
        <p>
          Compounding is growth on top of growth. Imagine contributing $500 per month at a 10% annual return. Over 30 years you
          would contribute $180,000, but your balance could be around $1.1M — several times your contributions thanks to earnings
          on previous earnings. Starting earlier and staying consistent are the biggest levers.
        </p>
      </section>

      <section className="about__section" aria-label="What These Tools Do">
        <h2>What These Tools Do</h2>
        <div className="about__grid">
          <article className="about__card">
            <h3>Mortgage</h3>
            <p>Estimate payments, see PMI drop‑off, and test extra principal to accelerate payoff.</p>
            <Link className="about__cta" to="/calculator/mortgage">Open Mortgage</Link>
          </article>
          <article className="about__card">
            <h3>Compound Interest</h3>
            <p>Project balances with principal, recurring contributions, annual increases, and inflation.</p>
            <Link className="about__cta" to="/calculator/compound-interest">Open Compound</Link>
          </article>
          <article className="about__card">
            <h3>Retirement</h3>
            <p>Model accumulation and withdrawals, with inflation‑adjusted income and depletion visibility.</p>
            <Link className="about__cta" to="/calculator/retirement">Open Retirement</Link>
          </article>
          <article className="about__card">
            <h3>Loan Payoff</h3>
            <p>Compare strategies, incorporate fees, and visualize interest saved with extra payments.</p>
            <Link className="about__cta" to="/calculator/loan-payoff">Open Loan Payoff</Link>
          </article>
        </div>
      </section>

      <section className="about__section" aria-label="Use Responsibly">
        <h2>Use Responsibly</h2>
        <p>
          These projections are simplified. Real‑world outcomes vary with fees, taxes, market conditions, and personal
          circumstances. Treat results as guides, not guarantees.
        </p>
      </section>
    </div>
  );
};

export default About;
