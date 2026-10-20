// Patch 26: kitchen screen texts in English, French and Arabic, in the restaurant's
// default language (System Settings, set on the page by erp_restaurant as window.restaurant_lang).

const MESSAGES = {
  en: {
    kitchen: "Kitchen",
    switch_to_dashboard: "Switch to Dashboard",
    logout: "Logout",
    refresh: "Refresh",
    loading_dashboard: "Loading kitchen dashboard…",
    production_unit: "Production unit",
    active: "Active",
    served: "Served",
    total: "Total",
    open_unit: "Tap to see the orders",
    not_permitted: "Not permitted",
    login_to_access: "Log in to access this page.",
    login: "Log in",
    no_active_orders: "No active orders for {unit}",
    confirm: "Confirm",
    serve: "Serve",
    table: "Table",
    takeaway: "Takeaway",
    aggregator: "Aggregator",
    aggregator_id: "Aggregator ID",
    order: "Order",
    type_cancelled: "Cancelled",
    type_partially_cancelled: "Partially cancelled",
    duplicate_kot: "Duplicate ticket: check with the waiter",
    old_qty: "Old qty = {qty}",
    audio_disabled: "Sound alerts are off. Tap anywhere to turn them on.",
    order_delayed: "Order delayed",
    invoice: "Invoice",
    order_no: "Order #",
    time: "Time",
    table_unknown: "Table or takeaway unknown",
    online: "You are online",
    offline: "You are offline",
    username: "Username",
    password: "Password",
    sign_in: "Sign in",
  },
  fr: {
    kitchen: "Cuisine",
    switch_to_dashboard: "Aller au tableau de bord",
    logout: "Se déconnecter",
    refresh: "Actualiser",
    loading_dashboard: "Chargement de la cuisine…",
    production_unit: "Poste de production",
    active: "En cours",
    served: "Servies",
    total: "Total",
    open_unit: "Touchez pour voir les commandes",
    not_permitted: "Accès refusé",
    login_to_access: "Connectez-vous pour accéder à cette page.",
    login: "Se connecter",
    no_active_orders: "Aucune commande en cours pour {unit}",
    confirm: "Confirmer",
    serve: "Servir",
    table: "Table",
    takeaway: "À emporter",
    aggregator: "Plateforme",
    aggregator_id: "N° plateforme",
    order: "Commande",
    type_cancelled: "Annulée",
    type_partially_cancelled: "Annulée en partie",
    duplicate_kot: "Ticket en double : vérifiez avec le serveur",
    old_qty: "Ancienne qté = {qty}",
    audio_disabled: "Les alertes sonores sont coupées. Touchez l'écran pour les activer.",
    order_delayed: "Commande en retard",
    invoice: "Facture",
    order_no: "Commande n°",
    time: "Heure",
    table_unknown: "Table ou emporter inconnu",
    online: "Vous êtes en ligne",
    offline: "Vous êtes hors ligne",
    username: "Identifiant",
    password: "Mot de passe",
    sign_in: "Se connecter",
  },
  ar: {
    kitchen: "المطبخ",
    switch_to_dashboard: "الانتقال إلى لوحة التحكم",
    logout: "تسجيل الخروج",
    refresh: "تحديث",
    loading_dashboard: "جارٍ تحميل المطبخ…",
    production_unit: "وحدة الإنتاج",
    active: "قيد التحضير",
    served: "تم تقديمها",
    total: "المجموع",
    open_unit: "اضغط لعرض الطلبات",
    not_permitted: "غير مسموح",
    login_to_access: "سجّل الدخول للوصول إلى هذه الصفحة.",
    login: "تسجيل الدخول",
    no_active_orders: "لا توجد طلبات جارية لـ {unit}",
    confirm: "تأكيد",
    serve: "تقديم",
    table: "الطاولة",
    takeaway: "سفري",
    aggregator: "منصة التوصيل",
    aggregator_id: "رقم المنصة",
    order: "الطلب",
    type_cancelled: "ملغى",
    type_partially_cancelled: "ملغى جزئيا",
    duplicate_kot: "تذكرة مكررة: تحقق مع النادل",
    old_qty: "الكمية السابقة = {qty}",
    audio_disabled: "التنبيهات الصوتية متوقفة. اضغط على الشاشة لتفعيلها.",
    order_delayed: "طلب متأخر",
    invoice: "الفاتورة",
    order_no: "رقم الطلب",
    time: "الوقت",
    table_unknown: "الطاولة أو السفري غير معروف",
    online: "أنت متصل",
    offline: "أنت غير متصل",
    username: "اسم المستخدم",
    password: "كلمة المرور",
    sign_in: "تسجيل الدخول",
  },
};

const base = String(window.restaurant_lang || "en").slice(0, 2);
export const lang = MESSAGES[base] ? base : "en";

export function t(key, params) {
  let text = MESSAGES[lang][key] ?? MESSAGES.en[key] ?? key;
  for (const [name, value] of Object.entries(params || {})) text = text.split(`{${name}}`).join(String(value));
  return text;
}

/** KOT type as shown to the kitchen (the stored value stays URY's English). */
export function kotType(type) {
  if (type === "Cancelled") return t("type_cancelled");
  if (type === "Partially cancelled") return t("type_partially_cancelled");
  return type;
}

export function applyDocumentLanguage() {
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  document.title = t("kitchen");
}
