import { HiOutlineSun, HiOutlineMoon } from 'react-icons/hi2';

interface HeaderProps {
  isDark: boolean;
  onToggleDarkMode: () => void;
}

export function Header({ isDark, onToggleDarkMode }: HeaderProps) {
  return (
    <header className="relative mb-8 pb-5 text-center">
      <button
        onClick={onToggleDarkMode}
        className="absolute top-0 right-0 flex items-center gap-2 rounded-lg bg-gray-200 px-4 py-2 font-semibold text-gray-800 shadow-sm transition-all duration-200 hover:bg-gray-300 hover:shadow-md active:scale-95 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
        title="Toggle Dark Mode"
      >
        {isDark ? (
          <>
            <HiOutlineSun className="h-5 w-5" />
            Light
          </>
        ) : (
          <>
            <HiOutlineMoon className="h-5 w-5" />
            Dark
          </>
        )}
      </button>
      <h1 className="mb-2 text-5xl font-bold text-gray-800 dark:text-gray-100">PhotoReturns</h1>
      <p className="text-lg text-gray-600 italic dark:text-gray-400">Take back your memories</p>
    </header>
  );
}
