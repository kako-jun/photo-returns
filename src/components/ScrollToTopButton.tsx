import { HiChevronUp } from "react-icons/hi2";

interface ScrollToTopButtonProps {
  show: boolean;
  onClick: () => void;
}

export function ScrollToTopButton({ show, onClick }: ScrollToTopButtonProps) {
  if (!show) return null;

  return (
    <button
      onClick={onClick}
      className="fixed bottom-8 right-8 p-4 rounded-full bg-blue-600 hover:bg-blue-700 text-white shadow-lg hover:shadow-xl transition-all duration-300 z-40 active:scale-95"
      title="トップに戻る"
      aria-label="トップに戻る"
    >
      <HiChevronUp className="w-6 h-6" />
    </button>
  );
}
