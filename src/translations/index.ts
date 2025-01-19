import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as resources from './resources';

const ns = Object.keys(Object.values(resources)[0]);
export const defaultNS = ns[0];

let lng = navigator.language.split('-')[0];

// check if lng is in resources, if not, set to en
if (!Object.keys(resources).includes(lng)) {
  lng = 'en';
}

void i18n.use(initReactI18next).init({
  ns,
  defaultNS,
  resources: {
    ...Object.entries(resources).reduce(
      (acc, [key, value]) => ({
        ...acc,
        [key]: value,
      }),
      {},
    ),
  },
  lng,
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false, // not needed for react as it escapes by default
  },
  compatibilityJSON: 'v4',
});

export default i18n;
