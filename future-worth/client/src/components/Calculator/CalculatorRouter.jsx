import React from 'react';
import { useParams } from 'react-router-dom';
import ComingSoon from '../ComingSoon/ComingSoon';
import MortgageCalculator from './Mortgage/MortgageCalculator';
import CompoundCalculator from './Compound/CompoundCalculator';
import RetirementCalculator from './Retirement/RetirementCalculator';
import LoanCalculator from './Loan/LoanCalculator';

const CalculatorRouter = () => {
  const { type } = useParams();

  if (type === 'mortgage') {
    return <MortgageCalculator />;
  }
  if (type === 'compound-interest') {
    return <CompoundCalculator />;
  }
  if (type === 'retirement') {
    return <RetirementCalculator />;
  }
  if (type === 'loan-payoff') {
    return <LoanCalculator />;
  }

  const title = (type || 'Calculator')
    .split('-')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(' ');

  return <ComingSoon title={`${title} Calculator`} />;
};

export default CalculatorRouter;
