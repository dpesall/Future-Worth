import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';

import Home from './components/Home/Home';
import Navbar from './components/Navbar/Navbar';
import About from './components/About/About';
import Credits from './components/Credits/Credits';
import CalculatorRouter from './components/Calculator/CalculatorRouter';

import './App.scss';

function App() {
  return (
    <Router>
      <div className="app">
        <Navbar />
        <main className="app__main-content">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/calculator/:type" element={<CalculatorRouter />} />
            <Route path="/about" element={<About />} />
            <Route path="/credits" element={<Credits />} />
          </Routes>
        </main>
        <footer className="app__footer">
          <p>&copy; 2025 FutureWorth. All rights reserved.</p>
        </footer>
      </div>
    </Router>
  );
}

export default App;
