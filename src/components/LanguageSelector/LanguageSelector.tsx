import { Select } from 'antd';
import { useTranslation } from 'react-i18next';
import { useState, useEffect } from 'react';
import localForage from 'localforage';
import * as resources from '../../translations/resources';

function LanguageSelector(props: { label: boolean }) {
  const { i18n } = useTranslation();
  const { t } = useTranslation(['home', 'common']);
  const [currentLanguage, setCurrentLanguage] = useState(i18n.language);
  console.log(i18n.languages);
  console.log(i18n);

  const handleChange = async (value: string): Promise<void> => {
    let lng = value;
    if (value === 'system') {
      lng = navigator.language.split('-')[0];
    }
    await i18n.changeLanguage(lng);
    await localForage.setItem('language', lng);
    setCurrentLanguage(value);
  };

  useEffect(() => {
    void (async function () {
      // set language
      const language = await localForage.getItem('language');
      if (language && typeof language === 'string') {
        setCurrentLanguage(language);
      }
    })();
  }, []);

  return (
    <>
      <Select
        popupMatchSelectWidth={false}
        suffixIcon={props.label ? undefined : null}
        variant={'outlined'}
        value={currentLanguage}
        optionLabelProp={props.label ? 'desc' : 'label'}
        onChange={handleChange}
        style={{ width: 'fit-content' }}
        dropdownStyle={{ minWidth: '130px' }}
        options={[
          { value: 'en', label: 'en', desc: 'English' },
          { value: 'af', label: 'af', desc: 'Afrikaans' },
          { value: 'id', label: 'id', desc: 'Bahasa Indonesia' },
          { value: 'ms', label: 'ms', desc: 'Bahasa Melayu' },
          { value: 'ca', label: 'ca', desc: 'Català' },
          { value: 'bg', label: 'bg', desc: 'Български' },
          { value: 'bn', label: 'bn', desc: 'বাংলা' },
          { value: 'zh', label: 'zh', desc: '简体中文' },
          { value: 'zh_TW', label: 'zh_TW', desc: '繁体中文' },
          { value: 'cs', label: 'cs', desc: 'Čeština' },
          { value: 'de', label: 'de', desc: 'Deutsch' },
          { value: 'nl', label: 'nl', desc: 'Dutch' },
          { value: 'es', label: 'es', desc: 'Español' },
          { value: 'fi', label: 'fi', desc: 'Suomen kieli' },
          { value: 'sl', label: 'sl', desc: 'Slovenščina' },
          { value: 'fil', label: 'fil', desc: 'Filipino' },
          { value: 'fr', label: 'fr', desc: 'Français' },
          { value: 'el', label: 'el', desc: 'Ελληνικά' },
          { value: 'hi', label: 'hi', desc: 'हिन्दी' },
          { value: 'hr', label: 'hr', desc: 'Hrvatski' },
          { value: 'it', label: 'it', desc: 'Italiano' },
          { value: 'ko', label: 'ko', desc: '한국어' },
          { value: 'hu', label: 'hu', desc: 'Magyar' },
          { value: 'no', label: 'no', desc: 'Norwegian' },
          { value: 'ja', label: 'ja', desc: '日本語' },
          { value: 'pl', label: 'pl', desc: 'Polish' },
          { value: 'pt', label: 'pt', desc: 'Português' },
          { value: 'ru', label: 'ru', desc: 'Русский' },
          { value: 'ro', label: 'ro', desc: 'Romanian' },
          { value: 'sk', label: 'sk', desc: 'Slovak' },
          { value: 'sv', label: 'sv', desc: 'Swedish' },
          { value: 'uk', label: 'uk', desc: 'Українська' },
          { value: 'ta', label: 'ta', desc: 'தமிழ்' },
          { value: 'th', label: 'th', desc: 'ไทย' },
          { value: 'vi', label: 'vi', desc: 'Tiếng Việt' },
          ...(Object.keys(resources).includes(navigator.language.split('-')[0])
            ? [
                {
                  value: 'system',
                  label: navigator.language.split('-')[0],
                  desc: `${t('home:settings.use_system_language')}`,
                },
              ]
            : []),
        ]}
        optionRender={(option) => <>{option.data.desc}</>}
      />
    </>
  );
}

export default LanguageSelector;
