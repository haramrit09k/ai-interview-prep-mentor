import React, { useState } from 'react';
import Modal from './Modal';
import { SpinnerIcon } from './Icons';
import { redeemInvite } from '../services/invites';

interface RedeemCodeModalProps {
  isAuthenticated: boolean;
  initialCode?: string;
  signInButton?: React.ReactNode; // shown to guests, since a code is added to an account
  onClose: () => void;
  onRedeemed: (questionsAdded: number, bonusQuestions: number) => void;
}

const RedeemCodeModal: React.FC<RedeemCodeModalProps> = ({ isAuthenticated, initialCode = '', signInButton = null, onClose, onRedeemed }) => {
  const [code, setCode] = useState(initialCode.toUpperCase());
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<number | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || isRedeeming) return;
    setError(null);
    setIsRedeeming(true);
    try {
      const result = await redeemInvite(code);
      setAdded(result.questionsAdded);
      onRedeemed(result.questionsAdded, result.bonusQuestions);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not redeem that code.');
    } finally {
      setIsRedeeming(false);
    }
  };

  return (
    <Modal title={added !== null ? 'Code redeemed' : 'Have a code?'} onClose={onClose} maxWidth="max-w-md">
      {added !== null ? (
        <div className="space-y-4">
          <p role="status" className="text-text-secondary">
            <span className="font-mono font-bold text-level-entry">+{added}</span> bonus {added === 1 ? 'question has' : 'questions have'} been added to your account. They are used after your weekly questions and do not expire.
          </p>
          <button onClick={onClose} className="w-full py-2.5 px-4 rounded-lg bg-brand-primary text-white font-semibold hover:bg-brand-hover transition-colors text-sm">
            Start practising
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-text-secondary">
            Enter the code you were sent for extra practice questions. A code is for one email address, so sign in with the Google account it was sent to.
          </p>
          {!isAuthenticated ? (
            <div className="space-y-3">
              <p className="text-sm text-text-muted">Sign in first, then enter your code.</p>
              {signInButton && <div className="flex justify-center">{signInButton}</div>}
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              <label htmlFor="invite-code" className="sr-only">Invite code</label>
              <input
                id="invite-code"
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                maxLength={40}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                placeholder="ACE-XXXX-XXXX"
                className="w-full bg-background-light border border-gray-600 text-text-primary font-mono tracking-widest rounded-lg focus:ring-2 focus:ring-brand-primary focus:border-brand-primary transition p-3 text-center"
              />
              {error && <p role="alert" className="text-sm text-red-300 bg-red-900/30 border border-red-500/40 rounded-lg p-2">{error}</p>}
              <button
                type="submit"
                disabled={!code.trim() || isRedeeming}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-brand-primary text-white font-semibold hover:bg-brand-hover disabled:bg-gray-500 disabled:cursor-not-allowed transition-colors text-sm"
              >
                {isRedeeming ? <><SpinnerIcon className="w-4 h-4 border-2" /> Checking...</> : 'Redeem code'}
              </button>
            </form>
          )}
        </div>
      )}
    </Modal>
  );
};

export default RedeemCodeModal;
