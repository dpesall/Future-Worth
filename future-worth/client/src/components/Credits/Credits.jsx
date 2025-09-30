import React from 'react';
import './Credits.scss';
import { SiReact, SiReactrouter, SiSass, SiJavascript } from 'react-icons/si';
import { MdStackedBarChart } from 'react-icons/md';
import { FiUser } from 'react-icons/fi';
import { FaPeopleGroup } from 'react-icons/fa6';

const AUTHOR = 'Drew';

const Credits = () => {
  return (
    <div className="credits">
      <section className="credits__hero" aria-label="Credits">
        <h1 className="credits__hero-title">Credits</h1>
        <p className="credits__hero-subtitle">FutureWorth is a set of simple, high‑performance calculators for planning and learning.</p>
      </section>

      <section className="credits__section" aria-label="Built With">
        <h2>Built With</h2>
        <div className="credits__stack-grid">
          <article className="credits__card">
            <div className="credits__icon" aria-hidden><SiReact /></div>
            <h3 className="credits__card-title">React</h3>
            <p className="credits__card-desc">UI & Routing</p>
          </article>
          <article className="credits__card">
            <div className="credits__icon" aria-hidden><SiReactrouter /></div>
            <h3 className="credits__card-title">React Router</h3>
            <p className="credits__card-desc">Navigation</p>
          </article>
          <article className="credits__card">
            <div className="credits__icon" aria-hidden><MdStackedBarChart /></div>
            <h3 className="credits__card-title">Recharts</h3>
            <p className="credits__card-desc">Charts</p>
          </article>
          <article className="credits__card">
            <div className="credits__icon" aria-hidden><SiSass /></div>
            <h3 className="credits__card-title">Sass (SCSS)</h3>
            <p className="credits__card-desc">BEM & Styling</p>
          </article>
          <article className="credits__card">
            <div className="credits__icon" aria-hidden><SiJavascript /></div>
            <h3 className="credits__card-title">JavaScript</h3>
            <p className="credits__card-desc">ESNext</p>
          </article>
        </div>
      </section>

      <section className="credits__section" aria-label="Credits">
        <h2>Credits</h2>
        <div className="credits__stack-grid">
          <article className="credits__card">
            <div className="credits__icon" aria-hidden><FiUser /></div>
            <h3 className="credits__card-title">Design & Development</h3>
            <p className="credits__card-desc">{AUTHOR}</p>
          </article>
          <article className="credits__card">
            <div className="credits__icon" aria-hidden><FaPeopleGroup /></div>
            <h3 className="credits__card-title">Community</h3>
            <p className="credits__card-desc">Open‑source libraries & React community</p>
          </article>
        </div>
      </section>

      <section className="credits__section" aria-label="Disclaimer">
        <h2>Disclaimer</h2>
        <p className="credits__text">This app is for educational purposes only and does not constitute financial advice.</p>
      </section>
    </div>
  );
};

export default Credits;
