import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { usePOSStore } from '../../store/pos-store';
import { cn, Spinner } from '@ury/ui';
import MenuCard from '../../components/MenuCard';
import ProductDialog from '../../components/ProductDialog';
import { t } from '../../i18n';
import { useMenuStockRefresh } from '../../hooks/useMenuStockRefresh';

interface CaptainMenuProps {
  /** From the per-table permission map (`get_table_order_context`). When
   * false, browsing is still allowed but tapping an item does nothing. */
  canAddItems: boolean;
}

/**
 * Touch-first menu browser for the Captain order screen. Reuses the same
 * menu data/search/category-filter logic `MenuList.tsx` uses (pos-store's
 * `menuItems`/`categories`/`searchQuery`/`selectedCategory`) rather than a
 * parallel menu API, but replaces `MenuList`'s desktop click semantics with
 * a single tap = add one unit (PLAN.md §7: no double-click on touch UIs).
 * Editing quantity/notes on an already-added item happens in the Current
 * Order view, not here — see CaptainOrder.tsx.
 */
const CaptainMenu: React.FC<CaptainMenuProps> = ({ canAddItems }) => {
  const {
    menuItems,
    menuLoading,
    selectedCategory,
    setSelectedCategory,
    searchQuery,
    setSearchQuery,
    categories,
    fetchMenuItems,
    addToOrder,
    setSelectedItem,
    isOrderInteractionDisabled,
  } = usePOSStore();
  // Patch 37: a tap on a meal with sizes or extras opens its dialog (no double tap on touch).
  const [choosing, setChoosing] = useState(false);

  useEffect(() => {
    fetchMenuItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useMenuStockRefresh();

  const filteredItems = useMemo(() => {
    const term = searchQuery.toLowerCase();
    return menuItems.filter((item) => {
      const matchesCategory = !selectedCategory || item.course === selectedCategory;
      const matchesSearch =
        !searchQuery ||
        item.name.toLowerCase().includes(term) ||
        item.item.toLowerCase().includes(term);
      return matchesCategory && matchesSearch && !item.is_option;
    });
  }, [menuItems, selectedCategory, searchQuery]);

  const disabled = !canAddItems || isOrderInteractionDisabled();

  const handleTap = (item: (typeof menuItems)[number]) => {
    if (disabled || item.sold_out) return;
    if (item.has_sizes || item.has_extras) {
      setSelectedItem(item);
      setChoosing(true);
      return;
    }
    addToOrder({ ...item, quantity: 1 });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 p-3 space-y-2">
        <div className="relative">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('captain.search_menu')}
            className="w-full ps-9 pe-3 py-3 rounded-lg border border-gray-200 bg-gray-50 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 -mx-3 px-3">
          <button
            onClick={() => setSelectedCategory('')}
            className={cn(
              'shrink-0 px-4 py-2 rounded-full text-sm font-medium border',
              selectedCategory === ''
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-700 border-gray-200'
            )}
          >
            {t('common.all')}
          </button>
          {categories.map((category) => (
            <button
              key={category.name}
              onClick={() => setSelectedCategory(category.name)}
              className={cn(
                'shrink-0 px-4 py-2 rounded-full text-sm font-medium border',
                selectedCategory === category.name
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-700 border-gray-200'
              )}
            >
              {category.label}
            </button>
          ))}
        </div>

        {!canAddItems && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
            {t('captain.browse_only')}
          </p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {menuLoading ? (
          <Spinner message={t('captain.loading_menu')} />
        ) : filteredItems.length === 0 ? (
          <p className="text-center text-gray-500 text-sm mt-8">{t('common.no_items_found')}</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 pb-8">
            {filteredItems.map((item) => (
              <MenuCard
                key={item.id}
                id={item.id}
                name={item.name}
                price={item.price}
                item_image={item.image}
                course={item.course_label || item.course}
                item={item.item}
                onClick={() => handleTap(item)}
                disabled={disabled}
                portionsLeft={item.portions_left}
                soldOut={item.sold_out}
              />
            ))}
          </div>
        )}
      </div>
      {choosing && (
        <ProductDialog
          onClose={() => {
            setChoosing(false);
            setSelectedItem(null);
          }}
        />
      )}
    </div>
  );
};

export default CaptainMenu;
