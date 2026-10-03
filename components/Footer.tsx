import React from 'react';

const Footer: React.FC = () => {
  return (
    <footer className="bg-background-medium/80 backdrop-blur-sm border-t border-background-light mt-8 py-6">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-text-secondary text-sm">
        <p>&copy; {new Date().getFullYear()} ACE: AI Coach for Employment. All rights reserved.</p>
        <p className="mt-2">
          <a href="https://form.typeform.com/to/Myg4qNJA" target="_blank" rel="noopener noreferrer" className="text-brand-light hover:underline" title="Feedback/Bug Reports/Feature Requests">
            Give Feedback
          </a>
          {/* <span className="mx-2">|</span>
          <a href="#" className="text-brand-light hover:underline">Privacy Policy</a>
          <span className="mx-2">|</span>
          <a href="#" className="text-brand-light hover:underline">Terms of Service</a> */}
          <span className="mx-2">|</span>
          Built with <span className="text-red-500">❤️</span> by <a href="https://lilsardarx.dev" target="_blank" rel="noopener noreferrer" className="text-brand-light hover:underline">LilSardarX</a>
          <span className="mx-2">|</span>
          <a href="https://coff.ee/lilsardarx" target="_blank" rel="noopener noreferrer" className="text-brand-light hover:underline">
            Buy me a &nbsp;☕️
          </a>
        </p>
      </div>
    </footer>
  );
};

export default Footer;
