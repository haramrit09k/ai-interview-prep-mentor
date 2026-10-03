import React, { useEffect, useRef } from 'react';
import { XIcon } from './Icons';

interface ModalProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  maxWidth?: string;
}

const FOCUSABLE = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

/**
 * Accessible dialog: labelled, closes on Escape, keeps keyboard focus inside while open,
 * and hands focus back to whatever opened it.
 */
const Modal: React.FC<ModalProps> = ({ title, onClose, children, maxWidth = 'max-w-3xl' }) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = React.useId();

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const items = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      opener?.focus?.();
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-50 p-4"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`bg-background-medium rounded-xl shadow-2xl w-full ${maxWidth} border border-background-light outline-none`}
      >
        <div className="p-4 sm:p-6 md:p-8 relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1 rounded text-text-muted hover:text-text-primary focus-visible:ring-2 focus-visible:ring-brand-light transition-colors"
            aria-label="Close"
          >
            <XIcon className="w-6 h-6" />
          </button>
          <h2 id={titleId} className="text-2xl font-bold text-text-primary mb-4 pr-8">{title}</h2>
          <div className="max-h-[70vh] overflow-y-auto pr-2 -mr-2">{children}</div>
        </div>
      </div>
    </div>
  );
};

export default Modal;
