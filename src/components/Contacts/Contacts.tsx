import { Button, Space } from 'antd';
import { useTranslation } from 'react-i18next';
import ContactsTable from './ContactsTable.tsx';
import ManageContact from './ManageContact.tsx';
import { useState } from 'react';

function Contacts() {
  const { t } = useTranslation(['home']);
  const [addOpen, setAddOpen] = useState(false);

  const addContact = () => {
    setAddOpen(true);
  };

  const manageContactAction = () => {
    setAddOpen(false);
  };

  return (
    <div data-tutorial="contacts-table">
      <ContactsTable />
      <Space size={'large'} style={{ marginTop: 16, marginBottom: 8 }}>
        <Button type="primary" size="middle" onClick={() => addContact()}>
          {t('home:contacts.create_new_contact')}
        </Button>
      </Space>
      {addOpen && <ManageContact openAction={manageContactAction} />}
    </div>
  );
}

export default Contacts;
