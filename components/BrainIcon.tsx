import React from 'react';

interface BrainIconProps extends React.SVGProps<SVGSVGElement> {}

export const BrainIcon: React.FC<BrainIconProps> = (props) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M12 2C7.02944 2 3 6.02944 3 11C3 15.9706 7.02944 20 12 20C16.9706 20 21 15.9706 21 11C21 6.02944 16.9706 2 12 2Z" stroke="#fb923c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M12 2V20" stroke="#fb923c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M7 6C7 6 6 8 6 11C6 14 7 16 7 16" stroke="#fb923c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M17 6C17 6 18 8 18 11C18 14 17 16 17 16" stroke="#fb923c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M5 11H19" stroke="#fb923c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M10 4L14 4" stroke="#fb923c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M10 18L14 18" stroke="#fb923c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);