// Patch 24: customer self-ordering app in English, French and Arabic.
// Language: the customer's choice (kept on this device), else the restaurant's default
// language (System Settings, sent by www/order.py), else English.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export type Lang = 'en' | 'fr' | 'ar'
export const LANGS: { code: Lang; label: string }[] = [
  { code: 'fr', label: 'FR' },
  { code: 'ar', label: 'ع' },
  { code: 'en', label: 'EN' },
]
const STORAGE_KEY = 'ury_order_lang'

const en = {
  loading_menu: 'Loading menu…',
  starting: 'Starting up…',
  device_failed: 'This device could not be started. Please contact staff.',
  device_bootstrap_failed: 'Unable to bootstrap this device.',
  missing_code: 'This link is missing an ordering code. Please rescan the QR code on your table.',
  menu_failed: 'Unable to load the menu. Please rescan the QR code.',
  order_failed: 'Could not place the order. Please try again.',
  bill_failed: 'Could not request the bill. Please ask staff for help.',
  payment_failed: 'Could not start online payment. Please pay at the counter.',
  order_for_pickup: 'Order for Pickup',
  order: 'Order',
  table: 'Table {table}',
  start_over: 'Start Over',
  start_over_confirm: 'Start over? Your current cart will be cleared.',
  new_order: 'New Order',
  new_order_confirm: 'Start a new order? Current cart will be cleared.',
  order_so_far: 'Your order so far',
  pickup_code: 'Pickup code: {code}',
  total: 'Total',
  pay_online: 'Pay Online',
  starting_payment: 'Starting payment…',
  payment_request_created: 'Payment request created ({amount}): a staff member will help you pay.',
  request_bill: 'Request Bill',
  bill_requested: 'Bill requested: staff notified',
  in_cart: 'In cart: {qty}',
  remove_one: 'Remove one {name}',
  add_one: 'Add one more {name}',
  items_one: '{count} item',
  items_other: '{count} items',
  place_order: 'Place Order',
  placing_order: 'Placing order…',
  placing: 'Placing…',
  cart: 'Cart',
  cart_empty: 'Tap a menu item to add it to your cart.',
  menu_categories: 'Menu categories',
  all_items: 'All Items',
  other: 'Other',
  still_there: 'Still there?',
  still_here: "I'm still here",
  assign_tablet: 'Assign This Tablet',
  enter_pin: 'Enter staff PIN',
  pin_entry: 'PIN entry',
  continue: 'Continue',
  enter_table: 'Enter table name or code',
  table_placeholder: 'e.g. T12',
  assign_table: 'Assign Table',
  assigning: 'Assigning…',
  back: 'Back',
  not_provisioned: 'This tablet is not provisioned. Please contact staff.',
  assign_failed: 'Could not assign this table. Please check the PIN and try again.',
  language: 'Language',
}
type Key = keyof typeof en

const fr: Record<Key, string> = {
  loading_menu: 'Chargement du menu…',
  starting: 'Démarrage…',
  device_failed: "Cet appareil n'a pas pu démarrer. Merci de prévenir le personnel.",
  device_bootstrap_failed: "Impossible de démarrer cet appareil.",
  missing_code: 'Ce lien ne contient pas de code de commande. Scannez à nouveau le QR code de votre table.',
  menu_failed: 'Impossible de charger le menu. Scannez à nouveau le QR code.',
  order_failed: "La commande n'a pas pu être envoyée. Réessayez.",
  bill_failed: "L'addition n'a pas pu être demandée. Demandez au personnel.",
  payment_failed: 'Le paiement en ligne est indisponible. Merci de payer au comptoir.',
  order_for_pickup: 'Commande à emporter',
  order: 'Commande',
  table: 'Table {table}',
  start_over: 'Recommencer',
  start_over_confirm: 'Recommencer ? Votre panier sera vidé.',
  new_order: 'Nouvelle commande',
  new_order_confirm: 'Nouvelle commande ? Le panier actuel sera vidé.',
  order_so_far: 'Votre commande',
  pickup_code: 'Code de retrait : {code}',
  total: 'Total',
  pay_online: 'Payer en ligne',
  starting_payment: 'Ouverture du paiement…',
  payment_request_created: 'Demande de paiement créée ({amount}) : un membre du personnel va vous aider à payer.',
  request_bill: "Demander l'addition",
  bill_requested: 'Addition demandée : le personnel est prévenu',
  in_cart: 'Dans le panier : {qty}',
  remove_one: 'Retirer un {name}',
  add_one: 'Ajouter un {name}',
  items_one: '{count} article',
  items_other: '{count} articles',
  place_order: 'Commander',
  placing_order: 'Envoi de la commande…',
  placing: 'Envoi…',
  cart: 'Panier',
  cart_empty: 'Touchez un plat du menu pour l’ajouter au panier.',
  menu_categories: 'Catégories du menu',
  all_items: 'Tout le menu',
  other: 'Autres',
  still_there: 'Vous êtes toujours là ?',
  still_here: 'Je suis là',
  assign_tablet: 'Attribuer cette tablette',
  enter_pin: 'Code du personnel',
  pin_entry: 'Saisie du code',
  continue: 'Continuer',
  enter_table: 'Nom ou code de la table',
  table_placeholder: 'ex. T12',
  assign_table: 'Attribuer la table',
  assigning: 'Attribution…',
  back: 'Retour',
  not_provisioned: "Cette tablette n'est pas configurée. Merci de prévenir le personnel.",
  assign_failed: "La table n'a pas pu être attribuée. Vérifiez le code et réessayez.",
  language: 'Langue',
}

const ar: Record<Key, string> = {
  loading_menu: 'جارٍ تحميل القائمة…',
  starting: 'جارٍ التشغيل…',
  device_failed: 'تعذّر تشغيل هذا الجهاز. يرجى إبلاغ الموظفين.',
  device_bootstrap_failed: 'تعذّر تشغيل هذا الجهاز.',
  missing_code: 'هذا الرابط لا يحتوي على رمز الطلب. امسح رمز QR الموجود على طاولتك مرة أخرى.',
  menu_failed: 'تعذّر تحميل القائمة. امسح رمز QR مرة أخرى.',
  order_failed: 'تعذّر إرسال الطلب. أعد المحاولة.',
  bill_failed: 'تعذّر طلب الفاتورة. اطلبها من الموظفين.',
  payment_failed: 'الدفع عبر الإنترنت غير متاح. يرجى الدفع عند الصندوق.',
  order_for_pickup: 'طلب سفري',
  order: 'الطلب',
  table: 'الطاولة {table}',
  start_over: 'البدء من جديد',
  start_over_confirm: 'البدء من جديد؟ ستُفرَّغ سلتك.',
  new_order: 'طلب جديد',
  new_order_confirm: 'طلب جديد؟ ستُفرَّغ السلة الحالية.',
  order_so_far: 'طلبك',
  pickup_code: 'رمز الاستلام: {code}',
  total: 'المجموع',
  pay_online: 'الدفع عبر الإنترنت',
  starting_payment: 'جارٍ فتح الدفع…',
  payment_request_created: 'تم إنشاء طلب الدفع ({amount}): سيساعدك أحد الموظفين على الدفع.',
  request_bill: 'طلب الفاتورة',
  bill_requested: 'تم طلب الفاتورة: أُبلغ الموظفون',
  in_cart: 'في السلة: {qty}',
  remove_one: 'إزالة واحد {name}',
  add_one: 'إضافة واحد {name}',
  items_one: '{count} صنف',
  items_other: '{count} أصناف',
  place_order: 'اطلب',
  placing_order: 'جارٍ إرسال الطلب…',
  placing: 'جارٍ الإرسال…',
  cart: 'السلة',
  cart_empty: 'اضغط على طبق من القائمة لإضافته إلى السلة.',
  menu_categories: 'أقسام القائمة',
  all_items: 'كل القائمة',
  other: 'أخرى',
  still_there: 'هل ما زلت هنا؟',
  still_here: 'نعم، أنا هنا',
  assign_tablet: 'تعيين هذا الجهاز اللوحي',
  enter_pin: 'رمز الموظف',
  pin_entry: 'إدخال الرمز',
  continue: 'متابعة',
  enter_table: 'اسم الطاولة أو رمزها',
  table_placeholder: 'مثال: T12',
  assign_table: 'تعيين الطاولة',
  assigning: 'جارٍ التعيين…',
  back: 'رجوع',
  not_provisioned: 'هذا الجهاز اللوحي غير مُعدّ. يرجى إبلاغ الموظفين.',
  assign_failed: 'تعذّر تعيين الطاولة. تحقق من الرمز وأعد المحاولة.',
  language: 'اللغة',
}

const MESSAGES: Record<Lang, Record<Key, string>> = { en, fr, ar }

const isLang = (value: unknown): value is Lang => value === 'en' || value === 'fr' || value === 'ar'

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (isLang(saved)) return saved
  } catch {
    /* storage blocked: use the restaurant language */
  }
  const restaurant = (window as unknown as { frappe?: { boot?: { restaurant_lang?: string } } }).frappe?.boot?.restaurant_lang
  const base = (restaurant || '').slice(0, 2)
  return isLang(base) ? base : 'en'
}

let currentLang: Lang = initialLang()

/** Language for server calls (`_lang`), so server messages match the page. */
export const activeLang = () => currentLang

function translate(lang: Lang, key: Key, params?: Record<string, string | number>) {
  let text = MESSAGES[lang][key] ?? en[key] ?? key
  for (const [name, value] of Object.entries(params ?? {})) text = text.split(`{${name}}`).join(String(value))
  return text
}

type I18n = {
  lang: Lang
  setLang: (lang: Lang) => void
  t: (key: Key, params?: Record<string, string | number>) => string
  /** "{count} item(s)" in the active language. */
  items: (count: number) => string
}

const I18nContext = createContext<I18n | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(currentLang)

  useEffect(() => {
    currentLang = lang
    document.documentElement.lang = lang
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'
  }, [lang])

  const setLang = useCallback((next: Lang) => {
    currentLang = next
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      /* storage blocked: the choice lasts for this page only */
    }
    setLangState(next)
  }, [])

  const value = useMemo<I18n>(
    () => ({
      lang,
      setLang,
      t: (key, params) => translate(lang, key, params),
      items: (count) => translate(lang, count === 1 ? 'items_one' : 'items_other', { count }),
    }),
    [lang, setLang],
  )
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18n {
  const value = useContext(I18nContext)
  if (!value) throw new Error('useI18n outside I18nProvider')
  return value
}

/** Plain-text translation outside React components (hooks' error fallbacks). */
export const tr = (key: Key, params?: Record<string, string | number>) => translate(currentLang, key, params)

export function LanguageSwitch({ className = '' }: { className?: string }) {
  const { lang, setLang, t } = useI18n()
  return (
    <div role="group" aria-label={t('language')} className={`flex gap-1 ${className}`}>
      {LANGS.map((option) => (
        <button
          key={option.code}
          type="button"
          onClick={() => setLang(option.code)}
          aria-pressed={lang === option.code}
          className={`rounded-md border px-2 py-1 text-xs font-medium ${
            lang === option.code ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
