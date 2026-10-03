import React, { useState, useRef, useEffect } from 'react';
import type { UserProfile } from '../types';
import { LogoutIcon, QuestionMarkCircleIcon, Bars3Icon, ChartBarIcon, FlameIcon } from './Icons';
import { BrainIcon } from './BrainIcon';
import { GoogleLogin } from '@react-oauth/google';


interface HeaderProps {
    userProfile: UserProfile | null;
    onLoginSuccess: (credentialResponse: any) => void;
    onLogout: () => void;
    isAuthEnabled: boolean;
    questionsRemaining: number;
    isAuthenticated: boolean;
    onPurchaseQuestions: (quantity: number, priceCents: number) => void;
    onOpenWelcomeModal: () => void;
    onOpenProgress: () => void;
    setShowPurchaseModal: (show: boolean) => void;
    nextResetDate: string | null; // New prop for next reset date
    streak: { current: number; practicedToday: boolean } | null; // null until progress has loaded
}

const Header: React.FC<HeaderProps> = ({ userProfile, onLoginSuccess, onLogout, isAuthEnabled, questionsRemaining, isAuthenticated, onOpenWelcomeModal, onOpenProgress, setShowPurchaseModal, nextResetDate, streak }) => {
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

    return (
        <header className="bg-background-medium/80 backdrop-blur-sm sticky top-0 z-40 border-b border-background-light">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between h-16">
                    <div className="flex items-center">
                        <BrainIcon className="h-8 w-8 text-brand-light" />
                        <h1 className="ml-3 flex items-baseline gap-2">
                            <span className="font-mono text-lg font-bold text-text-primary tracking-tight">ACE</span>
                            <span className="hidden sm:inline text-sm text-text-muted">AI Coach for Employment</span>
                        </h1>
                    </div>
                    <div className="flex items-center gap-2">
                        {isAuthenticated && streak && streak.current > 0 && (
                            <span
                                className={`flex items-center gap-1 text-xs sm:text-sm font-mono font-bold ${streak.practicedToday ? 'text-brand-light' : 'text-text-muted'}`}
                                title={streak.practicedToday ? 'You have practised today' : 'Answer one question today to keep your streak'}
                            >
                                <FlameIcon className="w-4 h-4" />
                                {streak.current}<span className="sr-only"> day streak{streak.practicedToday ? '' : ', not yet extended today'}</span>
                            </span>
                        )}
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
                                <button
                                    onClick={onOpenProgress}
                                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-text-secondary font-semibold hover:bg-background-light hover:text-text-primary focus-visible:ring-2 focus-visible:ring-brand-light transition-colors"
                                >
                                    <ChartBarIcon className="w-5 h-5" /> Progress
                                </button>
                            )}
                            {isAuthenticated && (
                                <button
                                    onClick={() => setShowPurchaseModal(true)}
                                    className="px-4 py-2 bg-brand-primary text-white font-semibold rounded-lg hover:bg-brand-hover transition-colors"
                                >
                                    Buy Questions
                                </button>
                            )}
                            {isAuthEnabled ? (
                                userProfile ? (
                                    <div className="flex items-center gap-2">
                                        <span className="text-text-secondary text-sm">
                                            Welcome, {userProfile.name.split(' ')[0]}!
                                        </span>
                                        <div className="relative group">
                                            <img
                                                src={userProfile.picture}
                                                alt="User profile"
                                                className="w-9 h-9 rounded-full border-2 border-brand-light cursor-pointer"
                                            />
                                            <div className="absolute left-1/2 -translate-x-1/2 mt-2 w-48 bg-background-light border border-gray-600 rounded-lg shadow-lg z-20 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 p-3 text-center text-sm">
                                                <p className="text-text-primary">{questionsRemaining} questions left</p>
                                                {nextResetDate && (
                                                    <p className="text-text-secondary">Next reset: {nextResetDate}</p>
                                                )}
                                            </div>
                                        </div>
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
                                    {nextResetDate && (
                                        <span className="text-text-secondary text-xs">
                                            Next reset: {nextResetDate}
                                        </span>
                                    )}
                                </div>
                            )}
                            {isAuthenticated && (
                                <button
                                    onClick={() => { onOpenProgress(); setIsMobileMenuOpen(false); }}
                                    className="flex items-center justify-center gap-2 py-2 px-4 rounded-lg bg-background-light text-text-primary font-semibold hover:bg-gray-600 transition-colors text-sm w-full max-w-xs"
                                >
                                    <ChartBarIcon className="w-5 h-5" /> Progress
                                </button>
                            )}
                            {isAuthenticated && (
                                <button
                                    className="py-2 px-4 rounded-lg bg-brand-primary text-white font-semibold hover:bg-brand-hover transition-colors text-sm w-full max-w-xs"
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