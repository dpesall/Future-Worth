import React from 'react';
import { NavLink, Link } from 'react-router-dom';
import './Navbar.scss';

const Navbar = () => {
  return (
    <header className="navbar">
      <div className="navbar__inner">
        <Link to="/" className="navbar__brand" aria-label="Future Worth Home">
          <div className="navbar__logo" aria-hidden="true">
            <img className="navbar__logo-img" src="/logo-arrow-only.png" alt="" />
          </div>
          <span className="navbar__title">Future Worth</span>
        </Link>

        <nav className="navbar__links" aria-label="Primary">
          <NavLink to="/" end className={({ isActive }) => `navbar__link ${isActive ? 'is-active' : ''}`}>Home</NavLink>
          <NavLink to="/about" className={({ isActive }) => `navbar__link ${isActive ? 'is-active' : ''}`}>About</NavLink>
          <NavLink to="/credits" className={({ isActive }) => `navbar__link ${isActive ? 'is-active' : ''}`}>Credits</NavLink>
        </nav>
      </div>
    </header>
  );
};

export default Navbar;
