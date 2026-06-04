import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { useConversationStore, useModelStore, useUIStore, useSettingsStore } from '../store';

function Sidebar() {
  const [drawerOpen, setDrawerOpen] = useState(false);

  const sidebarCollapsed = useUIStore((state) => state.isSidebarCollapsed());
  const toggleSidebar = useUIStore((state) => state.actions.toggleSidebar);

  const currentConversation = useConversationStore((state) => state.getCurrentConversation());
  const savedConversations = useConversationStore((state) => state.getSavedConversations());
  const createConversation = useConversationStore((state) => state.actions.createConversation);
  const clearCurrentConversation = useConversationStore((state) => state.actions.clearCurrentConversation);
  const saveCurrentConversation = useConversationStore((state) => state.actions.saveCurrentConversation);
  const deleteSavedConversation = useConversationStore((state) => state.actions.deleteSavedConversation);

  const currentModel = useModelStore((state) => {
    const { models, currentModelId } = state;
    return models.find((m) => m.id === currentModelId) || null;
  });
  const models = useModelStore((state) => state.models);
  const setCurrentModel = useModelStore((state) => state.actions.setCurrentModel);

  const defaultModelId = useSettingsStore((state) => state.getDefaultModelId());

  const isConfirmClearOpen = useUIStore((state) => state.isConfirmClearOpen());
  const openConfirmClear = useUIStore((state) => state.actions.openConfirmClear);
  const closeConfirmClear = useUIStore((state) => state.actions.closeConfirmClear);

  const hasUnsavedChanges = useConversationStore((state) => state.hasUnsavedChanges());

  const handleNewChat = () => {
    if (hasUnsavedChanges) {
      openConfirmClear();
    } else {
      clearCurrentConversation();
      createConversation();
    }
  };

  const handleSaveAndNew = async () => {
    if (currentConversation) {
      await saveCurrentConversation({ title: currentConversation.title });
    }
    clearCurrentConversation();
    createConversation();
    closeConfirmClear();
  };

  const handleDiscardAndNew = () => {
    clearCurrentConversation();
    createConversation();
    closeConfirmClear();
  };

  const handleCancel = () => {
    closeConfirmClear();
  };

  const handleDeleteConversation = async (e, id) => {
    e.stopPropagation();
    await deleteSavedConversation(id);
  };

  const handleLoadConversation = (id) => {
    useConversationStore.getState().actions.loadConversation(id);
    setDrawerOpen(false);
  };

  // Mobile drawer toggle
  const toggleDrawer = () => setDrawerOpen((prev) => !prev);

  // Close drawer on escape
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') setDrawerOpen(false);
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, []);

  // On mobile, sidebar should be in drawer mode, not collapsed
  const effectiveCollapsed = sidebarCollapsed;
  const sidebarWidth = effectiveCollapsed ? 'w-16' : 'w-64';

  return (
    <>
      {/* Mobile drawer overlay */}
      {drawerOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={toggleDrawer}
          aria-hidden="true"
        />
      )}

      {/* Sidebar - full height from top to bottom */}
      <aside
        className={`fixed top-0 left-0 bottom-0 bg-black z-50 flex flex-col transition-all duration-300 ease-in-out lg:static ${
          drawerOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        } ${sidebarWidth}`}
      >
        {/* Sidebar header - fixed at top */}
        <div className="p-4 flex items-center justify-between shrink-0 border-b border-gray-800">
          {!effectiveCollapsed ? (
            <h1 className="text-xl font-bold uppercase tracking-wider">LLM Chat</h1>
          ) : (
            <div className="w-full" />
          )}
          <div className="flex items-center gap-2">
            {/* Collapse toggle button - only show on desktop */}
            <button
              onClick={toggleSidebar}
              className="hidden lg:block p-2 rounded-lg hover:bg-gray-900 focus:outline-none focus:ring-1 focus:ring-white transition-colors"
              aria-label={effectiveCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              <span className="text-sm font-bold">{effectiveCollapsed ? '▶' : '◀'}</span>
            </button>
            {/* Mobile close button */}
            <button
              onClick={toggleDrawer}
              className="lg:hidden p-2 rounded-lg hover:bg-gray-900 focus:outline-none focus:ring-1 focus:ring-white transition-colors"
              aria-label="Close menu"
            >
              <span className="text-xl">×</span>
            </button>
          </div>
        </div>

        {/* Main scrollable content - takes all available space */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {/* Current Model */}
          {!effectiveCollapsed && (
            <div className="p-4 border-b border-gray-800">
              <h2 className="text-xs font-bold uppercase text-gray-500 mb-3 tracking-wider">
                Current Model
              </h2>
              <select
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-white text-white"
                value={currentModel?.id || defaultModelId || ''}
                onChange={(e) => {
                  const modelId = e.target.value;
                  if (modelId) {
                    setCurrentModel(modelId);
                  }
                }}
              >
                {models.length === 0 && (
                  <option value="" className="text-gray-400">
                    No models configured
                  </option>
                )}
                {models.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name} ({model.provider}:{model.model_name})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* New Chat Button */}
          {!effectiveCollapsed && (
            <div className="p-4 border-b border-gray-800">
              <button
                onClick={handleNewChat}
                className="w-full px-4 py-3 bg-white text-black rounded-lg hover:bg-gray-200 focus:outline-none focus:ring-1 focus:ring-white font-medium transition-colors uppercase tracking-wider"
              >
                + New Chat
              </button>
            </div>
          )}

          {/* Conversation History */}
          {!effectiveCollapsed && (
            <div className="p-4 border-b border-gray-800">
              <h2 className="text-xs font-bold uppercase text-gray-500 mb-3 tracking-wider">
                History
              </h2>
              {savedConversations.length === 0 ? (
                <p className="text-gray-500 text-sm">No saved conversations</p>
              ) : (
                <div className="space-y-1">
                  {savedConversations.slice(0, 10).map((conversation) => (
                    <div
                      key={conversation.id}
                      className="flex items-center gap-1 group"
                    >
                      <button
                        onClick={() => handleLoadConversation(conversation.id)}
                        className="flex-1 text-left p-3 rounded-lg hover:bg-gray-900 focus:outline-none focus:ring-1 focus:ring-white text-sm truncate transition-colors"
                      >
                        {conversation.title}
                      </button>
                      <button
                        onClick={(e) => handleDeleteConversation(e, conversation.id)}
                        className="p-2 rounded-lg hover:bg-red-900/40 text-gray-500 hover:text-red-400 focus:outline-none focus:ring-1 focus:ring-white opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Delete conversation"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Bottom Navigation - pinned to bottom of sidebar */}
        <div className="shrink-0 border-t border-gray-800 bg-gray-900/30 p-2">
          {!effectiveCollapsed ? (
            <nav className="space-y-1">
              <Link
                to="/models"
                onClick={() => setDrawerOpen(false)}
                className="block w-full text-left p-3 rounded-lg hover:bg-gray-800 focus:outline-none focus:ring-1 focus:ring-white text-sm transition-colors uppercase tracking-wider"
              >
                Model Hub
              </Link>
              <Link
                to="/settings"
                onClick={() => setDrawerOpen(false)}
                className="block w-full text-left p-3 rounded-lg hover:bg-gray-800 focus:outline-none focus:ring-1 focus:ring-white text-sm transition-colors uppercase tracking-wider"
              >
                Settings
              </Link>
            </nav>
          ) : (
            <nav className="space-y-1">
              <Link
                to="/models"
                onClick={() => setDrawerOpen(false)}
                className="block w-full p-3 rounded-lg hover:bg-gray-800 focus:outline-none focus:ring-1 focus:ring-white text-sm transition-colors"
                aria-label="Model Hub"
                title="Model Hub"
              >
                <span className="font-bold">M</span>
              </Link>
              <Link
                to="/settings"
                onClick={() => setDrawerOpen(false)}
                className="block w-full p-3 rounded-lg hover:bg-gray-800 focus:outline-none focus:ring-1 focus:ring-white text-sm transition-colors"
                aria-label="Settings"
                title="Settings"
              >
                <span className="font-bold">S</span>
              </Link>
            </nav>
          )}
        </div>
      </aside>

      {/* Mobile drawer toggle button (hamburger) - always show on mobile */}
      <button
        onClick={toggleDrawer}
        className="lg:hidden fixed top-4 left-4 z-40 p-2 rounded-lg bg-gray-900 border border-gray-700 hover:bg-gray-800 focus:outline-none focus:ring-1 focus:ring-white transition-colors"
        aria-label="Open menu"
      >
        <span className="text-xl font-bold">☰</span>
      </button>

      {/* New Chat Confirmation Modal */}
      {isConfirmClearOpen && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 max-w-sm w-full">
            <h2 className="text-lg font-bold mb-4 uppercase tracking-wider">Unsaved Conversation</h2>
            <p className="mb-6 text-gray-400">
              You have an unsaved conversation. Save before creating a new chat?
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={handleCancel}
                className="px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg hover:bg-gray-700 focus:outline-none focus:ring-1 focus:ring-white transition-colors uppercase text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleDiscardAndNew}
                className="px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg hover:bg-gray-700 focus:outline-none focus:ring-1 focus:ring-white transition-colors uppercase text-sm"
              >
                Discard
              </button>
              <button
                onClick={handleSaveAndNew}
                className="px-4 py-2 bg-white text-black rounded-lg hover:bg-gray-200 focus:outline-none focus:ring-1 focus:ring-white transition-colors uppercase text-sm font-medium"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default Sidebar;
