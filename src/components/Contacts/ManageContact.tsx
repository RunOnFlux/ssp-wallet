import { useState } from 'react';
import { Button, Modal, Input, Space, message } from 'antd';
import { NoticeType } from 'antd/es/message/interface';
import localForage from 'localforage';
import { useTranslation } from 'react-i18next';
import { useAppSelector, useAppDispatch } from '../../hooks';
import { contact } from '../../types';
import { setContacts } from '../../store';

function ManageContact(props: {
  id?: number;
  openAction: (status: boolean) => void;
}) {
  const dispatch = useAppDispatch();
  const { t } = useTranslation(['home', 'common']);
  const { openAction } = props;
  const { activeChain } = useAppSelector((state) => state.sspState);
  const { contacts } = useAppSelector((state) => state.contacts);
  const [messageApi, contextHolder] = message.useMessage();
  const editedContact: contact = contacts[activeChain]?.find(
    (contact) => contact.id === props.id,
  ) ?? {
    id: -1,
    name: '',
    address: '',
  };
  const [contactName, setContactName] = useState<string>(editedContact.name);
  const [contactAddress, setContactAddress] = useState<string>(
    editedContact.address,
  );

  const displayMessage = (type: NoticeType, content: string) => {
    void messageApi.open({
      type,
      content,
    });
  };

  const handleOk = () => {
    try {
      if (!contactName) {
        displayMessage('error', t('home:contacts.err_no_name'));
        return;
      }
      if (!contactAddress) {
        displayMessage('error', t('home:contacts.err_no_address'));
        return;
      }
      const adjustedContact = { ...editedContact };
      adjustedContact.name = contactName;
      adjustedContact.address = contactAddress;
      const newContacts: contact[] = [];
      contacts[activeChain]?.forEach((n) => {
        if (n.id === props.id) {
          newContacts.push(adjustedContact);
        } else {
          newContacts.push(n);
        }
      });
      if (adjustedContact.id === -1) {
        adjustedContact.id = new Date().getTime();
        newContacts.push(adjustedContact);
      }
      // save
      const completeContacts = { ...contacts, [activeChain]: newContacts };
      dispatch(setContacts(completeContacts));
      void (async function () {
        try {
          await localForage.setItem('contacts', completeContacts);
        } catch (error) {
          console.log(error);
        }
      })();
      openAction(true);
    } catch (error) {
      console.log(error);
      displayMessage('error', t('home:contacts.err_saving_contacts'));
    }
  };

  const handleNotOk = () => {
    if (contactName !== editedContact.name) {
      setContactName(editedContact.name);
    }
    if (contactAddress !== editedContact.address) {
      setContactAddress(editedContact.address);
    }
    openAction(false);
  };

  return (
    <>
      {contextHolder}
      <Modal
        title={
          editedContact.id > -1
            ? t('home:contacts.edit_contact')
            : t('home:contacts.add_contact')
        }
        open={true}
        onCancel={handleNotOk}
        style={{ textAlign: 'center', top: 60, width: 200 }}
        footer={[]}
      >
        <br />
        <br />
        <h3>{t('common:name')}</h3>
        <Space.Compact style={{ width: '100%' }}>
          <Input
            size="large"
            placeholder={editedContact.name}
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
          />
        </Space.Compact>
        <h3>{t('common:address')}</h3>
        <Space.Compact style={{ width: '100%' }}>
          <Input
            size="large"
            placeholder={editedContact.address}
            value={contactAddress}
            onChange={(e) => setContactAddress(e.target.value)}
          />
        </Space.Compact>
        <br />
        <br />
        <br />
        <br />
        <Space direction="vertical" size="large">
          <Button type="primary" size="large" onClick={handleOk}>
            {t('common:save')}
          </Button>
          <Button type="link" block size="small" onClick={handleNotOk}>
            {t('common:cancel')}
          </Button>
        </Space>
      </Modal>
    </>
  );
}

ManageContact.defaultProps = {
  id: -1,
};

export default ManageContact;
