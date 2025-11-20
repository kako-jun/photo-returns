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
      className="fixed right-8 bottom-8 z-40 rounded-full bg-blue-600 p-4 text-white shadow-lg transition-all duration-300 hover:bg-blue-700 hover:shadow-xl active:scale-95"
      title="トップに戻る"
      aria-label="トップに戻る"
    >
      <HiChevronUp className="h-6 w-6" />
    </button>
  );
}
