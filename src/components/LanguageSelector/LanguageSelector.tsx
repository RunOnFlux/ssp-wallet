import { Select } from 'antd';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import localForage from 'localforage';

function LanguageSelector(props: { label: boolean }) {
  const { i18n } = useTranslation();
  const [currentLanguage, setCurrentLanguage] = useState(i18n.language);
  console.log(i18n.languages);
  console.log(i18n);

  const handleChange = async (value: string) => {
    console.log(`selected ${value}`);
    await i18n.changeLanguage(value);
    await localForage.setItem('language', value);
    setCurrentLanguage(value);
  };

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
        ]}
        optionRender={(option) => <>{option.data.desc}</>}
      />
    </>
  );
}

export default LanguageSelector;
