import { PanelLeftClose, PanelLeftOpen, Star, TrendingUp } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import InitialLoader from '../components/InitialLoader';
import MenuList from '../components/MenuList';
import OrderPanel from '../components/OrderPanel';
import ProductDialog from '../components/ProductDialog';
import Sidebar from '../components/Sidebar';
import { Spinner } from '@ury/ui';
import { cn } from '@ury/ui';
import { t } from '../i18n';
import { usePOSStore } from '../store/pos-store';

const CATEGORIES_OPEN_KEY = 'pos_categories_open'; // Patch 67

export default function POS() {
  const {
    quickFilter,
    setQuickFilter,
    setSelectedItem,
    addToOrder,
    loading,
    error,
    isMenuInteractionDisabled,
    isInitializing,
    categories,
    selectedCategory,
    setSelectedCategory,
  } = usePOSStore();

  // Patch 67: the categories column can be closed to leave its width to the dishes (iPad).
  // Closed, the categories are chips in the filter row. The choice is kept on the device;
  // without one, the column starts closed on screens narrower than 1280 px.
  const [categoriesOpen, setCategoriesOpen] = useState(() => {
    try {
      const saved = localStorage.getItem(CATEGORIES_OPEN_KEY);
      if (saved !== null) return saved === '1';
    } catch {
      // storage unavailable: fall back to the screen width
    }
    return window.innerWidth >= 1280;
  });
  const toggleCategories = () => {
    setCategoriesOpen((open) => {
      try {
        localStorage.setItem(CATEGORIES_OPEN_KEY, open ? '0' : '1');
      } catch {
        // not kept; the column still toggles
      }
      return !open;
    });
  };
  const chipClass = (active: boolean) =>
    cn(
      'flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap shrink-0',
      active ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200',
      isMenuInteractionDisabled() && 'opacity-50 cursor-not-allowed pointer-events-none'
    );
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const clickTimerRef = useRef<NodeJS.Timeout | null>(null);
  const clickCountRef = useRef(0);

  useEffect(() => {
    return () => {
      if (clickTimerRef.current) {
        clearTimeout(clickTimerRef.current);
      }
    };
  }, []);

  const handleItemClick = (item: any) => {
    if (isMenuInteractionDisabled()) return;
    
    clickCountRef.current += 1;
    
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current);
    }

    clickTimerRef.current = setTimeout(() => {
      // Patch 37: a meal with sizes always asks which size (the size meals are not on the grid).
      if (clickCountRef.current === 1 && !item.has_sizes && !item.has_choices) {
        // Single click - add to cart
        addToOrder({ ...item, quantity: 1 });
      } else if (clickCountRef.current >= 2 || item.has_sizes || item.has_choices) {
        // Double click (or Patch 37: one tap on a meal with sizes) - open dialog
        setSelectedItem(item);
        setIsDialogOpen(true);
      }
      clickCountRef.current = 0;
    }, 250); // 250ms threshold for double click
  };

  const QuickFilterButton = ({ filter, icon: Icon, label }: { 
    filter: 'all' | 'special';
    icon: React.ElementType;
    label: string;
  }) => (
    <button
      onClick={() => setQuickFilter(filter)}
      className={chipClass(quickFilter === filter)}
      disabled={isMenuInteractionDisabled()}
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  );

  if (isInitializing) {
    return <InitialLoader />;
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <p className="text-xl font-semibold text-red-600 mb-2">{t('pos.failed_load')}</p>
          <p className="text-gray-600">{error}</p>
          <button 
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700"
          >
            {t('pos.retry')}
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Spinner message={t('common.loading_menu_items')} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <p className="text-lg font-medium text-red-600">{t('common.error_loading_menu_items')}</p>
          <p className="text-sm text-gray-500 mt-2">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Patch 67: hidden, not unmounted */}
      <div className={categoriesOpen ? 'contents' : 'hidden'}>
        <Sidebar disabled={isMenuInteractionDisabled()} />
      </div>
      <div className="flex-1 flex flex-col h-screen overflow-hidden pe-96">
        <div className="p-4 bg-white border-b border-gray-200">
          <div className="max-w-screen-xl mx-auto space-y-3">
            <div className="flex items-center gap-2 overflow-x-auto overflow-y-hidden">
              {/* <SearchBar
                value={searchQuery}
                onChange={setSearchQuery}
                onVisibilityChange={setShowSearch}
                isVisible={showSearch}
                disabled={isMenuInteractionDisabled()}
              /> */}
              
              {/* Patch 67 */}
              <button
                type="button"
                onClick={toggleCategories}
                aria-expanded={categoriesOpen}
                aria-label={t(categoriesOpen ? 'pos_sidebar.hide_categories' : 'pos_sidebar.show_categories')}
                title={t(categoriesOpen ? 'pos_sidebar.hide_categories' : 'pos_sidebar.show_categories')}
                className="flex items-center justify-center h-8 w-8 shrink-0 rounded-full bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
              >
                {categoriesOpen ? (
                  <PanelLeftClose className="w-4 h-4 rtl:-scale-x-100" />
                ) : (
                  <PanelLeftOpen className="w-4 h-4 rtl:-scale-x-100" />
                )}
              </button>
              <QuickFilterButton filter="all" icon={Star} label={t('common.all')} />
              <QuickFilterButton filter="special" icon={TrendingUp} label={t('menu.special_items')} />
              {!categoriesOpen && (
                <>
                  <span className="h-5 w-px bg-gray-200 shrink-0" aria-hidden="true" />
                  <button
                    type="button"
                    onClick={() => setSelectedCategory('')}
                    className={chipClass(selectedCategory === '')}
                    disabled={isMenuInteractionDisabled()}
                    aria-pressed={selectedCategory === ''}
                  >
                    {t('pos_sidebar.all_items')}
                  </button>
                  {categories.map((category) => (
                    <button
                      type="button"
                      key={category.name}
                      onClick={() => setSelectedCategory(category.name)}
                      className={chipClass(selectedCategory === category.name)}
                      disabled={isMenuInteractionDisabled()}
                      aria-pressed={selectedCategory === category.name}
                    >
                      {category.label}
                    </button>
                  ))}
                </>
              )}
            </div>
          </div>
        </div>

        <MenuList onItemClick={handleItemClick} />
      </div>
      <OrderPanel />
      {isDialogOpen && <ProductDialog onClose={() => setIsDialogOpen(false)} />}
    </div>
  );
}
