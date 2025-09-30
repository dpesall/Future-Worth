import React from 'react';
import { Link } from 'react-router-dom';
import './ComingSoon.scss';

const ComingSoon = ({ title = 'Coming Soon' }) => {
  return (
    <section className="coming-soon" aria-live="polite">
      <div className="coming-soon__panel">
        <div className="coming-soon__icon" aria-hidden>
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="12" r="9" stroke="#BBF7D0" strokeWidth="1.6"/>
            <path d="M12 7v6l3 2" stroke="#BBF7D0" strokeWidth="1.6" strokeLinecap="round"/>
          </svg>
        </div>
        <h1 className="coming-soon__title">{title}</h1>
        <p className="coming-soon__text">This calculator page is on the way. In the meantime, explore the homepage cards.</p>
        <Link to="/" className="coming-soon__cta">Back to Home</Link>
      </div>
    </section>
  );
};

export default ComingSoon;
