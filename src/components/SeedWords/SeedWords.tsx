import { Button, Input, Switch, message, ConfigProvider } from 'antd';
import { NoticeType } from 'antd/es/message/interface';
import { t } from 'i18next';
import React, { SetStateAction, useState } from 'react'
import { wordlist } from '@scure/bip39/wordlists/english';

export const SeedWords = (props: {seedWords: (string | undefined)[], setSeedWords: React.Dispatch<SetStateAction<string[]>>}) => {

  const [inputVal, setInputVal] = useState<string>('');
  const [bulkInput, setBulkInput] = useState<boolean>(false);

  const [messageApi, contextHolder] = message.useMessage();
  const displayMessage = (type: NoticeType, content: string) => {
    void messageApi.open({
      type,
      content,
    });
  };

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setInputVal(event.target.value.trim());
  }

  const checkKey = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault();
      updateText();
    }
  }

  const onPress = () => {
    if (inputVal && inputVal != ''){
      updateText();
    }
  };

  function updateText() {
    if (inputVal.length >= 3) {
      if (wordlist.includes(inputVal)) {
        props.setSeedWords((prevSeedWords) => [...(prevSeedWords || []), inputVal]);
        setInputVal('');
      } else {
        displayMessage('warning', t('cr:err_seed_invalid_word'));
      }      
      
    } else{
      displayMessage('error', t('cr:err_seed_word_min_char'));
    }
  }

  const clearText = () => {
    props.setSeedWords([]);
    setInputVal('');
  }

  const removeWord = () => {
    props.setSeedWords((prevSeedWords) => prevSeedWords.slice(0, -1));
    setInputVal('');
  }

  const updateInputType = () =>
  {
    setBulkInput(!bulkInput);
  }

  return (
    <ConfigProvider
      theme={{
        components: {
          Switch: {
            colorPrimary: '#00b96b',
            fontSize: 20,
            algorithm: true,
          }
        },
      }}
    >
      <div>
        <Switch style={{ marginBottom: 10 }} checkedChildren={t('cr:seed_single_entry')} unCheckedChildren={t('cr:seed_bulk_entry')} value={bulkInput} defaultChecked={bulkInput} onChange={updateInputType}/>
        {bulkInput ? (
        <>
          {contextHolder}
          <Input id="seed-input" size='large' value={inputVal} onChange={handleInputChange} onKeyDown={checkKey} placeholder={`${t('cr:input_seed_word')} ${props.seedWords.length + 1}`}/>      
          <Button style={{ margin: 8 }} size='middle' type='primary' onClick={onPress}>{t('cr:submit_seed_word')}</Button>
          <Button style={{ margin: 8 }} size='middle' type='default' onClick={removeWord}>{t('cr:remove_seed_word')}</Button>
          <Button style={{ margin: 8 }} size='middle' type='default' onClick={clearText}>{t('cr:clear_seed')}</Button>
        </>
        ) : null}
      </div>
    </ConfigProvider>
  )
}
