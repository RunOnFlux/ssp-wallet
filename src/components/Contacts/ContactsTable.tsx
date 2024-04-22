import { Table, Empty, message, Flex, Popconfirm, Button } from 'antd';
import { NoticeType } from 'antd/es/message/interface';
import { QuestionCircleOutlined } from '@ant-design/icons';
import { useEffect, useState } from 'react';
import localForage from 'localforage';
const { Column } = Table;
import './Contacts.css';
import { useTranslation } from 'react-i18next';
import ManageContact from './ManageContact.tsx';
import { useAppSelector, useAppDispatch } from '../../hooks';
import { contact } from '../../types';
import { setContacts } from '../../store';

// name, ip, tier, status
function ContactsTable() {
  const dispatch = useAppDispatch();
  const { t } = useTranslation(['home', 'common']);
  const { activeChain } = useAppSelector((state) => state.sspState);
  const { contacts } = useAppSelector((state) => state.contacts);
  const [contactsByName, setContactsByName] = useState(contacts[activeChain]);
  const [manageOpen, setManageOpen] = useState(false);
  const [manageContactId, setManageContactId] = useState<number>(-1);

  const [messageApi, contextHolder] = message.useMessage();
  const displayMessage = (type: NoticeType, content: string) => {
    void messageApi.open({
      type,
      content,
    });
  };

  useEffect(() => {
    setManageOpen(manageContactId !== -1);
  }, [manageContactId]);

  const editContact = (id: number) => {
    setManageContactId(id);
  };

  const deleteContact = (id: number) => {
    const adjustedChainContacts: contact[] = [];
    contacts[activeChain]?.forEach((contact: contact) => {
      if (contact.id !== id) {
        adjustedChainContacts.push(contact);
      }
    });

    const completeContacts = {
      ...contacts,
      [activeChain]: adjustedChainContacts,
    };

    // save
    dispatch(setContacts(completeContacts));
    void (async function () {
      try {
        await localForage.setItem('contacts', completeContacts);
      } catch (error) {
        console.log(error);
      }
    })();
    console.log('delete contact', id);
  };

  // on chain change and on load, sort contacts and set it
  useEffect(() => {
    console.log(contacts[activeChain]);
    const contactsCopy = [...contacts[activeChain]] || [];
    const sortedContacts = contactsCopy.sort((a, b) => {
      if (a.name > b.name) return 1;
      else if (a.name < b.name) return -1;
      else return 0;
    });
    setContactsByName(sortedContacts);
  }, [contacts, activeChain]);

  const manageContactAction = (status: boolean) => {
    setManageOpen(false);
    setManageContactId(-1);
    if (status === true) {
      displayMessage('success', t('home:contacts.contacts_updated'));
    }
  };

  const renderAddress = (name: string) => {
    if (name.length > 16)
      return (
        <>
          {name.substring(0, 7)}...{name.substring(name.length - 6) || '---'}
        </>
      );

    return <>{name || '---'}</>;
  };

  const renderName = (name: string, record: contact) => {
    return (
      <>
        {name ||
          new Date(record.id).toLocaleTimeString() +
            ' ' +
            new Date(record.id).toLocaleDateString()}
      </>
    );
  };

  return (
    <>
      {contextHolder}
      <Table
        className="adjustedWidth"
        locale={{
          emptyText: (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={<span>{t('home:contacts.no_contacts')}</span>}
            />
          ),
        }}
        pagination={false}
        showHeader={false}
        rowKey="address"
        bordered={false}
        loading={false}
        dataSource={contactsByName}
        expandable={{
          showExpandColumn: false,
          expandedRowRender: (record) => (
            <div>
              <p style={{ margin: 0, wordBreak: 'break-all' }}>
                {t('common:name')}:{' '}
                {record.name ||
                  new Date(record.id).toLocaleTimeString() +
                    ' ' +
                    new Date(record.id).toLocaleDateString()}
              </p>
              <p style={{ wordBreak: 'break-all' }}>
                {t('common:address')}: {record.address}
              </p>
              <p
                style={{
                  marginBottom: 20,
                  wordBreak: 'break-all',
                  fontSize: 10,
                }}
              >
                {t('home:contacts.created_at')}{' '}
                {new Date(record.id).toLocaleTimeString() +
                  ' ' +
                  new Date(record.id).toLocaleDateString()}
              </p>
              <Flex gap="small">
                <Button size="middle" onClick={() => editContact(record.id)}>
                  {t('common:edit')}
                </Button>
                <Popconfirm
                  title={t('home:contacts.delete_contact')}
                  overlayStyle={{ maxWidth: 360, margin: 10 }}
                  okText={t('common:delete')}
                  cancelText={t('common:cancel')}
                  onConfirm={() => {
                    void deleteContact(record.id);
                  }}
                  icon={<QuestionCircleOutlined style={{ color: 'orange' }} />}
                >
                  <Button size="middle">{t('common:delete')}</Button>
                </Popconfirm>
              </Flex>
            </div>
          ),
          expandRowByClick: true,
        }}
      >
        <Column
          title={t('common:name')}
          dataIndex="name"
          className="contact-name"
          render={(name: string, row: contact) => renderName(name, row)}
        />
        <Column
          title={t('common:address')}
          dataIndex="address"
          className="contact-address"
          render={(name: string) => renderAddress(name)}
        />
      </Table>
      {manageOpen && (
        <ManageContact openAction={manageContactAction} id={manageContactId} />
      )}
    </>
  );
}

export default ContactsTable;
