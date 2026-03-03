'use client';

const CHAT_STORAGE_KEY = 'movie-chat-history';

export default function NewChatButton() {
  function handleNewChat() {
    localStorage.removeItem(CHAT_STORAGE_KEY);
    window.location.reload();
  }

  return (
    <button
      onClick={handleNewChat}
      title="New chat"
      aria-label="New chat"
      className="flex items-center justify-center w-8 h-8 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-gray-700 transition-colors"
    >
      {/* Compose / new chat icon */}
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
        <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
      </svg>
    </button>
  );
}
