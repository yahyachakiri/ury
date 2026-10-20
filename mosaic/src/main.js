import './index.css';
import { createApp, reactive } from "vue";
import App from "./App.vue";

import router from './router';
import { applyDocumentLanguage, kotType, t } from "./i18n";

applyDocumentLanguage();
const app = createApp(App);

// Patch 26: translations in every template ($t, $kotType).
app.config.globalProperties.$t = t;
app.config.globalProperties.$kotType = kotType;

// Plugins
app.use(router);

// Global Properties,
// components can inject this

// Configure route gaurds
router.beforeEach(async (to, from, next) => {
	next();
});

app.mount("#app");
