import React, { useEffect, useState } from 'react';

interface ToastNotificationProps {
  message: string;
  onClose: () => void;
}

const ToastNotification: React.FC<ToastNotificationProps> = ({ message, onClose }) => {
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, 5000); // 5 seconds

    const countdownInterval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(countdownInterval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000); // Update every second

    return () => {
      clearTimeout(timer);
      clearInterval(countdownInterval);
    };
  }, [onClose]);

  return (
    <div className="fixed bottom-4 right-4 text-white px-4 py-2 rounded-md shadow-lg z-50" style={{ backgroundColor: 'rgba(34, 197, 94, 0.2)' }}>
      {message}
      <span className="text-xs ml-2">({countdown}s)</span>
    </div>
  );
};

export default ToastNotification;