import { Button } from 'antd';
import { useTranslation } from 'react-i18next';
import ContactsTable from './ContactsTable.tsx';
import ManageContact from './ManageContact.tsx';
import { useState } from 'react';
import { useAppSelector } from '../../hooks';
import './Contacts.css';

function Contacts() {
  const { t } = useTranslation(['home']);
  const [addOpen, setAddOpen] = useState(false);
  const { activeChain } = useAppSelector((state) => state.sspState);
  const { contacts } = useAppSelector((state) => state.contacts);
  const hasContacts = (contacts[activeChain] ?? []).length > 0;

  const addContact = () => {
    setAddOpen(true);
  };

  const manageContactAction = () => {
    setAddOpen(false);
  };

  return (
    <div data-tutorial="contacts-table">
      <ContactsTable onAdd={addContact} />
      {/* When the list is empty the branded empty state carries the add
          action — no duplicate button. */}
      {hasContacts && (
        <div className="contacts-actions">
          <Button type="primary" size="middle" onClick={() => addContact()}>
            {t('home:contacts.create_new_contact')}
          </Button>
        </div>
      )}
      {addOpen && <ManageContact openAction={manageContactAction} />}
    </div>
  );
}

export default Contacts;
