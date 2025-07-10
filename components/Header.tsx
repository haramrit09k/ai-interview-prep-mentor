import React, { useState } from 'react';
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

    const purchaseOptions = [
        { quantity: 10, priceCents: 20 },   // 10 questions for $0.20
        { quantity: 50, priceCents: 80 },   // 50 questions for $0.80
        { quantity: 100, priceCents: 150 }, // 100 questions for $1.50
    ];

    const [selectedQuantity, setSelectedQuantity] = useState(purchaseOptions[0].quantity);

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
                                            className="block w-full text-left px-4 py-2 text-sm text-text-primary hover:bg-background-light"
                                        >
                                            {option.quantity} Questions (${(option.priceCents / 100).toFixed(2)})
                                        </button>
                                    ))}
                                </div>
                            </div>
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