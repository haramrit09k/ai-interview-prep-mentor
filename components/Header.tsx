import React, { useState, useRef, useEffect } from 'react';
import type { UserProfile } from '../types';
import { LogoutIcon, QuestionMarkCircleIcon, Bars3Icon } from './Icons';
import PurchaseQuestionsModal from './PurchaseQuestionsModal';
import { purchaseOptions } from '../config/purchaseOptions';
import { BrainIcon } from './BrainIcon';
import { GoogleLogin } from '@react-oauth/google';


interface HeaderProps {
    userProfile: UserProfile | null;
    onLoginSuccess: (credentialResponse: any) => void;
    onLogout: () => void;
    isAuthEnabled: boolean;
    questionsRemaining: number; // New prop
    isAuthenticated: boolean; // New prop
    onPurchaseQuestions: (quantity: number) => void; // New prop
    onOpenWelcomeModal: () => void; // New prop for opening welcome modal
    setShowPurchaseModal: (show: boolean) => void; // New prop to control purchase modal visibility
}

const Header: React.FC<HeaderProps> = ({ userProfile, onLoginSuccess, onLogout, isAuthEnabled, questionsRemaining, isAuthenticated, onPurchaseQuestions, onOpenWelcomeModal, setShowPurchaseModal }) => {
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node) && 
                buttonRef.current && !buttonRef.current.contains(event.target as Node)) {
                setIsMobileMenuOpen(false);
            }
        };

        if (isMobileMenuOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        } else {
            document.removeEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isMobileMenuOpen]);

    const showQuotaWarning = isAuthenticated && questionsRemaining <= 10;

    

    const [selectedQuantity, setSelectedQuantity] = useState(purchaseOptions[0].quantity);

    return (
        <header className="bg-background-medium/80 backdrop-blur-sm sticky top-0 z-40 border-b border-background-light">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between h-16">
                    <div className="flex items-center">
                        <BrainIcon className="h-8 w-8 text-brand-primary" />
                        <h1 className="text-base sm:text-lg font-bold text-text-primary ml-3 tracking-tight">ACE: AI Coach for Employment</h1>
                    </div>
                    <div className="flex items-center gap-2">
                        {isAuthenticated &&
                            (questionsRemaining < 5 ? (
                                <span className="text-xs sm:text-sm text-red-500 font-semibold text-right">
                                    {questionsRemaining} Qs Left!
                                </span>
                            ) : questionsRemaining >= 5 && questionsRemaining <= 15 ? (
                                <span className="text-xs sm:text-sm text-yellow-400 font-semibold text-right">
                                    {questionsRemaining} Qs Left!
                                </span>
                            ) : null)
                        }
                        <div className="relative group md:hidden"> {/* Burger icon for small/medium screens */}
                            <button
                                ref={buttonRef}
                                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                                className="p-2 rounded-full text-text-secondary hover:bg-background-light hover:text-text-primary transition-colors"
                                aria-label="Toggle navigation menu"
                            >
                                <Bars3Icon className="w-6 h-6" />
                            </button>
                        </div>
                        <div className="hidden md:flex items-center gap-2"> {/* Desktop menu */}
                            <button
                                onClick={onOpenWelcomeModal}
                                className="p-2 rounded-full text-text-secondary hover:bg-background-light hover:text-text-primary transition-colors"
                                aria-label="Open help and instructions"
                                title="Help & Instructions"
                            >
                                <QuestionMarkCircleIcon className="w-6 h-6" />
                            </button>
                            {isAuthenticated && (
                                <div className="relative group">
                                    <button
                                        className="py-2 px-4 rounded-lg bg-brand-primary text-white font-semibold hover:bg-brand-light transition-colors text-sm"
                                    >
                                        Buy More Questions
                                    </button>
                                    <div className="absolute right-0 mt-2 w-48 bg-background-medium rounded-md shadow-lg py-1 z-50 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 transform origin-top-right">
                                        {purchaseOptions.map(option => (
                                            <button
                                                key={option.quantity}
                                                onClick={() => {
                                                    setSelectedQuantity(option.quantity);
                                                    onPurchaseQuestions(option.quantity);
                                                }}
                                                className={`block w-full text-left px-4 py-2 text-sm text-text-primary hover:bg-background-light relative flex justify-between items-center
                                                  ${option.highlight ? 'bg-yellow-400/10' : ''}
                                                `}
                                            >
                                                <span>{option.quantity} Questions (${(option.priceCents / 100).toFixed(2)})</span>
                                                {option.shortSavingsText && (
                                                  <span className="text-xs font-bold text-yellow-400 bg-yellow-400/20 px-2 py-1 rounded-full ml-2">
                                                    {option.shortSavingsText}
                                                  </span>
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {isAuthEnabled ? (
                                userProfile ? (
                                    <div className="flex items-center gap-2">
                                        <span className="text-text-secondary text-sm">
                                            Welcome, {userProfile.name.split(' ')[0]}!
                                        </span>
                                        <img
                                            src={userProfile.picture}
                                            alt="User profile"
                                            className="w-9 h-9 rounded-full border-2 border-brand-light"
                                        />
                                        <button
                                            onClick={onLogout}
                                            className="flex items-center gap-1 sm:gap-2 py-2 px-2 sm:px-4 rounded-lg bg-background-light text-text-primary font-semibold hover:bg-gray-600 transition-colors text-sm sm:text-base"
                                        >
                                            <LogoutIcon className="w-5 h-5" />
                                            <span className="hidden sm:inline">Logout</span>
                                        </button>
                                    </div>
                                ) : (
                                    <GoogleLogin
                                        onSuccess={onLoginSuccess}
                                        onError={() => {
                                            alert('Google login failed. Please try again.');
                                        }}
                                        theme="filled_black"
                                        text="signin_with"
                                        shape="pill"
                                    />
                                )
                            ) : (
                                <div className="py-1 px-2 sm:py-2 sm:px-4 rounded-md bg-yellow-900/50 text-yellow-300 text-xs sm:text-sm font-semibold border border-yellow-700/50">
                                    Anon Mode
                                </div>
                            )}
                        </div>
                    </div>
                </div>
                {/* Mobile menu */}
                {isMobileMenuOpen && (
                    <div ref={menuRef} className="md:hidden absolute top-16 right-0 w-full bg-background-medium/95 backdrop-blur-sm pb-4 z-30">
                        <div className="flex flex-col items-center space-y-3 py-4 px-4">
                            {!isAuthenticated && isAuthEnabled && (
                                <div className="w-full flex justify-center">
                                    <GoogleLogin
                                        onSuccess={(credentialResponse) => { onLoginSuccess(credentialResponse); setIsMobileMenuOpen(false); }}
                                        onError={() => {
                                            alert('Google login failed. Please try again.');
                                        }}
                                        theme="filled_black"
                                        text="signin_with"
                                        shape="pill"
                                    />
                                </div>
                            )}
                            {!isAuthEnabled && (
                                <div className="py-1 px-2 rounded-md bg-yellow-900/50 text-yellow-300 text-xs font-semibold border border-yellow-700/50 w-full max-w-xs text-center">
                                    Anon Mode
                                </div>
                            )}
                            {isAuthenticated && userProfile && (
                                <div className="flex flex-col items-center gap-2 w-full max-w-xs">
                                    <img
                                        src={userProfile.picture}
                                        alt="User profile"
                                        className="w-12 h-12 rounded-full border-2 border-brand-light"
                                    />
                                    <span className="text-text-primary text-base font-semibold text-center">
                                        Welcome, {userProfile.name.split(' ')[0]}!
                                    </span>
                                    <span className="text-text-secondary text-sm">
                                        You have {questionsRemaining} questions left.
                                    </span>
                                </div>
                            )}
                            {isAuthenticated && (
                                <button
                                    className="py-2 px-4 rounded-lg bg-brand-primary text-white font-semibold hover:bg-brand-light transition-colors text-sm w-full max-w-xs"
                                    onClick={() => { setShowPurchaseModal(true); setIsMobileMenuOpen(false); }}
                                >
                                    Buy Questions
                                </button>
                            )}
                            <button
                                onClick={() => { onOpenWelcomeModal(); setIsMobileMenuOpen(false); }}
                                className="flex items-center justify-center gap-2 py-2 px-4 rounded-lg bg-background-light text-text-primary font-semibold hover:bg-gray-600 transition-colors text-sm w-full max-w-xs"
                            >
                                <QuestionMarkCircleIcon className="w-5 h-5" /> Help & Instructions
                            </button>
                            {isAuthenticated && (
                                <button
                                    onClick={() => { onLogout(); setIsMobileMenuOpen(false); }}
                                    className="flex items-center justify-center gap-2 py-2 px-4 rounded-lg bg-background-light text-text-primary font-semibold hover:bg-gray-600 transition-colors text-sm w-full max-w-xs"
                                >
                                    <LogoutIcon className="w-5 h-5" /> Logout
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </header>
    );
};

export default Header;