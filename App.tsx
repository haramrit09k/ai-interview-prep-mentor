import React, { useState, useCallback, useEffect, useMemo } from 'react';
import useLocalStorage from './hooks/useLocalStorage';
import type { Skill, Question, AnswerOutcome, ExperienceLevel, AnswerHistory, UserProfile } from './types';
import { generateQuestionsForSkill } from './services/gemini';
import SkillManagement from './components/SkillManagement';
import PracticeView from './components/PracticeView';
import CustomQuestionModal from './components/CustomQuestionModal';
import StartPracticeModal from './components/StartPracticeModal';
import RevisionSummaryModal from './components/RevisionSummaryModal';
import Header from './components/Header';
import { LimitReachedModal } from './components/LimitReachedModal';
import { SpinnerIcon } from './components/Icons';
import { v4 as uuidv4 } from 'uuid';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { jwtDecode } from 'jwt-decode';


// Helper to shuffle array
const shuffleArray = <T,>(array: T[]): T[] => {
  return [...array].sort(() => Math.random() - 0.5);
};

const RATING_CHANGE: Record<AnswerOutcome, number> = {
  correct: 10,
  partially_correct: 5,
  incorrect: -5,
  idk: -5,
};

// --- QUOTA DEFINITIONS ---
const SESSIONS_LIMIT_ANON = 2;
const SKILLS_LIMIT_ANON = 2;
const SKILLS_LIMIT_AUTH = 5;
const QUESTIONS_LIMIT_AUTH = 20;

// --- STABLE EMPTY ARRAY REFERENCES TO PREVENT RE-RENDERS ---
const EMPTY_SKILLS: Skill[] = [];
const EMPTY_QUESTIONS: Question[] = [];
const EMPTY_HISTORY: AnswerHistory[] = [];

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
  const historyKey = `interview_prep_answer_history_${userId}`;

  const [skills, setSkills] = useLocalStorage<Skill[]>(skillsKey, EMPTY_SKILLS);
  const [customQuestions, setCustomQuestions] = useLocalStorage<Question[]>(questionsKey, EMPTY_QUESTIONS);
  const [answerHistory, setAnswerHistory] = useLocalStorage<AnswerHistory[]>(historyKey, EMPTY_HISTORY);
  
  // --- STATE FOR QUOTA MANAGEMENT ---
  const [anonSessionsUsed, setAnonSessionsUsed] = useLocalStorage<number>('interview_prep_anon_sessions_used', 0);
  
  const [authQuota, setAuthQuota] = useState<AuthQuota>({ questionsUsed: 0, lastResetDate: new Date().toISOString().split('T')[0] });

  // Fetch quota from backend on authentication change
  useEffect(() => {
    if (isAuthenticated && userProfile) {
      const fetchQuota = async () => {
        try {
          const response = await fetch('/api/quota', {
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('google_id_token')}` // Assuming you store the ID token here
            }
          });
          if (response.ok) {
            const data = await response.json();
            setAuthQuota(data);
          } else {
            console.error('Failed to fetch quota', response.statusText);
          }
        } catch (error) {
          console.error('Error fetching quota:', error);
        }
      };
      fetchQuota();
    }
  }, [isAuthenticated, userProfile]);
  
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
  const sessionsRemaining = isAuthenticated ? Infinity : SESSIONS_LIMIT_ANON - anonSessionsUsed;
  const isSkillLimitReached = isAuthenticated 
    ? skills.length >= SKILLS_LIMIT_AUTH
    : skills.length >= SKILLS_LIMIT_ANON;

  const [practiceSession, setPracticeSession] = useState<PracticeSession | null>(null);
  const [isStartingSession, setIsStartingSession] = useState<boolean>(false);
  const [isCustomQuestionModalOpen, setIsCustomQuestionModalOpen] = useState<boolean>(false);
  const [limitModal, setLimitModal] = useState<{ isOpen: boolean; reason: 'skills' | 'sessions' | null }>({ isOpen: false, reason: null });
  const [practiceOptions, setPracticeOptions] = useState<{ isOpen: boolean; skill: Skill | null }>({ isOpen: false, skill: null });
  const [revisionModal, setRevisionModal] = useState<{ isOpen: boolean; skill: Skill | null }>({ isOpen: false, skill: null });

  const handleLoginSuccess = useCallback((credentialResponse: any) => {
    try {
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
    } catch (error) {
        console.error("Error decoding JWT:", error);
        alert("Failed to process login information.");
    }
  }, [setUserProfile]);

  const handleLogout = () => {
    if (isAuthEnabled) {
      setUserProfile(null);
      localStorage.removeItem('google_id_token'); // Clear the ID token on logout
    }
  };

  const addSkill = useCallback((name: string) => {
    if (isSkillLimitReached) {
       if (isAuthenticated) {
         alert(`You have reached the limit of ${SKILLS_LIMIT_AUTH} skills.`);
       } else {
         setLimitModal({ isOpen: true, reason: 'skills' });
       }
       return;
    }
    const skillName = name.trim();
    if (!skillName) return;

    setSkills(prevSkills => {
      if (prevSkills.some(skill => skill.name.toLowerCase() === skillName.toLowerCase())) {
        alert('This skill already exists.');
        return prevSkills;
      }
      const newSkill: Skill = { id: uuidv4(), name: skillName, rating: 0 };
      return [...prevSkills, newSkill];
    });
  }, [setSkills, isSkillLimitReached, isAuthenticated]);

  const deleteSkill = useCallback((id: string) => {
    if (window.confirm('Are you sure you want to delete this skill and all associated questions and history?')) {
      setSkills(prev => prev.filter(skill => skill.id !== id));
      setCustomQuestions(prev => prev.filter(q => q.skillId !== id));
      setAnswerHistory(prev => prev.filter(h => h.skillId !== id));
    }
  }, [setSkills, setCustomQuestions, setAnswerHistory]);
  
  const addCustomQuestion = (skillId: string, text: string, answer: string) => {
    const newQuestion: Question = { id: uuidv4(), skillId, text, answer, source: 'custom' };
    setCustomQuestions(prev => [...prev, newQuestion]);
  };

  const handleStartPractice = useCallback(async (skill: Skill, level: ExperienceLevel, count: number) => {
    if (!isAuthenticated && sessionsRemaining <= 0) {
      setLimitModal({ isOpen: true, reason: 'sessions' });
      return;
    }
    
    setIsStartingSession(true);
    setPracticeOptions({ isOpen: false, skill: null });

    try {
        const questionTexts = await generateQuestionsForSkill(skill.name, level, count);
        const aiQuestions: Question[] = questionTexts.map(text => ({
            id: uuidv4(),
            skillId: skill.id,
            text,
            source: 'gemini'
        }));
        
        if (!isAuthenticated) {
            setAnonSessionsUsed(prev => prev + 1);
        }

        const userQuestions = customQuestions.filter(q => q.skillId === skill.id);
        const allQuestions = shuffleArray([...userQuestions, ...aiQuestions]);

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
        console.error(error);
        alert(`An error occurred while fetching questions: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
        setIsStartingSession(false);
    }
  }, [customQuestions, isAuthenticated, sessionsRemaining, setAnonSessionsUsed]);

  const endPracticeSession = () => {
    setPracticeSession(null);
  };
  
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

  const handleQuestionComplete = useCallback(async ({ question, classification, conceptsKnown, conceptsToReview }: { question: Question, classification: AnswerOutcome, conceptsKnown?: string[], conceptsToReview?: string[] }) => {
    console.log("App.tsx: handleQuestionComplete received:", { question, classification, conceptsKnown, conceptsToReview });
    // Deduct from quota if it's the first time this question is being engaged with in this session
    if (isAuthenticated && practiceSession && !practiceSession.consumedQuestionIds.has(question.id)) {
        try {
            const response = await fetch('/api/quota/increment', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('google_id_token')}`
                },
            });
            if (response.ok) {
                // Optimistically update local state
                setAuthQuota(prev => ({...prev, questionsUsed: prev.questionsUsed + 1}));
            } else {
                console.error('Failed to increment quota on backend', response.statusText);
            }
        } catch (error) {
            console.error('Error incrementing quota:', error);
        }
        
        // Update the session state to mark this question as consumed
        setPracticeSession(prevSession => {
            if (!prevSession) return null;
            const newConsumedIds = new Set(prevSession.consumedQuestionIds);
            newConsumedIds.add(question.id);
            return { ...prevSession, consumedQuestionIds: newConsumedIds };
        });
    }

    setSkills(prevSkills => 
        prevSkills.map(skill => {
            if (skill.id === question.skillId) {
                const change = RATING_CHANGE[classification];
                const newRating = Math.max(0, Math.min(100, skill.rating + change));
                return { ...skill, rating: newRating };
            }
            return skill;
        })
    );
    
    const historyEntry: AnswerHistory = {
        skillId: question.skillId,
        questionText: question.text,
        outcome: classification,
        conceptsKnown: conceptsKnown || [],
        conceptsToReview: conceptsToReview || []
    };
    setAnswerHistory(prev => [...prev, historyEntry]);

  }, [isAuthenticated, practiceSession, setAuthQuota, setPracticeSession, setSkills, setAnswerHistory]);

  const handlePurchaseQuestions = useCallback(async (quantity: number) => {
    if (!isAuthenticated) {
      alert("Please log in to purchase more questions.");
      return;
    }
    console.log(`Attempting to purchase ${quantity} questions from header...`);
    try {
      const response = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('google_id_token')}`,
        },
        body: JSON.stringify({ quantity }),
      });

      if (response.ok) {
        const { url } = await response.json();
        window.location.href = url; // Redirect to Stripe Checkout
      } else {
        const errorData = await response.json();
        console.error('Failed to create checkout session:', errorData.error);
        alert(`Failed to initiate payment: ${errorData.error}`);
      }
    } catch (error) {
      console.error('Error during checkout initiation:', error);
      alert('An error occurred while trying to initiate payment.');
    }
  }, [isAuthenticated]);

  if (practiceSession) {
    return <PracticeView session={practiceSession} onEndSession={endPracticeSession} onNavigate={navigateQuestion} onQuestionComplete={handleQuestionComplete} questionsRemaining={questionsRemaining} />;
  }

  return (
    <div className="min-h-screen text-text-primary bg-background-dark">
      <Header 
        userProfile={userProfile} 
        onLoginSuccess={handleLoginSuccess} 
        onLogout={handleLogout} 
        isAuthEnabled={isAuthEnabled}
        questionsRemaining={questionsRemaining}
        isAuthenticated={isAuthenticated}
        onPurchaseQuestions={handlePurchaseQuestions}
      />
      {isStartingSession && (
         <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center">
            <div className="flex flex-col items-center gap-4">
              <SpinnerIcon className="w-16 h-16 border-4 border-brand-primary" />
              <p className="text-white text-lg font-semibold">Generating your session...</p>
            </div>
         </div>
      )}
      <main className="py-8">
        <SkillManagement
          skills={skills}
          onAddSkill={addSkill}
          onDeleteSkill={deleteSkill}
          onOpenPracticeOptions={(skill) => setPracticeOptions({ isOpen: true, skill })}
          onOpenAddQuestionModal={() => setIsCustomQuestionModalOpen(true)}
          onOpenRevisionSummary={(skill) => setRevisionModal({ isOpen: true, skill })}
          isSkillLimitReached={isSkillLimitReached}
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
      {revisionModal.isOpen && revisionModal.skill && (
        <RevisionSummaryModal
            skill={revisionModal.skill}
            answerHistory={answerHistory}
            onClose={() => setRevisionModal({ isOpen: false, skill: null })}
        />
      )}
      {limitModal.isOpen && limitModal.reason && (
        <LimitReachedModal
          reason={limitModal.reason}
          onClose={() => setLimitModal({ isOpen: false, reason: null })}
        />
      )}
    </div>
  );
};

const App: React.FC = () => {
    const isAuthEnabled = GOOGLE_CLIENT_ID !== "YOUR_GOOGLE_CLIENT_ID_HERE" && GOOGLE_CLIENT_ID.trim() !== "";

    if (isAuthEnabled) {
      return (
          <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
              <AppContent isAuthEnabled={true} />
          </GoogleOAuthProvider>
      );
    }

    // Render in anonymous mode if no Client ID is provided
    return <AppContent isAuthEnabled={false} />;
};


export default App;