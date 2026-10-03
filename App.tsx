import React, { useState, useCallback, useEffect, useRef } from 'react';
import useLocalStorage from './hooks/useLocalStorage';
import type { Skill, Question, AnswerOutcome, ExperienceLevel, ReviewQuestion, UserProfile, Insights, RatingResult } from './types';

import SkillManagement from './components/SkillManagement';
import PracticeView from './components/PracticeView';
import CustomQuestionModal from './components/CustomQuestionModal';
import StartPracticeModal from './components/StartPracticeModal';
import ReviewModal from './components/ReviewModal';
import { updateRating } from './utils/rating';
import Header from './components/Header';
import { LimitReachedModal } from './components/LimitReachedModal';
import { WelcomeModal } from './components/WelcomeModal';
import { SpinnerIcon } from './components/Icons';
import ToastNotification from './components/ToastNotification';
import PurchaseQuestionsModal from './components/PurchaseQuestionsModal';
import { v4 as uuidv4 } from 'uuid';
import { GoogleLogin, GoogleOAuthProvider } from '@react-oauth/google';
import { jwtDecode } from 'jwt-decode';
import logger from './src/logger'; // Import the logger
import { readErrorMessage } from './services/gemini';
import ProgressModal from './components/ProgressModal';
import Footer from './components/Footer';
import { fetchInsights } from './services/progress';
import { defaultQuestionCount, recommendedLevel } from './utils/practiceDefaults';


// Helper to shuffle array
const shuffleArray = <T,>(array: T[]): T[] => {
  return [...array].sort(() => Math.random() - 0.5);
};

// --- QUOTA DEFINITIONS ---
const SESSIONS_LIMIT_ANON = 2;
const SKILLS_LIMIT_ANON = 2;
const SKILLS_LIMIT_AUTH = 5;
const QUESTIONS_LIMIT_AUTH = 50;

// --- STABLE EMPTY ARRAY REFERENCES TO PREVENT RE-RENDERS ---
const EMPTY_SKILLS: Skill[] = [];
const EMPTY_QUESTIONS: Question[] = [];

// ===================================================================================
// IMPORTANT: REPLACE WITH YOUR GOOGLE CLOUD OAUTH 2.0 CLIENT ID
const GOOGLE_CLIENT_ID: string = "571234964235-8guf9j84pec79a9vkho3p1oe7udree1n.apps.googleusercontent.com";
// ===================================================================================

interface PracticeSession {
  skill: Skill;
  questions: Question[];
  currentQuestionIndex: number;
  consumedQuestionIds: Set<string>; // To track questions that have used up quota
}

interface AuthQuota {
    questionsUsed: number;
    lastResetDate: string; // YYYY-MM-DD format
}

const AppContent: React.FC<{ isAuthEnabled: boolean }> = ({ isAuthEnabled }) => {
  const [userProfile, setUserProfile] = useLocalStorage<UserProfile | null>('interview_prep_user_profile', null);
  const isAuthenticated = isAuthEnabled && !!userProfile;
  const userId = isAuthenticated && userProfile ? userProfile.id : '_anon';

  // Define dynamic storage keys based on user ID
  const skillsKey = `interview_prep_skills_${userId}`;
  const questionsKey = `interview_prep_custom_questions_${userId}`;

  // --- STATE HOOKS ---
  const [skills, setSkills] = useLocalStorage<Skill[]>(skillsKey, EMPTY_SKILLS);
  const [customQuestions, setCustomQuestions] = useLocalStorage<Question[]>(questionsKey, EMPTY_QUESTIONS);
  
  // --- STATE FOR QUOTA MANAGEMENT ---
  const [anonSessionsUsed, setAnonSessionsUsed] = useLocalStorage<number>('interview_prep_anon_sessions_used', 0);
  const [isWelcomeModalOpen, setIsWelcomeModalOpen] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [isProgressOpen, setIsProgressOpen] = useState(false);
  
  const [authQuota, setAuthQuota] = useState<AuthQuota>({ questionsUsed: 0, lastResetDate: new Date().toISOString().split('T')[0] });

  // Streak and next step for the signed-in home screen. Refreshed each time a session ends.
  const [insights, setInsights] = useState<Insights | null>(null);

  // Move handleAuthError to the top before it's used
  const handleAuthError = useCallback((logoutFn: () => void, message: string = 'Your session has expired. Please log in again.') => {
    logger.error(`Authentication error: ${message}`);
    logoutFn();
  }, []);

  // Fetch quota from backend on authentication change
  useEffect(() => {
    if (isAuthenticated && userProfile) {
      const fetchQuota = async () => {
        try {
          const response = await fetch('/api/quota', {
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('google_id_token')}`
            }
          });
          if (response.ok) {
            const data = await response.json();
            setAuthQuota(data);
          } else if (response.status === 401) {
            handleAuthError(handleLogout, 'Failed to fetch quota: Unauthorized.');
          } else {
            logger.error('Failed to fetch quota', response.statusText);
          }
        } catch (error) {
          logger.error('Error fetching quota:', error);
        }
      };
      fetchQuota();
    }
  }, [isAuthenticated, userProfile, handleAuthError]);
  
  // Daily quota reset for authenticated users (handled by backend now, but keep for initial state)
  useEffect(() => {
    if (isAuthenticated) {
      const todayStr = new Date().toISOString().split('T')[0];
      if (authQuota.lastResetDate !== todayStr) {
        // This reset will now be handled by the backend when it fetches/creates the user
        // setAuthQuota({ questionsUsed: 0, lastResetDate: todayStr }); 
      }
    }
  }, [isAuthenticated, authQuota.lastResetDate]);
  
  // --- DERIVED STATE FOR UI ---
  const questionsRemaining = isAuthenticated ? QUESTIONS_LIMIT_AUTH - authQuota.questionsUsed : 0;
  const nextResetDate = isAuthenticated ? new Date(new Date(authQuota.lastResetDate).getTime() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString() : null;
  const sessionsRemaining = isAuthenticated ? Infinity : SESSIONS_LIMIT_ANON - anonSessionsUsed;
  const isSkillLimitReached = isAuthenticated 
    ? skills.length >= SKILLS_LIMIT_AUTH
    : skills.length >= SKILLS_LIMIT_ANON;

  const [practiceSession, setPracticeSession] = useState<PracticeSession | null>(null);
  const [isStartingSession, setIsStartingSession] = useState<boolean>(false);
  const [isCustomQuestionModalOpen, setIsCustomQuestionModalOpen] = useState<boolean>(false);
  const [limitModal, setLimitModal] = useState<{ isOpen: boolean; reason: 'skills' | 'sessions' | 'quota' | null }>({ isOpen: false, reason: null });
  const [practiceOptions, setPracticeOptions] = useState<{ isOpen: boolean; skill: Skill | null }>({ isOpen: false, skill: null });
  const [reviewModal, setReviewModal] = useState<{ isOpen: boolean; skill: Skill | null }>({ isOpen: false, skill: null });

  const handleLoginSuccess = useCallback((credentialResponse: any) => {
    try {
        console.log('credentialResponse:', credentialResponse);
        const decoded: { sub: string, name: string, email: string, picture: string } = jwtDecode(credentialResponse.credential);
        const profile: UserProfile = {
            id: decoded.sub,
            name: decoded.name,
            email: decoded.email,
            picture: decoded.picture
        };
        setUserProfile(profile);
        // Store the ID token for backend calls
        localStorage.setItem('google_id_token', credentialResponse.credential);
        setToastMessage('Successfully logged in!');

        // Close all modals on successful login
        setLimitModal({ isOpen: false, reason: null });
        setPracticeOptions({ isOpen: false, skill: null });
        setIsCustomQuestionModalOpen(false);
        setReviewModal({ isOpen: false, skill: null });
        setIsWelcomeModalOpen(false);
        setShowPurchaseModal(false);

    } catch (error) {
        console.error("Error decoding JWT:", error);
        alert("Failed to process login information.");
    }
  }, [setUserProfile, setLimitModal, setPracticeOptions, setIsCustomQuestionModalOpen, setReviewModal, setIsWelcomeModalOpen, setShowPurchaseModal]);

  

  const handleLogout = useCallback(() => {
    if (isAuthEnabled) {
      setUserProfile(null);
      localStorage.removeItem('google_id_token'); // Clear the ID token on logout
      logger.info('User logged out.');
      setToastMessage('Successfully logged out!');
    }
  }, [isAuthEnabled, setUserProfile]);

  // Returns the new skill so callers (like the starter chips) can start practising it straight away.
  const addSkill = useCallback((name: string): Skill | null => {
    if (isSkillLimitReached) {
       if (isAuthenticated) {
         alert(`You have reached the limit of ${SKILLS_LIMIT_AUTH} skills.`);
       } else {
         setLimitModal({ isOpen: true, reason: 'skills' });
       }
       return null;
    }
    const skillName = name.trim();
    if (!skillName) return null;

    if (skills.some(skill => skill.name.toLowerCase() === skillName.toLowerCase())) {
      alert('This skill already exists.');
      return null;
    }
    const newSkill: Skill = { id: uuidv4(), name: skillName, rating: 0 };
    setSkills(prevSkills => [...prevSkills, newSkill]);
    return newSkill;
  }, [skills, setSkills, isSkillLimitReached, isAuthenticated]);

  const deleteSkill = useCallback((id: string) => {
    if (window.confirm('Are you sure you want to delete this skill and all associated questions and history?')) {
      setSkills(prev => prev.filter(skill => skill.id !== id));
      setCustomQuestions(prev => prev.filter(q => q.skillId !== id));
    }
  }, [setSkills, setCustomQuestions]);
  
  const addCustomQuestion = (skillId: string, text: string, answer: string) => {
    const newQuestion: Question = { id: uuidv4(), skillId, text, answer, source: 'custom' };
    setCustomQuestions(prev => [...prev, newQuestion]);
  };

  const handleStartPractice = useCallback(async (skill: Skill, level: ExperienceLevel, count: number) => {
    if (!isAuthenticated && sessionsRemaining <= 0) {
      setLimitModal({ isOpen: true, reason: 'sessions' });
      return;
    }

    if (isAuthenticated && !localStorage.getItem('google_id_token')) {
      logger.warn('Authenticated user but no Google ID token found in localStorage. Please log in again.');
      alert('Authentication token missing. Please log in again.');
      setIsStartingSession(false);
      return;
    }
    
    setIsStartingSession(true);
    setPracticeOptions({ isOpen: false, skill: null });

    try {
        const headers: HeadersInit = {};
        if (isAuthenticated) {
            headers['Authorization'] = `Bearer ${localStorage.getItem('google_id_token')}`;
        }

        logger.info(`Fetching questions for skill: ${skill.name}, level: ${level}, count: ${count}`);
        const response = await fetch(`/api/questions?skillName=${encodeURIComponent(skill.name)}&level=${encodeURIComponent(level)}&count=${count}&skillId=${skill.id}`, {
            headers,
        });

        // Get response text first
        const responseText = await response.text();
        if (!responseText) {
          throw new Error('Empty response from backend');
        }
        
        let data: any = null;
        try {
          data = JSON.parse(responseText);
        } catch (err) {
          // Not JSON (e.g. a gateway error page). Fall through to the status check below.
        }

        if (!response.ok) {
            if (response.status === 401) {
                handleAuthError(handleLogout, 'Failed to fetch questions: Unauthorized.');
            }
            throw new Error(data?.error || data?.message || `Failed to fetch questions (HTTP ${response.status})`);
        }
        if (!data || !Array.isArray(data.questions)) {
          throw new Error('Unexpected response from the server while fetching questions.');
        }

        const fetchedQuestions: Question[] = data.questions.map((q: any) => ({
            id: uuidv4(),
            skillId: q.skillId || skill.id,
            text: q.text,
            source: 'gemini',
            level: q.level
        }));
        
        if (!isAuthenticated) {
            setAnonSessionsUsed(prev => prev + 1);
        }

        const userQuestions = customQuestions.filter(q => q.skillId === skill.id);
        const allQuestions = shuffleArray([...userQuestions, ...fetchedQuestions]);

        if (allQuestions.length === 0) {
            alert("Could not generate or find any questions for this topic. Please try again.");
            setIsStartingSession(false);
            return;
        }
        
        setPracticeSession({
            skill,
            questions: allQuestions,
            currentQuestionIndex: 0,
            consumedQuestionIds: new Set(),
        });
    } catch(error) {
        logger.error('Error fetching questions:', error);
        alert(`An error occurred while fetching questions: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
        setIsStartingSession(false);
    }
  }, [customQuestions, isAuthenticated, sessionsRemaining, setAnonSessionsUsed]);

  // Starts a session made of questions the user missed earlier. Their grading level is kept when it was recorded.
  const handleRetryMissed = useCallback((skill: Skill, retry: ReviewQuestion[]) => {
    if (!isAuthenticated || retry.length === 0) return;
    const questions: Question[] = retry.map((q) => ({
      id: uuidv4(),
      skillId: skill.id,
      text: q.text,
      source: 'gemini',
      level: q.level ?? undefined,
    }));
    setReviewModal({ isOpen: false, skill: null });
    setPracticeSession({
      skill,
      questions: shuffleArray(questions),
      currentQuestionIndex: 0,
      consumedQuestionIds: new Set(),
    });
  }, [isAuthenticated]);

  const practiceSessionRef = useRef(practiceSession);
  useEffect(() => {
    practiceSessionRef.current = practiceSession;
  }, [practiceSession]);

  // Effect to handle saving session data on page unload
  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      // Check if there's an active practice session that needs saving.
      if (practiceSessionRef.current && practiceSessionRef.current.consumedQuestionIds.size > 0) {
        // Most modern browsers do not display this message, but it's required for the event to trigger.
        event.preventDefault();
        event.returnValue = 'You have an active session. Are you sure you want to leave?';

        // Use navigator.sendBeacon to reliably send data on unload
        // Note: This is a fire-and-forget request. We won't get a response.
        if (isAuthenticated && localStorage.getItem('google_id_token')) {
            const unansweredQuestions = practiceSessionRef.current.questions.filter(q => !practiceSessionRef.current?.consumedQuestionIds.has(q.id));

            const payload = { unansweredQuestions };

            const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
            navigator.sendBeacon('/api/session/save-on-exit', blob);
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isAuthenticated]); // Dependencies

  const endPracticeSession = useCallback(async () => {
    if (practiceSession && isAuthenticated) {
      if (!localStorage.getItem('google_id_token')) {
        logger.warn('Authenticated user but no Google ID token found in localStorage. Cannot save unanswered questions.');
        setPracticeSession(null);
        return;
      }

      const unansweredQuestions = practiceSession.questions.filter(q => !practiceSession.consumedQuestionIds.has(q.id));

      if (unansweredQuestions.length > 0) {
        logger.info(`Saving ${unansweredQuestions.length} unanswered questions for user ${userId}.`);
        try {
          await fetch('/api/questions/save-unanswered', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${localStorage.getItem('google_id_token')}`,
            },
            body: JSON.stringify({ unansweredQuestions }),
          });
        } catch (error) {
          logger.error('Error saving unanswered questions:', error);
        }
      }
    }
    setPracticeSession(null);
  }, [practiceSession, isAuthenticated, userId]);
  
  const navigateQuestion = (direction: 'next' | 'prev') => {
    setPracticeSession(prevSession => {
        if (!prevSession) return null;
        const newIndex = direction === 'next' 
            ? prevSession.currentQuestionIndex + 1
            : prevSession.currentQuestionIndex - 1;
        
        if(newIndex >= 0 && newIndex < prevSession.questions.length) {
            return { ...prevSession, currentQuestionIndex: newIndex };
        }
        return prevSession;
    });
  };

  // Spends one question of the weekly quota. Fire and forget: the answer is already on screen.
  const spendQuota = useCallback(async () => {
    try {
      const response = await fetch('/api/quota/increment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('google_id_token')}`
        },
      });
      if (response.ok) {
        setAuthQuota(prev => ({...prev, questionsUsed: prev.questionsUsed + 1}));
      } else if (response.status === 401) {
        handleAuthError(handleLogout, 'Failed to increment quota: Unauthorized.');
      } else {
        logger.error('Failed to increment quota on backend', response.statusText);
      }
    } catch (error) {
      console.error('Error incrementing quota:', error);
    }
  }, [handleAuthError, handleLogout]);

  // A retry is practice only: it never costs quota and never moves the rating.
  const handleQuestionComplete = useCallback(({ question, classification, isRetry }: { question: Question, classification: AnswerOutcome, isRetry?: boolean }): RatingResult => {
    const before = skills.find(skill => skill.id === question.skillId)?.rating ?? 0;
    if (isRetry) return { before, after: before };

    // Deduct from quota if it's the first time this question is being engaged with in this session
    if (isAuthenticated && practiceSession && !practiceSession.consumedQuestionIds.has(question.id)) {
        setPracticeSession(prevSession => {
            if (!prevSession) return null;
            const newConsumedIds = new Set(prevSession.consumedQuestionIds);
            newConsumedIds.add(question.id);
            return { ...prevSession, consumedQuestionIds: newConsumedIds };
        });
        void spendQuota();
    }

    // The change depends on the level the question was asked at, and each level has a ceiling.
    const after = updateRating(before, classification, question.level);
    setSkills(prevSkills => prevSkills.map(skill => skill.id === question.skillId ? { ...skill, rating: after } : skill));
    return { before, after };
  }, [skills, isAuthenticated, practiceSession, spendQuota, setPracticeSession, setSkills]);

  // One tap start: the recommended level and a short session, so there is nothing to decide first.
  const handleQuickStart = useCallback((skill: Skill, level: ExperienceLevel = recommendedLevel(skill.rating)) => {
    const count = defaultQuestionCount(isAuthenticated, questionsRemaining);
    if (isAuthenticated && count === 0) {
      setLimitModal({ isOpen: true, reason: 'quota' });
      return;
    }
    void handleStartPractice(skill, level, count);
  }, [isAuthenticated, questionsRemaining, handleStartPractice]);

  // Starter chips on the empty home screen: add the skill and begin straight away.
  const handleStarterSkill = useCallback((name: string) => {
    const skill = addSkill(name);
    if (skill) handleQuickStart(skill);
  }, [addSkill, handleQuickStart]);

  const handlePracticeAgain = useCallback(async (level: ExperienceLevel) => {
    if (!practiceSession) return;
    const skill = skills.find(s => s.id === practiceSession.skill.id) ?? practiceSession.skill;
    await endPracticeSession();
    handleQuickStart(skill, level);
  }, [practiceSession, skills, endPracticeSession, handleQuickStart]);

  const handlePurchaseQuestions = useCallback(async (quantity: number, priceCents: number) => {
    if (!isAuthenticated) {
      alert("Please log in to purchase more questions.");
      return;
    }
    console.log(`Attempting to purchase ${quantity} questions for ${priceCents} cents...`);
    try {
      const response = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('google_id_token')}`,
        },
        body: JSON.stringify({ quantity, priceCents }),
      });

      if (response.ok) {
        const { url } = await response.json();
        window.location.href = url; // Redirect to Stripe Checkout
      } else if (response.status === 401) {
        handleAuthError(handleLogout, 'Failed to initiate purchase: Unauthorized.');
      } else {
        const message = await readErrorMessage(response, 'Failed to create checkout session');
        logger.error('Failed to create checkout session:', message);
        alert(`Failed to initiate payment: ${message}`);
      }
    } catch (error) {
      console.error('Error during checkout initiation:', error);
      alert('An error occurred while trying to initiate payment.');
    }
  }, [isAuthenticated]);

  const isOnHome = practiceSession === null;
  useEffect(() => {
    if (!isAuthenticated) {
      setInsights(null);
      return;
    }
    if (!isOnHome) return;
    let cancelled = false;
    // The home screen falls back to advice from the skills list if this fails, so errors can be ignored.
    fetchInsights().then(data => { if (!cancelled) setInsights(data); }).catch(() => {});
    return () => { cancelled = true; };
  }, [isAuthenticated, isOnHome]);

  if (practiceSession) {
    return <PracticeView session={practiceSession} onEndSession={endPracticeSession} onNavigate={navigateQuestion} onQuestionComplete={handleQuestionComplete} onPracticeAgain={handlePracticeAgain} questionsRemaining={questionsRemaining} isAuthenticated={isAuthenticated} />;
  }

  return (
    <div className="flex flex-col min-h-screen text-text-primary bg-background-dark">
      <Header 
        userProfile={userProfile} 
        onLoginSuccess={handleLoginSuccess} 
        onLogout={handleLogout} 
        isAuthEnabled={isAuthEnabled}
        questionsRemaining={questionsRemaining}
        isAuthenticated={isAuthenticated}
        nextResetDate={nextResetDate}
        onPurchaseQuestions={handlePurchaseQuestions}
        onOpenWelcomeModal={() => setIsWelcomeModalOpen(true)}
        onOpenProgress={() => setIsProgressOpen(true)}
        streak={insights ? { current: insights.totals.currentStreak, practicedToday: insights.totals.practicedToday } : null}
        setShowPurchaseModal={setShowPurchaseModal}
      />
      {isStartingSession && (
         <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center">
            <div className="flex flex-col items-center gap-4">
              <SpinnerIcon className="w-16 h-16 border-4 border-brand-primary" />
              <p className="text-white text-lg font-semibold">Generating your session...</p>
            </div>
         </div>
      )}
      <main className="flex-grow container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <SkillManagement
          skills={skills}
          onAddSkill={addSkill}
          onDeleteSkill={deleteSkill}
          onOpenPracticeOptions={(skill) => setPracticeOptions({ isOpen: true, skill })}
          onOpenAddQuestionModal={() => setIsCustomQuestionModalOpen(true)}
          onOpenReview={(skill) => setReviewModal({ isOpen: true, skill })}
          onQuickStart={(skill) => handleQuickStart(skill)}
          onStarterSkill={handleStarterSkill}
          isSkillLimitReached={isSkillLimitReached}
          isAuthenticated={isAuthenticated}
          questionsRemaining={questionsRemaining}
          insights={insights}
        />
      </main>
      {isCustomQuestionModalOpen && (
        <CustomQuestionModal 
            skills={skills}
            onClose={() => setIsCustomQuestionModalOpen(false)}
            onAddQuestion={addCustomQuestion}
        />
      )}
      {practiceOptions.isOpen && practiceOptions.skill && (
        <StartPracticeModal
            skill={practiceOptions.skill}
            onClose={() => setPracticeOptions({isOpen: false, skill: null})}
            onStart={handleStartPractice}
            isStarting={isStartingSession}
            isAuthenticated={isAuthenticated}
            questionsRemaining={questionsRemaining}
            sessionsRemaining={sessionsRemaining}
        />
      )}
      {reviewModal.isOpen && reviewModal.skill && (
        <ReviewModal
            skill={reviewModal.skill}
            isAuthenticated={isAuthenticated}
            onClose={() => setReviewModal({ isOpen: false, skill: null })}
            onPractice={(questions) => handleRetryMissed(reviewModal.skill as Skill, questions)}
        />
      )}
      {limitModal.isOpen && limitModal.reason && (
        <LimitReachedModal
          reason={limitModal.reason}
          onClose={() => setLimitModal({ isOpen: false, reason: null })}
          onUpgrade={handlePurchaseQuestions}
          // Render GoogleLogin component directly within the modal for convenience
          googleLoginComponent={(
            <GoogleLogin
              onSuccess={handleLoginSuccess}
              onError={() => {
                logger.error('Google Login Failed from LimitReachedModal.');
                alert('Google login failed. Please try again.');
              }}
              theme="filled_black"
              text="signin_with"
              shape="pill"
            />
          )}
        />
      )}
      {isWelcomeModalOpen && <WelcomeModal onClose={() => setIsWelcomeModalOpen(false)} />}
      {isProgressOpen && isAuthenticated && (
        <ProgressModal onClose={() => setIsProgressOpen(false)} />
      )}
      {toastMessage && (
        <ToastNotification message={toastMessage} onClose={() => setToastMessage(null)} />
      )}
      {showPurchaseModal && (
        <PurchaseQuestionsModal
          onClose={() => setShowPurchaseModal(false)}
          onPurchase={handlePurchaseQuestions}
        />
      )}
      <Footer />
    </div>
  );
};

const App: React.FC = () => {
    const isAuthEnabled = GOOGLE_CLIENT_ID !== "YOUR_GOOGLE_CLIENT_ID_HERE" && GOOGLE_CLIENT_ID.trim() !== "";

    if (isAuthEnabled) {
      return (
          <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}
            onScriptLoadSuccess={() => console.log('GSI script loaded successfully')}
            onScriptLoadError={() => console.error('GSI script failed to load')}
          >
              <AppContent isAuthEnabled={true} />
          </GoogleOAuthProvider>
      );
    }

    // Render in anonymous mode if no Client ID is provided
    return <AppContent isAuthEnabled={false} />;
};


export default App;