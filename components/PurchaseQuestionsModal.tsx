
import React, { useState } from 'react';
import { XIcon } from './Icons';
import { purchaseOptions } from '../config/purchaseOptions';

interface PurchaseQuestionsModalProps {
  onClose: () => void;
  onPurchase: (quantity: number, priceCents: number) => void;
}

const PurchaseQuestionsModal: React.FC<PurchaseQuestionsModalProps> = ({ onClose, onPurchase }) => {
  

  const [selectedOption, setSelectedOption] = useState(purchaseOptions[0]);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-50 p-4" aria-modal="true" role="dialog">
      <div className="bg-background-medium rounded-xl shadow-2xl w-full max-w-md border border-background-light">
        <div className="p-4 relative">
          <button onClick={onClose} className="absolute top-3 right-3 text-text-muted hover:text-text-primary transition-colors" aria-label="Close">
            <XIcon className="w-5 h-5" />
          </button>
          <h2 className="text-xl font-bold text-brand-light mb-3">Purchase More Questions</h2>
          <p className="text-text-secondary text-sm mb-4">Select a question pack to continue your practice.</p>
          
          <div className="space-y-3">
            {purchaseOptions.map(option => (
              <button
                key={option.quantity}
                type="button"
                onClick={() => setSelectedOption(option)}
                className={`w-full py-2 px-3 rounded-lg text-sm font-semibold transition-colors flex justify-between items-center relative
                  ${selectedOption.quantity === option.quantity
                    ? 'bg-brand-primary text-white ring-2 ring-brand-light'
                    : 'bg-background-light hover:bg-gray-600 text-text-primary'
                  }
                  ${option.highlight ? 'border-2 border-yellow-400 shadow-lg' : ''}
                `}
              >
                <span>{option.quantity} Questions</span>
                <span className="flex items-center gap-2">
                  {option.savingsText && (
                    <span className="text-xs font-bold text-yellow-400 bg-yellow-400/20 px-2 py-1 rounded-full">
                      {option.savingsText}
                    </span>
                  )}
                  <span>${(option.priceCents / 100).toFixed(2)}</span>
                </span>
              </button>
            ))}
          </div>

          <div className="mt-6 flex justify-end">
            <button
              onClick={() => { onPurchase(selectedOption.quantity, selectedOption.priceCents); onClose(); }}
              className="py-2 px-4 rounded-lg bg-brand-primary text-white font-semibold hover:bg-brand-hover transition-colors text-sm"
            >
              Buy {selectedOption.quantity} Questions
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PurchaseQuestionsModal;
