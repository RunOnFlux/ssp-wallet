import { Select } from 'antd';
import { useTranslation } from 'react-i18next';
import { useState, useEffect, useRef } from 'react';
import localForage from 'localforage';

function LanguageSelector(props: { label: boolean }) {
  const { i18n } = useTranslation();
  const alreadyMounted = useRef(false); // as of react strict mode, useEffect is triggered twice. This is a hack to prevent that without disabling strict mode
  const [currentLanguage, setCurrentLanguage] = useState(i18n.language);
  console.log(i18n.languages);
  console.log(i18n);

  const handleChange = async (value: string): Promise<void> => {
    console.log(`selected ${value}`);
    await i18n.changeLanguage(value);
    await localForage.setItem('language', value);
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
          { value: 'ru', label: 'ru', desc: 'Русский' },
          { value: 'id', label: 'id', desc: 'Bahasa Indonesia' },
          { value: 'cs', label: 'cs', desc: 'Čeština' },
          { value: 'ph', label: 'ph', desc: 'Filipino' },
        ]}
        optionRender={(option) => <>{option.data.desc}</>}
      />
    </>
  );
}

export default LanguageSelector;
