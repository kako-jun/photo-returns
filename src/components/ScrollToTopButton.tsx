import { HiChevronUp } from 'react-icons/hi2';

interface ScrollToTopButtonProps {
  show: boolean;
  onClick: () => void;
}

export function ScrollToTopButton({ show, onClick }: ScrollToTopButtonProps) {
  if (!show) return null;

  return (
    <button
      onClick={onClick}
      className="scroll-top-btn fixed right-6 bottom-6 z-40 rounded-full p-3 transition-all duration-300 active:translate-y-0.5"
      title="Back to top"
      aria-label="Back to top"
    >
      <HiChevronUp className="h-5 w-5" style={{ color: '#383838' }} />
    </button>
  );
}
