import { useState } from 'react';
import { toast } from '../../lib/toast';
import { Button, Modal, Input } from 'antd';
import { NoticeType } from 'antd/es/message/interface';
import localForage from 'localforage';
import { useTranslation } from 'react-i18next';
import { useAppSelector, useAppDispatch } from '../../hooks';
import { contact } from '../../types';
import { setContacts } from '../../store';

interface Props {
  openAction: (status: boolean) => void;
  contactId?: number;
}

function ManageContact({ openAction, contactId = -1 }: Props) {
  const dispatch = useAppDispatch();
  const { t } = useTranslation(['home', 'common']);
  const { activeChain } = useAppSelector((state) => state.sspState);
  const { contacts } = useAppSelector((state) => state.contacts);
  const editedContact: contact = contacts[activeChain]?.find(
    (contact) => contact.id === contactId,
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
    void toast.open({
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
        if (n.id === contactId) {
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
      <Modal
        title={
          editedContact.id > -1
            ? t('home:contacts.edit_contact')
            : t('home:contacts.add_contact')
        }
        open={true}
        onCancel={handleNotOk}
        footer={[]}
      >
        <div className="manage-contact-form">
          <label className="manage-contact-label" htmlFor="contact-name">
            {t('common:name')}
          </label>
          <Input
            id="contact-name"
            size="large"
            placeholder={editedContact.name || t('common:name')}
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
          />
          <label className="manage-contact-label" htmlFor="contact-address">
            {t('common:address')}
          </label>
          <Input
            id="contact-address"
            size="large"
            placeholder={editedContact.address || t('common:address')}
            value={contactAddress}
            onChange={(e) => setContactAddress(e.target.value)}
          />
        </div>
        <div className="manage-contact-footer">
          <Button type="primary" size="large" block onClick={handleOk}>
            {t('common:save')}
          </Button>
          <Button type="link" block size="small" onClick={handleNotOk}>
            {t('common:cancel')}
          </Button>
        </div>
      </Modal>
    </>
  );
}

export default ManageContact;
