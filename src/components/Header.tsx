import { HiOutlineSun, HiOutlineMoon } from "react-icons/hi2";

interface HeaderProps {
  isDark: boolean;
  onToggleDarkMode: () => void;
}

export function Header({ isDark, onToggleDarkMode }: HeaderProps) {
  return (
    <header className="text-center mb-8 pb-5 relative">
      <button
        onClick={onToggleDarkMode}
        className="absolute top-0 right-0 px-4 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 active:scale-95 text-gray-800 dark:text-gray-200 font-semibold transition-all duration-200 shadow-sm hover:shadow-md flex items-center gap-2"
        title="Toggle Dark Mode"
      >
        {isDark ? (
          <>
            <HiOutlineSun className="w-5 h-5" />
            Light
          </>
        ) : (
          <>
            <HiOutlineMoon className="w-5 h-5" />
            Dark
          </>
        )}
      </button>
      <h1 className="text-5xl font-bold text-gray-800 dark:text-gray-100 mb-2">
        PhotoReturns
      </h1>
      <p className="text-lg text-gray-600 dark:text-gray-400 italic">
        Take back your memories
      </p>
    </header>
  );
}
