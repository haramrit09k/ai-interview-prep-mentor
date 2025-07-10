import React from 'react';
import type { UserProfile } from '../types';
import { BrainCircuitIcon, LogoutIcon } from './Icons';
import { GoogleLogin } from '@react-oauth/google';


interface HeaderProps {
    userProfile: UserProfile | null;
    onLoginSuccess: (credentialResponse: any) => void;
    onLogout: () => void;
    isAuthEnabled: boolean;
    questionsRemaining: number; // New prop
    isAuthenticated: boolean; // New prop
    onPurchaseQuestions: (quantity: number) => void; // New prop
}

const Header: React.FC<HeaderProps> = ({ userProfile, onLoginSuccess, onLogout, isAuthEnabled, questionsRemaining, isAuthenticated, onPurchaseQuestions }) => {
    const showQuotaWarning = isAuthenticated && questionsRemaining <= 10;
    const questionsToBuy = 100; // Default quantity for header button

    return (
        <header className="bg-background-medium/80 backdrop-blur-sm sticky top-0 z-40 border-b border-background-light">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between h-16">
                    <div className="flex items-center">
                        <BrainCircuitIcon className="h-8 w-8 text-brand-primary" />
                        <h1 className="text-xl font-bold text-text-primary ml-3 tracking-tight">AI Interview Mentor</h1>
                    </div>
                    <div className="flex items-center gap-4">
                        {showQuotaWarning && (
                            <span className="text-sm text-yellow-400 font-semibold">
                                {questionsRemaining} Questions Left!
                            </span>
                        )}
                        {isAuthenticated && (
                            <button
                                onClick={() => onPurchaseQuestions(questionsToBuy)}
                                className="py-2 px-4 rounded-lg bg-brand-primary text-white font-semibold hover:bg-brand-light transition-colors text-sm"
                            >
                                Buy More Questions
                            </button>
                        )}
                        {isAuthEnabled ? (
                            userProfile ? (
                                <div className="flex items-center gap-4">
                                    <span className="text-text-secondary text-sm hidden sm:block">
                                        Welcome, {userProfile.name.split(' ')[0]}!
                                    </span>
                                    <img
                                        src={userProfile.picture}
                                        alt="User profile"
                                        className="w-9 h-9 rounded-full border-2 border-brand-light"
                                    />
                                    <button
                                        onClick={onLogout}
                                        className="flex items-center gap-2 py-2 px-4 rounded-lg bg-background-light text-text-primary font-semibold hover:bg-gray-600 transition-colors"
                                    >
                                        <LogoutIcon className="w-5 h-5" />
                                        <span>Logout</span>
                                    </button>
                                </div>
                            ) : (
                                <GoogleLogin
                                    onSuccess={onLoginSuccess}
                                    onError={() => {
                                        console.log('Login Failed');
                                        alert('Google login failed. Please try again.');
                                    }}
                                    theme="filled_black"
                                    text="signin_with"
                                    shape="pill"
                                />
                            )
                        ) : (
                            <div className="py-2 px-4 rounded-md bg-yellow-900/50 text-yellow-300 text-sm font-semibold border border-yellow-700/50">
                                Anonymous Mode
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </header>
    );
};

export default Header;