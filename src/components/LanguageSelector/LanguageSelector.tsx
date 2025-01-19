import { Select } from 'antd';
import { useTranslation } from 'react-i18next';
import { useState, useEffect, useRef } from 'react';
import localForage from 'localforage';
import * as resources from '../../translations/resources';

function LanguageSelector(props: { label: boolean }) {
  const { i18n } = useTranslation();
  const { t } = useTranslation(['home', 'common']);
  const alreadyMounted = useRef(false); // as of react strict mode, useEffect is triggered twice. This is a hack to prevent that without disabling strict mode
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
    if (alreadyMounted.current) return;
    alreadyMounted.current = true;
    void (async function () {
      // set language
      const language = await localForage.getItem('language');
      if (language && typeof language === 'string') {
        setCurrentLanguage(language);
      }
    })();
  });

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
          { value: 'id', label: 'id', desc: 'Bahasa Indonesia' },
          { value: 'bn', label: 'bn', desc: 'বাংলা' },
          { value: 'cs', label: 'cs', desc: 'Čeština' },
          { value: 'de', label: 'de', desc: 'Deutsch' },
          { value: 'es', label: 'es', desc: 'Español' },
          { value: 'fi', label: 'fi', desc: 'Suomen kieli' },
          { value: 'fil', label: 'fil', desc: 'Filipino' },
          { value: 'fr', label: 'fr', desc: 'Français' },
          { value: 'el', label: 'el', desc: 'Ελληνικά' },
          { value: 'hi', label: 'hi', desc: 'हिन्दी' },
          { value: 'hr', label: 'hr', desc: 'Hrvatski' },
          { value: 'hu', label: 'hu', desc: 'Magyar' },
          { value: 'ja', label: 'ja', desc: '日本語' },
          { value: 'ru', label: 'ru', desc: 'Русский' },
          { value: 'ta', label: 'ta', desc: 'தமிழ்' },
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
